import assert from 'node:assert/strict'
import { chmod, link, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { IdentityLiveReadinessIntakeError, intakeIdentityLiveReadiness, readProtectedIdentityLiveReadiness } from './identity-live-readiness-intake.mjs'
import { verifyIdentityProductionAuthority } from './verify-identity-production-authority.mjs'

const NOW = new Date('2026-08-29T03:10:00.000Z')
const D = 'a'.repeat(64)
const AUTHORITY = await verifyIdentityProductionAuthority(NOW)


function valid() {
  return {
    schema: 'identity-control-live-readiness/v1', observedAt: '2026-08-29T03:05:01.000Z',
    releaseSha: '2951f5dc4433f4a20a7b7da3bde9110ae907531c',
    runtimeSha256: 'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d',
    freezeSha256: 'ef86b70e426bc8fd8bda4a9d85e502f10bb22539bb8ad9832a01989450671683',
    keySetSha256: 'd6b557027823437a5fe6378fc26bbd8dffad2d8c58a77c2bcf3583f1350e8e35',
    artifacts: {
      accountCenter: { bytes: 266240, path: 'ac.tar', sha256: '3227c635dbc9235d1861f133615ed2b761351df50f7c3b93c924b088524759f8' },
      api: { bytes: 10137600, path: 'api.tar', sha256: 'f80cd4a87d451c5ec36e90d7d2e7db76a62f6480b78a3a3bcfd0dce91b4926e1' },
    },
    activeKeyIds: ['academy-prod-2026-08','identity-result-prod-2026-08'], overlapKeyIds: [],
    registry: {
      academyClient: { clientId: 'academy-web', serviceId: 'academy', enabled: true, keyId: 'academy-prod-2026-08', reference: 'config://client-keys/academy-web/academy-prod-2026-08' },
      resultSigning: { keyId: 'identity-result-prod-2026-08', issuer: 'https://accounts.cyberskills.co.th/v1/code/results', revision: 1, state: 'active' },
    },
    production: { mutationStatus: 'COMPLETE', mutationCounters: { bootstrapClientsAdopted: 1, bootstrapClientsCreated: 0, caddyReloads: 1, migrationsApplied: 1, releasesActivated: 1, servicesStarted: 1 } },
    evidence: { freezeSha256: 'ef86b70e426bc8fd8bda4a9d85e502f10bb22539bb8ad9832a01989450671683', runtimeSha256: 'f96a89c5c275fb6e80606f54323d26c8e5d98697b12d2bee917046dea3c61e4d', keySetSha256: 'd6b557027823437a5fe6378fc26bbd8dffad2d8c58a77c2bcf3583f1350e8e35', deploymentModeSha256: D, preflightGoSha256: '7c1c4c2f67a38ef4c89516390d731f0c069e9c4e880ead0ed47653b23888cd13', deployReceiptsSha256: '62200ac739af2c17bf7b7d51a1e7154ab8c001c23ace7d7fd4f8cfdcea9b6ff3', verifyReceiptsSha256: D, registrySha256: D, healthSha256: D, independentReviewSha256: D },
    readiness: { deploy: 'GO', verify: 'GO', registry: 'ACTIVE', localReadyStatus: 200, publicReadyStatus: 403, publicReadyBlocked: true },
    capturedAt: '2026-08-29T03:05:00.000Z', expiresAt: '2026-08-29T03:20:00.000Z',
    independentReview: { verdict: 'PASS', reviewer: 'independent-reviewer', counts: { critical: 0, high: 0, medium: 0, low: 0 } },
  }
}

const wire = (value) => `${JSON.stringify(value)}\n`

describe('Identity live readiness intake', () => {
  test('accepts the exact fresh producer receipt and returns a frozen redacted gate', () => {
    const result = intakeIdentityLiveReadiness(wire(valid()), NOW, AUTHORITY)
    assert.equal(result.status, 'IDENTITY_LIVE_READY')
    assert.equal(result.registry, 'ACTIVE')
    assert.equal(result.resultSigning, 'ACTIVE')
    assert.equal(result.productionMutation, false)
    assert.match(result.receiptSha256, /^[a-f0-9]{64}$/)
    assert.equal(Object.isFrozen(result), true)
    assert.equal(JSON.stringify(result).includes('artifacts'), false)
  })

  test('rejects duplicate, surplus, reordered, stale, future, and expired receipts', () => {
    const surplus = valid(); surplus.extra = true
    const reordered = { ...valid() }; const schema = reordered.schema; delete reordered.schema; reordered.schema = schema
    const stale = valid(); stale.capturedAt = '2026-08-29T02:54:59.000Z'
    const future = valid(); future.observedAt = '2026-08-29T03:11:01.000Z'
    const expired = valid(); expired.expiresAt = '2026-08-29T03:09:59.000Z'
    const inverted = valid(); inverted.expiresAt = '2026-08-29T03:04:59.000Z'
    for (const source of ['{"schema":"identity-control-live-readiness/v1","schema":"shadow"}', wire(surplus), wire(reordered), wire(stale), wire(future), wire(expired), wire(inverted)]) {
      assert.throws(() => intakeIdentityLiveReadiness(source, NOW, AUTHORITY), IdentityLiveReadinessIntakeError)
    }
  })

  test('rejects every noncanonical producer wire spelling', () => {
    const canonical = wire(valid())
    for (const source of [
      canonical.slice(0, -1),
      `\ufeff${canonical}`,
      ` ${canonical}`,
      `${canonical}\n`,
      canonical.replace('{', '{ '),
      canonical.replace(',', ', '),
      canonical.replace(':', ': '),
    ]) assert.throws(() => intakeIdentityLiveReadiness(source, NOW, AUTHORITY), IdentityLiveReadinessIntakeError)
  })

  test('rejects every authority, digest, registry, signing, health, and review substitution', () => {
    const mutations = [
      (v) => { v.releaseSha = 'b'.repeat(40) }, (v) => { v.runtimeSha256 = D },
      (v) => { v.activeKeyIds.reverse() }, (v) => { v.overlapKeyIds = ['academy-prod-2026-08'] },
      (v) => { v.artifacts.api.sha256 = D }, (v) => { v.registry.academyClient.enabled = false }, (v) => { v.registry.academyClient.reference = 'config://client-keys/academy-web/other' },
      (v) => { v.registry.resultSigning.state = 'overlap' }, (v) => { v.production.mutationCounters.releasesActivated = 0 },
      (v) => { v.evidence.runtimeSha256 = D }, (v) => { v.readiness.registry = 'PENDING' },
      (v) => { v.evidence.deployReceiptsSha256 = D }, (v) => { v.evidence.preflightGoSha256 = D },
      (v) => { v.readiness.localReadyStatus = 503 }, (v) => { v.readiness.publicReadyStatus = 200 },
      (v) => { v.independentReview.verdict = 'PENDING' }, (v) => { v.independentReview.counts.medium = 1 },
    ]
    for (const mutate of mutations) {
      const value = valid(); mutate(value)
      assert.throws(() => intakeIdentityLiveReadiness(wire(value), NOW, AUTHORITY), IdentityLiveReadinessIntakeError)
    }
  })

  test('rejects the prior release and every mixed old/new artifact bundle', () => {
    const old = valid()
    old.releaseSha = '4acde50e93285e86171fa4713d4d1c390258c16e'
    old.freezeSha256 = 'aa45a35f3e2d0bf171c6129aef2390a94ab91acf34137bb34685dce4273d5dca'
    old.evidence.freezeSha256 = old.freezeSha256
    old.artifacts.api = { bytes: 10127360, path: 'api.tar', sha256: '6e1e9e5b140a977d3799c8677649236a25f76d05bad71de288f6d7eeff4f469c' }

    const mutations = [
      (value) => { value.releaseSha = old.releaseSha },
      (value) => { value.freezeSha256 = old.freezeSha256; value.evidence.freezeSha256 = old.freezeSha256 },
      (value) => { value.artifacts.api = old.artifacts.api },
    ]
    assert.throws(() => intakeIdentityLiveReadiness(wire(old), NOW, AUTHORITY), IdentityLiveReadinessIntakeError)
    for (const mutate of mutations) {
      const mixed = valid(); mutate(mixed)
      assert.throws(() => intakeIdentityLiveReadiness(wire(mixed), NOW, AUTHORITY), IdentityLiveReadinessIntakeError)
    }
  })

  test('rejects authority hash drift and an expected object not derived from signed source', () => {
    const badHash = Object.freeze({ ...AUTHORITY, sha256: D })
    assert.throws(() => intakeIdentityLiveReadiness(wire(valid()), NOW, badHash), IdentityLiveReadinessIntakeError)
    const expected = structuredClone(AUTHORITY.expected)
    expected.artifacts.api.bytes += 1
    const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value) } }
    freeze(expected)
    const detached = Object.freeze({ ...AUTHORITY, expected })
    assert.throws(() => intakeIdentityLiveReadiness(wire(valid()), NOW, detached), IdentityLiveReadinessIntakeError)
  })

  test('reads only one caller-owned mode-0600 regular file with one link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'academy-identity-live-intake-'))
    const receipt = join(root, 'receipt.json')
    const alias = join(root, 'receipt.alias')
    const symbolic = join(root, 'receipt.symlink')
    try {
      await writeFile(receipt, wire(valid()), { mode: 0o600 })
      const canonicalReceipt = await realpath(receipt)
      assert.equal(await readProtectedIdentityLiveReadiness(canonicalReceipt), wire(valid()))
      await chmod(receipt, 0o644)
      await assert.rejects(readProtectedIdentityLiveReadiness(canonicalReceipt), IdentityLiveReadinessIntakeError)
      await chmod(receipt, 0o600)
      await link(receipt, alias)
      await assert.rejects(readProtectedIdentityLiveReadiness(canonicalReceipt), IdentityLiveReadinessIntakeError)
      await rm(alias)
      await symlink(receipt, symbolic)
      await assert.rejects(readProtectedIdentityLiveReadiness(symbolic), IdentityLiveReadinessIntakeError)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
