import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityLifecycleEvent } from '@/lib/identity/lifecycle-envelope-verifier'
import type {
  IdentityLifecycleConsumerSnapshot,
  IdentityLifecycleLeasedPageStore,
  IdentityLifecyclePageCommit,
} from '@/lib/identity/lifecycle-page-store'
import type { IdentityLifecyclePullLease } from '@/lib/identity/lifecycle-pull-lease'
import {
  runIdentityLifecyclePullCycle,
  type IdentityLifecyclePullCycleClock,
  type IdentityLifecycleVerifiedPageTransport,
} from '@/lib/identity/lifecycle-pull-cycle'

const ISSUER = 'https://accounts.example.test/auth/v1'
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000001'
const VERIFICATION_TIME = new Date('2026-08-10T06:00:00.000Z')

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
    occurredAt: `2026-08-10T05:${revision.toString().padStart(2, '0')}:00.000Z`,
    reason: `account_${state}`,
  }
}

function readySnapshot(cursor = '1'): IdentityLifecycleConsumerSnapshot {
  return {
    cursor,
    configuration: { approvedRevision: 1, health: { status: 'ready' } },
    projections: [{
      current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 1 },
      health: { status: 'ready' },
      highestKnownRevision: 1,
    }],
  }
}

function createStore(initial: IdentityLifecycleConsumerSnapshot | null = null) {
  let snapshot = structuredClone(initial)
  const calls: string[] = []
  const claimPullLease = vi.fn(async (): Promise<IdentityLifecyclePullLease | null> => {
    calls.push('claim')
    return {
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
      leaseUntil: new Date('2026-08-10T06:01:00.000Z'),
    }
  })
  const read = vi.fn(async () => {
    calls.push('read')
    return structuredClone(snapshot)
  })
  const commitPageUnderLease = vi.fn(async (
    commit: IdentityLifecyclePageCommit,
    fence: { claimToken: string; claimedBy: string },
  ) => {
    calls.push('commit')
    expect(fence).toEqual({ claimToken: CLAIM_TOKEN, claimedBy: 'worker-a' })
    const projections = new Map<string, IdentityLifecycleConsumerSnapshot['projections'][number]>()
    for (const projection of snapshot?.projections ?? []) {
      projections.set(`${projection.current.issuer}\0${projection.current.subject}`, projection)
    }
    for (const projection of commit.projections) {
      projections.set(`${projection.current.issuer}\0${projection.current.subject}`, projection)
    }
    snapshot = {
      cursor: commit.nextCursor,
      configuration: structuredClone(commit.configuration),
      projections: [...projections.values()].map((projection) => structuredClone(projection)),
    }
  })
  const releasePullLease = vi.fn(async (): Promise<boolean> => {
    calls.push('release')
    return true
  })
  const renewPullLease = vi.fn(async () => {
    throw new Error('cycle must not invent a renewal policy')
  })
  const store: IdentityLifecycleLeasedPageStore = {
    claimPullLease,
    renewPullLease,
    releasePullLease,
    read,
    commitPageUnderLease,
  }
  return {
    calls,
    store,
    claimPullLease,
    renewPullLease,
    releasePullLease,
    read,
    commitPageUnderLease,
    snapshot: () => structuredClone(snapshot),
  }
}

function createClock(calls: string[] = []): IdentityLifecyclePullCycleClock {
  return {
    now: vi.fn(() => {
      calls.push('clock')
      return VERIFICATION_TIME
    }),
  }
}

function options(
  store: IdentityLifecycleLeasedPageStore,
  transport: IdentityLifecycleVerifiedPageTransport,
  clock: IdentityLifecyclePullCycleClock,
) {
  return {
    store,
    transport,
    clock,
    approvedConfigRevision: 1,
    workerId: 'worker-a',
    leaseDurationMs: 60_000,
  } as const
}

async function capturePullCycleFailure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'IdentityLifecyclePullCycleFailure',
      message: 'Identity lifecycle pull cycle failed',
    })
    return error as Error & {
      leaseRelease: 'confirmed' | 'not_confirmed' | 'unknown'
    }
  }
  throw new Error('Expected Identity lifecycle pull cycle to reject')
}

