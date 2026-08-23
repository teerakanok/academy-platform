import { describe, expect, it, vi } from 'vitest'
import { evaluateProductionAdmissionEvidence } from '@/lib/identity/production-admission-evidence'

const CANDIDATE = 'academy-release-20260823'
const HASHES = 'abcdef01'.split('').map((value) => value.repeat(64))

type Gate = {
  gate: string
  candidateId: string
  accepted: boolean
  artifactPath: string
  artifactSha256: string
  entries?: Array<{ migrationId: string; artifactPath: string; artifactSha256: string }>
}

function gate(name: string, index: number): Gate {
  return {
    gate: name,
    candidateId: CANDIDATE,
    accepted: true,
    artifactPath: `reports/release/${name}.json`,
    artifactSha256: HASHES[index],
  }
}

function packet() {
  return {
    candidateId: CANDIDATE,
    evidence: [
      gate('sourceRevision', 0),
      {
        ...gate('migrationInventory', 1),
        entries: [
          { migrationId: '0027_sessions', artifactPath: 'migrations/0027.sql', artifactSha256: HASHES[2] },
          { migrationId: '0028_release', artifactPath: 'migrations/0028.sql', artifactSha256: HASHES[3] },
        ],
      },
      gate('runtimeConfigProjection', 2),
      gate('visualEvidenceIndex', 3),
      gate('operatorAuthorizationReceipt', 4),
      gate('deployedSmokeResult', 5),
      gate('rollbackRehearsal', 6),
      gate('freezeManifest', 7),
    ],
  }
}

describe('production admission evidence', () => {
  it('admits an exact evidence packet only for a separate authorized operation', () => {
    const decision = evaluateProductionAdmissionEvidence(packet())

    expect(decision).toMatchObject({
      status: 'admissible_for_authorized_operation',
      candidateId: CANDIDATE,
      evidence: {
        sourceRevision: { artifactPath: 'reports/release/sourceRevision.json' },
        operatorAuthorizationReceipt: {
          artifactPath: 'reports/release/operatorAuthorizationReceipt.json',
        },
      },
    })
    expect(decision).not.toHaveProperty('productionReady')
    expect(Object.isFrozen(decision)).toBe(true)
  })

  it.each([
    ['missing gate', (value: ReturnType<typeof packet>) => value.evidence.splice(3, 1)],
    ['duplicate gate', (value: ReturnType<typeof packet>) => value.evidence.push({ ...value.evidence[0] })],
    ['reordered gates', (value: ReturnType<typeof packet>) => value.evidence.reverse()],
    ['sparse evidence', (value: ReturnType<typeof packet>) => Reflect.deleteProperty(value.evidence, '2')],
    ['extra packet field', (value: ReturnType<typeof packet>) => Object.assign(value, { readiness: true })],
    ['different candidate', (value: ReturnType<typeof packet>) => { value.evidence[3].candidateId = 'other' }],
    ['unaccepted gate', (value: ReturnType<typeof packet>) => { value.evidence[5].accepted = false }],
    ['empty migrations', (value: ReturnType<typeof packet>) => { value.evidence[1].entries = [] }],
    ['duplicate migration', (value: ReturnType<typeof packet>) => {
      value.evidence[1].entries = [value.evidence[1].entries![0], value.evidence[1].entries![0]]
    }],
    ['migration artifact reused by another gate', (value: ReturnType<typeof packet>) => {
      value.evidence[1].entries![0].artifactPath = value.evidence[0].artifactPath
    }],
    ['unordered migrations', (value: ReturnType<typeof packet>) => value.evidence[1].entries!.reverse()],
    ['extra gate field', (value: ReturnType<typeof packet>) => Object.assign(value.evidence[2], { note: 'claim' })],
    ['inherited packet', (value: ReturnType<typeof packet>) => Object.setPrototypeOf(value, { ready: true })],
    ['symbol field', (value: ReturnType<typeof packet>) => Object.assign(value, { [Symbol('claim')]: true })],
  ])('rejects %s', (_label, mutate) => {
    const value = packet()
    mutate(value)
    expect(evaluateProductionAdmissionEvidence(value)).toEqual({ status: 'rejected' })
  })

  it.each([
    ['absolute path', '/reports/release/source.json'],
    ['traversal', 'reports/../source.json'],
    ['URL', 'https://academy.example/source.json'],
    ['backslash', 'reports\\source.json'],
    ['empty segment', 'reports//source.json'],
  ])('rejects %s artifact paths', (_label, artifactPath) => {
    const value = packet()
    value.evidence[0].artifactPath = artifactPath
    expect(evaluateProductionAdmissionEvidence(value)).toEqual({ status: 'rejected' })
  })

  it.each([
    ['uppercase', 'A'.repeat(64)],
    ['short', 'a'.repeat(63)],
    ['non-hex', `${'a'.repeat(63)}g`],
  ])('rejects %s digests', (_label, artifactSha256) => {
    const value = packet()
    value.evidence[0].artifactSha256 = artifactSha256
    expect(evaluateProductionAdmissionEvidence(value)).toEqual({ status: 'rejected' })
  })

  it.each([
    ['boolean', { operatorAuthorized: true }],
    ['role', { operatorRole: 'release-manager' }],
    ['timestamp', { authorizedAt: '2026-08-23T00:00:00Z' }],
    ['claim', { operatorClaim: 'approved' }],
  ])('rejects a valid-looking operator %s without the exact receipt', (_label, substitute) => {
    const value = packet()
    value.evidence[4] = Object.assign({
      gate: 'operatorAuthorizationReceipt',
      candidateId: CANDIDATE,
      accepted: true,
      artifactSha256: HASHES[4],
    }, substitute) as unknown as Gate
    expect(evaluateProductionAdmissionEvidence(value)).toEqual({ status: 'rejected' })
  })

  it('does not invoke accessors', () => {
    const value = packet()
    const getter = vi.fn(() => true)
    Object.defineProperty(value.evidence[2], 'accepted', { enumerable: true, get: getter })

    expect(evaluateProductionAdmissionEvidence(value)).toEqual({ status: 'rejected' })
    expect(getter).not.toHaveBeenCalled()
  })

  it('isolates and deeply freezes the accepted snapshot', () => {
    const value = packet()
    const decision = evaluateProductionAdmissionEvidence(value)
    expect(decision.status).toBe('admissible_for_authorized_operation')
    if (decision.status === 'rejected') throw new Error('unexpected rejection')

    value.candidateId = 'changed'
    value.evidence[0].artifactPath = 'reports/release/changed.json'
    value.evidence[1].entries![0].artifactSha256 = HASHES[7]

    expect(decision.candidateId).toBe(CANDIDATE)
    expect(decision.evidence.sourceRevision.artifactPath).toBe('reports/release/sourceRevision.json')
    expect(decision.evidence.migrationInventory.entries[0].artifactSha256).toBe(HASHES[2])
    expect(Object.isFrozen(decision.evidence)).toBe(true)
    expect(Object.isFrozen(decision.evidence.migrationInventory.entries[0])).toBe(true)
  })
})
