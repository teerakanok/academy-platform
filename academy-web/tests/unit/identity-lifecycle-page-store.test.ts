import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityLifecycleEvent } from '@/lib/identity/lifecycle-envelope-verifier'
import {
  AcademyIdentityLifecyclePageStore,
  buildIdentityLifecyclePageCommit,
  type IdentityLifecycleConsumerSnapshot,
  type IdentityLifecycleLeasedPageStore,
  type IdentityLifecycleRpcClient,
} from '@/lib/identity/lifecycle-page-store'

const ISSUER = 'https://accounts.example.test/auth/v1'

function event(
  subject: string,
  state: IdentityLifecycleEvent['state'],
  revision: number,
): IdentityLifecycleEvent {
  return {
    eventId: `00000000-0000-4000-8000-${revision.toString().padStart(12, '0')}`,
    kind: 'account.lifecycle.changed',
    issuer: ISSUER,
    subject,
    state,
    revision,
    occurredAt: `2026-08-09T03:${revision.toString().padStart(2, '0')}:00.000Z`,
    reason: `account_${state}`,
  }
}

function readySnapshot(
  cursor: string | null = '1',
  subject = 'learner-a',
): IdentityLifecycleConsumerSnapshot {
  return {
    cursor,
    configuration: { approvedRevision: 1, health: { status: 'ready' } },
    projections: [{
      current: { issuer: ISSUER, subject, state: 'active', revision: 1 },
      health: { status: 'ready' },
      highestKnownRevision: 1,
    }],
  }
}

function fixtureSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function wireSnapshot(snapshot: IdentityLifecycleConsumerSnapshot) {
  return {
    cursor: snapshot.cursor,
    configuration: structuredClone(snapshot.configuration),
    projections: snapshot.projections.map((projection) => ({
      current: {
        issuer: projection.current.issuer,
        subjectKey: fixtureSubjectKey(projection.current.subject),
        state: projection.current.state,
        revision: projection.current.revision,
      },
      health: projection.health.status === 'gap'
        ? {
            status: 'gap',
            observed: {
              issuer: projection.health.observed.issuer,
              subjectKey: fixtureSubjectKey(projection.health.observed.subject),
              state: projection.health.observed.state,
              revision: projection.health.observed.revision,
            },
          }
        : structuredClone(projection.health),
      highestKnownRevision: projection.highestKnownRevision,
    })),
  }
}