describe('Academy Identity lifecycle pull cycle', () => {
  it('claims, reads, pulls at one trusted time, commits under lease, and releases', async () => {
    const fixture = createStore()
    const clock = createClock(fixture.calls)
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async (input) => {
        fixture.calls.push('pull')
        expect(input.cursor).toBeNull()
        expect(input.verificationTime).toEqual(VERIFICATION_TIME)
        expect(input.verificationTime).not.toBe(VERIFICATION_TIME)
        return { nextCursor: '1', configRevision: 1, events: [event('learner-a', 'active', 1)] }
      }),
    }

    await expect(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, clock,
    ))).resolves.toEqual({
      outcome: 'committed',
      cursor: '1',
      health: { configuration: 'ready', page: { gap: false, conflict: false } },
      leaseRelease: 'confirmed',
    })
    expect(fixture.calls).toEqual(['claim', 'read', 'clock', 'pull', 'commit', 'release'])
    expect(fixture.renewPullLease).not.toHaveBeenCalled()
    expect(fixture.snapshot()?.cursor).toBe('1')
  })

  it('classifies a busy lease without reading the clock, store, or transport', async () => {
    const fixture = createStore()
    fixture.claimPullLease.mockResolvedValueOnce(null)
    const clock = createClock()
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(),
    }

    await expect(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, clock,
    ))).resolves.toEqual({ outcome: 'lease_busy' })
    expect(fixture.read).not.toHaveBeenCalled()
    expect(clock.now).not.toHaveBeenCalled()
    expect(transport.pullVerifiedPage).not.toHaveBeenCalled()
    expect(fixture.commitPageUnderLease).not.toHaveBeenCalled()
    expect(fixture.releasePullLease).not.toHaveBeenCalled()
  })

  it('stops before clock or transport when durable approved configuration differs', async () => {
    const fixture = createStore(readySnapshot())
    const clock = createClock()
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(),
    }

    const failure = await capturePullCycleFailure(runIdentityLifecyclePullCycle({
      ...options(fixture.store, transport, clock),
      approvedConfigRevision: 2,
    }))
    expect(failure.leaseRelease).toBe('confirmed')
    expect((failure.cause as Error).message).toMatch(/approved config revision/)
    expect(clock.now).not.toHaveBeenCalled()
    expect(transport.pullVerifiedPage).not.toHaveBeenCalled()
    expect(fixture.commitPageUnderLease).not.toHaveBeenCalled()
    expect(fixture.releasePullLease).toHaveBeenCalledOnce()
  })

  it('commits and independently classifies a gap plus config revision mismatch', async () => {
    const fixture = createStore(readySnapshot())
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async ({ cursor }) => {
        expect(cursor).toBe('1')
        return {
          nextCursor: '2',
          configRevision: 2,
          events: [event('learner-a', 'disabled', 3)],
        }
      }),
    }

    await expect(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, createClock(),
    ))).resolves.toEqual({
      outcome: 'committed',
      cursor: '2',
      health: {
        configuration: 'config_revision_changed',
        page: { gap: true, conflict: false },
      },
      leaseRelease: 'confirmed',
    })
    expect(fixture.snapshot()).toMatchObject({
      cursor: '2',
      configuration: {
        approvedRevision: 1,
        health: { status: 'config_revision_changed', observedRevision: 2 },
      },
      projections: [{
        current: { state: 'active', revision: 1 },
        health: { status: 'gap', observed: { state: 'disabled', revision: 3 } },
      }],
    })
  })

  it('reports simultaneous page gap and conflict fences without precedence', async () => {
    const snapshot = readySnapshot()
    snapshot.projections = [
      {
        current: { issuer: ISSUER, subject: 'learner-a', state: 'active', revision: 1 },
        health: { status: 'ready' },
        highestKnownRevision: 1,
      },
      {
        current: { issuer: ISSUER, subject: 'learner-b', state: 'active', revision: 1 },
        health: { status: 'ready' },
        highestKnownRevision: 1,
      },
    ]
    const fixture = createStore(snapshot)
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async () => ({
        nextCursor: '3',
        configRevision: 1,
        events: [
          event('learner-a', 'disabled', 3),
          event('learner-b', 'disabled', 1),
        ],
      })),
    }

    await expect(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, createClock(),
    ))).resolves.toEqual({
      outcome: 'committed',
      cursor: '3',
      health: { configuration: 'ready', page: { gap: true, conflict: true } },
      leaseRelease: 'confirmed',
    })
  })

  it('returns a bounded retry and preserves the exact snapshot on transport failure', async () => {
    const before = readySnapshot()
    const fixture = createStore(before)
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async () => {
        throw new Error('upstream secret detail must not cross the cycle boundary')
      }),
    }

    await expect(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, createClock(),
    ))).resolves.toEqual({
      outcome: 'retry_required',
      sensitiveOperationsAllowed: false,
      leaseRelease: 'confirmed',
    })
    expect(fixture.snapshot()).toEqual(before)
    expect(fixture.commitPageUnderLease).not.toHaveBeenCalled()
    expect(fixture.releasePullLease).toHaveBeenCalledOnce()
  })

  it('rejects a malformed verified page before commit and preserves the cursor', async () => {
    const before = readySnapshot()
    const fixture = createStore(before)
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async () => ({
        nextCursor: '2', configRevision: 1, events: [], extra: true,
      }) as never),
    }

    const failure = await capturePullCycleFailure(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, createClock(),
    )))
    expect(failure.leaseRelease).toBe('confirmed')
    expect((failure.cause as Error).message).toMatch(/exact schema/)
    expect(fixture.snapshot()).toEqual(before)
    expect(fixture.commitPageUnderLease).not.toHaveBeenCalled()
    expect(fixture.releasePullLease).toHaveBeenCalledOnce()
  })

  it('propagates a local commit failure, preserves the cursor, and releases the lease', async () => {
    const before = readySnapshot()
    const fixture = createStore(before)
    const primary = new Error('local atomic commit failed')
    fixture.commitPageUnderLease.mockRejectedValueOnce(primary)
    const transport: IdentityLifecycleVerifiedPageTransport = {
      pullVerifiedPage: vi.fn(async () => ({
        nextCursor: '2', configRevision: 1, events: [event('learner-a', 'disabled', 2)],
      })),
    }

    const failure = await capturePullCycleFailure(runIdentityLifecyclePullCycle(options(
      fixture.store, transport, createClock(),
    )))
    expect(failure.leaseRelease).toBe('confirmed')
    expect(failure.cause).toBe(primary)
    expect(fixture.snapshot()).toEqual(before)
    expect(fixture.releasePullLease).toHaveBeenCalledOnce()
  })

  it('releases after read or clock validation failure without calling transport', async () => {
    const readFailure = createStore()
    const readPrimary = new Error('snapshot read failed')
    readFailure.read.mockRejectedValueOnce(readPrimary)
    const transport: IdentityLifecycleVerifiedPageTransport = { pullVerifiedPage: vi.fn() }
    const readResult = await capturePullCycleFailure(runIdentityLifecyclePullCycle(options(
      readFailure.store, transport, createClock(),
    )))
    expect(readResult.leaseRelease).toBe('confirmed')
    expect(readResult.cause).toBe(readPrimary)
    expect(readFailure.releasePullLease).toHaveBeenCalledOnce()

    const clockFailure = createStore()
    const clockResult = await capturePullCycleFailure(runIdentityLifecyclePullCycle(options(
      clockFailure.store,
      transport,
      { now: () => new Date(Number.NaN) },
    )))
    expect(clockResult.leaseRelease).toBe('confirmed')
    expect((clockResult.cause as Error).message).toMatch(/clock/)
    expect(transport.pullVerifiedPage).not.toHaveBeenCalled()
    expect(clockFailure.releasePullLease).toHaveBeenCalledOnce()
  })

  describe.each([
    { releaseMode: 'false' as const, expectedRelease: 'not_confirmed' as const },
    { releaseMode: 'throw' as const, expectedRelease: 'unknown' as const },
  ])('when lease release reports $releaseMode', ({ releaseMode, expectedRelease }) => {
    function arrangeReleaseFailure(fixture: ReturnType<typeof createStore>) {
      if (releaseMode === 'false') {
        fixture.releasePullLease.mockResolvedValueOnce(false)
      } else {
        fixture.releasePullLease.mockRejectedValueOnce(new Error('release detail must stay secondary'))
      }
    }

    it('preserves a committed acknowledgement and exposes release uncertainty', async () => {
      const fixture = createStore()
      arrangeReleaseFailure(fixture)
      const transport: IdentityLifecycleVerifiedPageTransport = {
        pullVerifiedPage: vi.fn(async () => ({
          nextCursor: '1',
          configRevision: 1,
          events: [event('learner-a', 'active', 1)],
        })),
      }

      await expect(runIdentityLifecyclePullCycle(options(
        fixture.store, transport, createClock(),
      ))).resolves.toEqual({
        outcome: 'committed',
        cursor: '1',
        health: { configuration: 'ready', page: { gap: false, conflict: false } },
        leaseRelease: expectedRelease,
      })
      expect(fixture.commitPageUnderLease).toHaveBeenCalledOnce()
    })

    it('preserves transport retry and exposes release uncertainty', async () => {
      const fixture = createStore(readySnapshot())
      arrangeReleaseFailure(fixture)
      const transport: IdentityLifecycleVerifiedPageTransport = {
        pullVerifiedPage: vi.fn(async () => {
          throw new Error('transport detail must stay bounded')
        }),
      }

      await expect(runIdentityLifecyclePullCycle(options(
        fixture.store, transport, createClock(),
      ))).resolves.toEqual({
        outcome: 'retry_required',
        sensitiveOperationsAllowed: false,
        leaseRelease: expectedRelease,
      })
      expect(fixture.commitPageUnderLease).not.toHaveBeenCalled()
    })

    it.each(['read', 'parse', 'commit'] as const)(
      'preserves the primary %s failure and exposes release uncertainty',
      async (stage) => {
        const fixture = createStore(readySnapshot())
        arrangeReleaseFailure(fixture)
        const primary = new Error(`${stage} primary failure`)
        const transport: IdentityLifecycleVerifiedPageTransport = {
          pullVerifiedPage: vi.fn(async () => ({
            nextCursor: '2',
            configRevision: 1,
            events: [event('learner-a', 'disabled', 2)],
          })),
        }
        if (stage === 'read') fixture.read.mockRejectedValueOnce(primary)
        if (stage === 'parse') {
          transport.pullVerifiedPage = vi.fn(async () => ({
            nextCursor: '2', configRevision: 1, events: [], extra: true,
          }) as never)
        }
        if (stage === 'commit') fixture.commitPageUnderLease.mockRejectedValueOnce(primary)

        let failure: unknown
        try {
          await runIdentityLifecyclePullCycle(options(
            fixture.store, transport, createClock(),
          ))
        } catch (error) {
          failure = error
        }

        expect(failure).toMatchObject({
          name: 'IdentityLifecyclePullCycleFailure',
          leaseRelease: expectedRelease,
        })
        const cause = (failure as { cause: unknown }).cause
        if (stage === 'parse') {
          expect(cause).toBeInstanceOf(Error)
          expect((cause as Error).message).toMatch(/exact schema/)
        } else {
          expect(cause).toBe(primary)
        }
      },
    )
  })

  describe.each([
    { releaseMode: 'confirmed' as const, expectedRelease: 'confirmed' as const },
    { releaseMode: 'false' as const, expectedRelease: 'not_confirmed' as const },
    { releaseMode: 'throw' as const, expectedRelease: 'unknown' as const },
  ])('failure disclosure when lease release is $releaseMode', ({
    releaseMode,
    expectedRelease,
  }) => {
    it.each(['read', 'parse', 'commit'] as const)(
      'keeps the injected %s cause out of every default disclosure surface',
      async (stage) => {
        const fixture = createStore(readySnapshot())
        if (releaseMode === 'false') fixture.releasePullLease.mockResolvedValueOnce(false)
        if (releaseMode === 'throw') {
          fixture.releasePullLease.mockRejectedValueOnce(new Error('secondary release detail'))
        }
        const marker = [
          'SENSITIVE_FIXTURE_MARKER[credential-like]',
          '/private/academy-fixture.sql',
          'SELECT_fixture_only',
          stage,
        ].join('::')
        const primary = new Error(marker)
        const validPage = {
          nextCursor: '2',
          configRevision: 1,
          events: [event('learner-a', 'disabled', 2)],
        }
        const transport: IdentityLifecycleVerifiedPageTransport = {
          pullVerifiedPage: vi.fn(async () => validPage),
        }
        if (stage === 'read') fixture.read.mockRejectedValueOnce(primary)
        if (stage === 'parse') {
          transport.pullVerifiedPage = vi.fn(async () => new Proxy(validPage, {
            ownKeys: () => {
              throw primary
            },
          }))
        }
        if (stage === 'commit') fixture.commitPageUnderLease.mockRejectedValueOnce(primary)

        let failure: unknown
        try {
          await runIdentityLifecyclePullCycle(options(
            fixture.store, transport, createClock(),
          ))
        } catch (error) {
          failure = error
        }

        expect(failure).toBeInstanceOf(Error)
        expect((failure as Error).message).toBe('Identity lifecycle pull cycle failed')
        expect(String(failure)).toBe(
          'IdentityLifecyclePullCycleFailure: Identity lifecycle pull cycle failed',
        )
        expect((failure as Error).stack).not.toContain(marker)
        expect(Object.keys(failure as object)).toEqual(['leaseRelease'])
        expect(JSON.parse(JSON.stringify(failure))).toEqual({ leaseRelease: expectedRelease })
        expect(Object.prototype.propertyIsEnumerable.call(failure, 'cause')).toBe(false)
        expect((failure as Error).cause).toBe(primary)
      },
    )
  })

  it('has no unfenced commit or runtime transport policy in the pure cycle source', () => {
    const source = readFileSync(
      new URL('../../src/lib/identity/lifecycle-pull-cycle.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/['"]commit_identity_lifecycle_page['"]|\.commitPage\s*\(/)
    expect(source).not.toMatch(/endpoint|audience|keyId|setTimeout|backoff|lag/i)
  })
})