describe('Academy Identity lifecycle page-store boundary', () => {
  it('exposes no unfenced commit through the concrete production store or source', () => {
    type RuntimePortExposesUnfencedCommit =
      'commitPage' extends keyof IdentityLifecycleLeasedPageStore ? true : false
    type ConcreteStoreExposesUnfencedCommit =
      'commitPage' extends keyof AcademyIdentityLifecyclePageStore ? true : false
    const runtimePortExposesUnfencedCommit: RuntimePortExposesUnfencedCommit = false
    const concreteStoreExposesUnfencedCommit: ConcreteStoreExposesUnfencedCommit = false
    const store = new AcademyIdentityLifecyclePageStore({
      rpc: async () => ({ data: null, error: null }),
    })
    const productionSource = readFileSync(
      new URL('../../src/lib/identity/lifecycle-page-store.ts', import.meta.url),
      'utf8',
    )

    expect(runtimePortExposesUnfencedCommit).toBe(false)
    expect(concreteStoreExposesUnfencedCommit).toBe(false)
    expect('commitPage' in store).toBe(false)
    expect(productionSource).not.toMatch(
      /['"]commit_identity_lifecycle_page['"]/
    )
  })

  it('builds an empty initial page and seeds two principals without a user record', () => {
    expect(buildIdentityLifecyclePageCommit(null, {
      nextCursor: null,
      configRevision: 1,
      events: [],
    }, 1)).toEqual({
      expectedCursor: null,
      nextCursor: null,
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: [],
    })

    const incoming = [event('learner-b', 'active', 4), event('learner-a', 'disabled', 2)]
    const commit = buildIdentityLifecyclePageCommit(null, {
      nextCursor: '2',
      configRevision: 1,
      events: incoming,
    }, 1)

    expect(commit.projections).toEqual([
      {
        current: { issuer: ISSUER, subject: 'learner-a', state: 'disabled', revision: 2 },
        health: { status: 'ready' },
        highestKnownRevision: 2,
      },
      {
        current: { issuer: ISSUER, subject: 'learner-b', state: 'active', revision: 4 },
        health: { status: 'ready' },
        highestKnownRevision: 4,
      },
    ])
    expect(commit.projections[0]?.current).not.toBe(incoming[1])
  })

  it('reduces multiple events for one principal in page order to one final update', () => {
    const commit = buildIdentityLifecyclePageCommit(readySnapshot(), {
      nextCursor: '3',
      configRevision: 1,
      events: [event('learner-a', 'disabled', 2), event('learner-a', 'active', 3)],
    }, 1)

    expect(commit.projections).toEqual([{
      current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 3 },
      health: { status: 'ready' },
      highestKnownRevision: 3,
    }])
  })

  it('preserves applied state for duplicate and stale events', () => {
    const snapshot = readySnapshot('3')
    snapshot.projections[0] = {
      current: { issuer: ISSUER, subject: 'learner-a', state: 'disabled', revision: 3 },
      health: { status: 'ready' },
      highestKnownRevision: 3,
    }
    const before = structuredClone(snapshot)

    const commit = buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '5',
      configRevision: 1,
      events: [event('learner-a', 'active', 2), event('learner-a', 'disabled', 3)],
    }, 1)

    expect(commit.projections).toEqual(snapshot.projections)
    expect(commit.projections[0]).not.toBe(snapshot.projections[0])
    expect(snapshot).toEqual(before)
  })

  it('latches a gap, preserves current state, and fences later observations', () => {
    const gap = buildIdentityLifecyclePageCommit(readySnapshot(), {
      nextCursor: '2',
      configRevision: 1,
      events: [event('learner-a', 'disabled', 3)],
    }, 1)
    expect(gap.projections).toEqual([{
      current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 1 },
      health: {
        status: 'gap',
        observed: { issuer: ISSUER, subject: 'learner-a', state: 'disabled', revision: 3 },
      },
      highestKnownRevision: 3,
    }])

    const snapshot = readySnapshot('2')
    snapshot.projections = structuredClone(gap.projections)
    const fenced = buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '3',
      configRevision: 1,
      events: [event('learner-a', 'disabled', 4)],
    }, 1)

    expect(fenced.projections[0]).toEqual({
      ...gap.projections[0],
      highestKnownRevision: 4,
    })
  })

  it('turns a same-revision state conflict into a durable bounded fence', () => {
    const commit = buildIdentityLifecyclePageCommit(readySnapshot(), {
      nextCursor: '2',
      configRevision: 1,
      events: [event('learner-a', 'disabled', 1)],
    }, 1)

    expect(commit.projections).toEqual([{
      current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 1 },
      health: { status: 'conflict', reason: 'event_conflict' },
      highestKnownRevision: 1,
    }])

    const snapshot = readySnapshot('2')
    snapshot.projections = structuredClone(commit.projections)
    expect(buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '3',
      configRevision: 1,
      events: [event('learner-a', 'disabled', 3)],
    }, 1).projections).toEqual([{
      current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 1 },
      health: { status: 'conflict', reason: 'unresolved_conflict' },
      highestKnownRevision: 3,
    }])
  })

  it('advances a config mismatch observation without approving it', () => {
    const first = buildIdentityLifecyclePageCommit(readySnapshot(), {
      nextCursor: '2', configRevision: 2, events: [],
    }, 1)
    expect(first.configuration).toEqual({
      approvedRevision: 1,
      health: { status: 'config_revision_changed', observedRevision: 2 },
    })

    const snapshot = readySnapshot('2')
    snapshot.configuration = structuredClone(first.configuration)
    expect(buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '3', configRevision: 1, events: [],
    }, 1).configuration).toEqual(first.configuration)
    expect(() => buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '3', configRevision: 2, events: [],
    }, 2)).toThrow(/approved config revision/)
  })

  it.each([
    [{ nextCursor: '1', configRevision: 1, events: [], extra: true }, /exact schema/],
    [{ nextCursor: '01', configRevision: 1, events: [] }, /cursor/],
    [{ nextCursor: '9223372036854775808', configRevision: 1, events: [] }, /cursor/],
    [{ nextCursor: '1', configRevision: 0, events: [] }, /config revision/],
    [{ nextCursor: '1', configRevision: 1, events: Array.from({ length: 101 }, () => event('a', 'active', 1)) }, /event count/],
  ])('rejects an invalid or unbounded verified page without mutating the snapshot', (page, pattern) => {
    const snapshot = readySnapshot()
    const before = structuredClone(snapshot)
    expect(() => buildIdentityLifecyclePageCommit(snapshot, page, 1)).toThrow(pattern)
    expect(snapshot).toEqual(before)
  })

  it('rejects duplicate durable principal rows and non-safe lifecycle revisions', () => {
    const snapshot = readySnapshot()
    snapshot.projections.push(structuredClone(snapshot.projections[0]!))
    expect(() => buildIdentityLifecyclePageCommit(snapshot, {
      nextCursor: '2', configRevision: 1, events: [],
    }, 1)).toThrow(/snapshot/)

    const invalid = readySnapshot()
    invalid.projections[0]!.current.revision = Number.MAX_SAFE_INTEGER + 1
    expect(() => buildIdentityLifecyclePageCommit(invalid, {
      nextCursor: '2', configRevision: 1, events: [],
    }, 1)).toThrow(/snapshot/)
  })

  it('matches the durable issuer and UTF-16 principal bounds', () => {
    expect(() => buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: [{ ...event('learner-a', 'active', 1), issuer: 'https://ACCOUNTS.example.test/auth/v1' }],
    }, 1)).toThrow(/invalid event/)

    const exactUtf16Boundary = '😀'.repeat(256)
    expect(buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: [event(exactUtf16Boundary, 'active', 1)],
    }, 1).projections[0]?.current.subject).toBe(exactUtf16Boundary)

    expect(() => buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: [event('😀'.repeat(257), 'active', 1)],
    }, 1)).toThrow(/invalid event/)

    expect(() => buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: [event('nul\0subject', 'active', 1)],
    }, 1)).toThrow(/invalid event/)
  })

  it('commits under lease through exactly one RPC with a detached exact payload', async () => {
    const rpc = vi.fn(async (...call: [string, Record<string, unknown>]) => {
      void call
      return { data: null, error: null }
    })
    const client: IdentityLifecycleRpcClient = { rpc }
    const store = new AcademyIdentityLifecyclePageStore(client)
    const commit = buildIdentityLifecyclePageCommit(readySnapshot(), {
      nextCursor: '2', configRevision: 1, events: [event('learner-a', 'disabled', 2)],
    }, 1)

    const claimToken = '00000000-0000-4000-8000-000000000001'
    await store.commitPageUnderLease(commit, { claimToken, claimedBy: 'worker-a' })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('commit_identity_lifecycle_page_under_lease', {
      p_claim_token: claimToken,
      p_claimed_by: 'worker-a',
      p_expected_cursor: '1',
      p_next_cursor: '2',
      p_approved_config_revision: 1,
      p_configuration_health: 'ready',
      p_observed_config_revision: null,
      p_projections: [{
        current: {
          issuer: ISSUER,
          subjectKey: fixtureSubjectKey('learner-a'),
          state: 'disabled',
          revision: 2,
        },
        health: { status: 'ready' },
        highestKnownRevision: 2,
      }],
    })
    expect(rpc.mock.calls[0]![1].p_projections).not.toBe(commit.projections)
  })

  it('claims, renews, releases, and commits only through exact lease RPC payloads', async () => {
    const claimToken = '00000000-0000-4000-8000-000000000001'
    let inputPropertyReads = 0
    const descriptorSnapshotOnly = <Value extends object>(value: Value): Value => new Proxy(value, {
      get() {
        inputPropertyReads += 1
        throw new Error('validated lease input must not be read through get')
      },
    })
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === 'claim_identity_lifecycle_pull_lease'
        || functionName === 'renew_identity_lifecycle_pull_lease') {
        return {
          data: {
            claimToken,
            claimedBy: 'worker-a',
            leaseUntil: '2026-08-10T05:06:07.890Z',
          },
          error: null,
        }
      }
      if (functionName === 'release_identity_lifecycle_pull_lease') {
        return { data: true, error: null }
      }
      return { data: null, error: null }
    })
    const store = new AcademyIdentityLifecyclePageStore({ rpc })
    const commit = buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1', configRevision: 1, events: [event('learner-a', 'active', 1)],
    }, 1)

    await expect(store.claimPullLease(descriptorSnapshotOnly({
      workerId: 'worker-a', leaseDurationMs: 60_000,
    }))).resolves.toMatchObject({ claimToken, claimedBy: 'worker-a' })
    await expect(store.renewPullLease(descriptorSnapshotOnly({
      claimToken, claimedBy: 'worker-a', leaseDurationMs: 60_000,
    }))).resolves.toMatchObject({ claimToken, claimedBy: 'worker-a' })
    await expect(store.releasePullLease(descriptorSnapshotOnly({
      claimToken, claimedBy: 'worker-a',
    }))).resolves.toBe(true)
    await expect(store.commitPageUnderLease(commit, descriptorSnapshotOnly({
      claimToken, claimedBy: 'worker-a',
    })))
      .resolves.toBeUndefined()
    expect(inputPropertyReads).toBe(0)

    expect(rpc.mock.calls).toEqual([
      ['claim_identity_lifecycle_pull_lease', {
        p_claimed_by: 'worker-a', p_lease_duration_ms: 60_000,
      }],
      ['renew_identity_lifecycle_pull_lease', {
        p_claim_token: claimToken, p_claimed_by: 'worker-a', p_lease_duration_ms: 60_000,
      }],
      ['release_identity_lifecycle_pull_lease', {
        p_claim_token: claimToken, p_claimed_by: 'worker-a',
      }],
      ['commit_identity_lifecycle_page_under_lease', {
        p_claim_token: claimToken,
        p_claimed_by: 'worker-a',
        p_expected_cursor: null,
        p_next_cursor: '1',
        p_approved_config_revision: 1,
        p_configuration_health: 'ready',
        p_observed_config_revision: null,
        p_projections: [{
          current: {
            issuer: ISSUER,
            subjectKey: fixtureSubjectKey('learner-a'),
            state: 'active',
            revision: 1,
          },
          health: { status: 'ready' },
          highestKnownRevision: 1,
        }],
      }],
    ])
  })

  it('reads the complete snapshot through one RPC and projects detached data', async () => {
    const snapshot = readySnapshot()
    const rpc = vi.fn(async () => ({ data: wireSnapshot(snapshot), error: null }))
    const store = new AcademyIdentityLifecyclePageStore({ rpc })

    await expect(store.read()).resolves.toEqual(snapshot)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('read_identity_lifecycle_snapshot', {})
    expect((await store.read())?.projections).not.toBe(snapshot.projections)
  })

  it('round-trips lone UTF-16 surrogates and pairs without subject-key collisions', async () => {
    const subjects = ['\ud800', '\udc00', '\ud800\udc00']
    const commit = buildIdentityLifecyclePageCommit(null, {
      nextCursor: '1',
      configRevision: 1,
      events: subjects.map((subject) => event(subject, 'active', 1)),
    }, 1)
    const commitRpc = vi.fn(async (...call: [string, Record<string, unknown>]) => {
      void call
      return { data: null, error: null }
    })
    await new AcademyIdentityLifecyclePageStore({ rpc: commitRpc }).commitPageUnderLease(commit, {
      claimToken: '00000000-0000-4000-8000-000000000001',
      claimedBy: 'worker-a',
    })

    const wireProjections = commitRpc.mock.calls[0]![1].p_projections as Array<{
      current: { subjectKey: string; subject?: string }
    }>
    expect(wireProjections.map((projection) => projection.current.subjectKey)).toEqual([
      'd800',
      'd800dc00',
      'dc00',
    ])
    expect(new Set(wireProjections.map((projection) => projection.current.subjectKey)).size).toBe(3)
    expect(wireProjections.every((projection) => !('subject' in projection.current))).toBe(true)

    const readRpc = vi.fn(async () => ({
      data: {
        cursor: '1',
        configuration: { approvedRevision: 1, health: { status: 'ready' } },
        projections: wireProjections,
      },
      error: null,
    }))
    await expect(new AcademyIdentityLifecyclePageStore({ rpc: readRpc }).read()).resolves.toEqual({
      cursor: '1',
      configuration: { approvedRevision: 1, health: { status: 'ready' } },
      projections: commit.projections,
    })
  })

  it.each([
    'D800',
    '0000',
    'd80',
    'gggg',
    '0061'.repeat(513),
  ])('rejects a noncanonical RPC subject key: %s', async (subjectKey) => {
    const snapshot = wireSnapshot(readySnapshot())
    snapshot.projections[0]!.current.subjectKey = subjectKey
    const store = new AcademyIdentityLifecyclePageStore({
      rpc: async () => ({ data: snapshot, error: null }),
    })
    await expect(store.read()).rejects.toThrow(/snapshot response/)
  })

  it('fails closed on malformed RPC data or an RPC error', async () => {
    const malformed = new AcademyIdentityLifecyclePageStore({
      rpc: async () => ({ data: { ...readySnapshot(), extra: true }, error: null }),
    })
    await expect(malformed.read()).rejects.toThrow(/snapshot response/)

    const failed = new AcademyIdentityLifecyclePageStore({
      rpc: async () => ({ data: null, error: { message: 'DATABASE_URL=must-not-leak' } }),
    })
    await expect(failed.read()).rejects.toThrow(/^Identity lifecycle snapshot read failed$/)
    await expect(failed.commitPageUnderLease(buildIdentityLifecyclePageCommit(null, {
      nextCursor: null, configRevision: 1, events: [],
    }, 1), {
      claimToken: '00000000-0000-4000-8000-000000000001',
      claimedBy: 'worker-a',
    })).rejects.toThrow(/^Identity lifecycle page commit under lease failed$/)
  })
})
