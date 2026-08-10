import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { runIdentityLifecyclePullCycle } from '@/lib/identity/lifecycle-pull-cycle'
import type { IdentityLifecycleLeasedPageStore } from '@/lib/identity/lifecycle-page-store'
import {
  createIdentityLifecycleVerifiedPageTransport,
  IdentityLifecycleVerifiedPageTransportFailure,
} from '@/lib/identity/lifecycle-verified-page-transport'

const VERIFICATION_TIME = new Date('2026-08-09T02:01:00.000Z')
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000901'

function envelopePolicy() {
  return {
    expectedIssuer: 'https://identity.example.test/',
    expectedAudience: 'https://consumer.example.test/auth/events',
    clockSkewSeconds: 30,
    maximumLifetimeSeconds: 180,
    key: {
      keyId: 'identity-events-conformance-v1',
      algorithm: 'ES256' as const,
      publicJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'oWKIvOzecbm5Zwg3fVWCoYamzbO6Sdd97DAMX5qxwiU',
        y: 'c3R-MRMG7D3BUaVJE3Ap6gvxKvOgJG7itnZOx95ezKQ',
      },
    },
  }
}

function page(nextCursor: string | null = null): Record<string, unknown> {
  return {
    envelopes: [],
    nextCursor: nextCursor === null ? null : { sequence: nextCursor },
    configRevision: 1,
  }
}

function createStore() {
  const commitPageUnderLease = vi.fn(async () => undefined)
  const store = {
    claimPullLease: vi.fn(async () => ({
      claimToken: CLAIM_TOKEN,
      claimedBy: 'academy-worker',
      leaseUntil: new Date('2026-08-09T02:01:30.000Z'),
    })),
    renewPullLease: vi.fn(async () => null),
    releasePullLease: vi.fn(async () => true),
    read: vi.fn(async () => null),
    commitPageUnderLease,
  } satisfies IdentityLifecycleLeasedPageStore
  return { commitPageUnderLease, store }
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected transport failure')
  } catch (error) {
    return error as Error
  }
}

describe('Academy Identity lifecycle verified-page transport', () => {
  it('forwards the exact cursor and limit then returns only the verified projection', async () => {
    const response = page('42')
    const pullPage = vi.fn(async () => response)
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: { pullPage },
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })

    const result = await transport.pullVerifiedPage({
      cursor: '42',
      verificationTime: VERIFICATION_TIME,
    })

    expect(pullPage).toHaveBeenCalledOnce()
    expect(pullPage).toHaveBeenCalledWith({ cursor: '42', limit: 2 })
    expect(result).toEqual({ nextCursor: '42', configRevision: 1, events: [] })
    response.configRevision = 99
    ;(response.nextCursor as { sequence: string }).sequence = '99'
    expect(result).toEqual({ nextCursor: '42', configRevision: 1, events: [] })
  })

  it('rejects a response that is not bound to the requested cursor', async () => {
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: { pullPage: vi.fn(async () => page()) },
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })

    await expect(transport.pullVerifiedPage({
      cursor: '42',
      verificationTime: VERIFICATION_TIME,
    })).rejects.toBeInstanceOf(IdentityLifecycleVerifiedPageTransportFailure)
  })

  it('rejects invalid local request bounds before calling the parsed-page port', () => {
    const pullPage = vi.fn()
    expect(() => createIdentityLifecycleVerifiedPageTransport({
      pageTransport: { pullPage },
      requestedLimit: 0,
      envelopePolicy: envelopePolicy(),
    })).toThrow(IdentityLifecycleVerifiedPageTransportFailure)
    expect(pullPage).not.toHaveBeenCalled()
  })

  it('captures the parsed-page method once instead of re-reading the port', async () => {
    const pullPage = vi.fn(async () => page())
    const get = vi.fn((target: { pullPage: typeof pullPage }, key: PropertyKey) => {
      if (key !== 'pullPage') throw new Error('unexpected property read')
      if (get.mock.calls.length > 1) throw new Error('transport method re-read')
      return target.pullPage
    })
    const pageTransport = new Proxy({ pullPage }, { get })
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport,
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })

    await expect(transport.pullVerifiedPage({
      cursor: null,
      verificationTime: VERIFICATION_TIME,
    })).resolves.toEqual({ nextCursor: null, configRevision: 1, events: [] })
    expect(get).toHaveBeenCalledOnce()
    expect(pullPage).toHaveBeenCalledOnce()
  })

  it.each([
    ['request', () => ({
      pageTransport: {
        pullPage: vi.fn(async () => {
          throw new Error('credential=TOP_SECRET')
        }),
      },
      envelopePolicy: envelopePolicy(),
    })],
    ['policy', () => ({
      pageTransport: { pullPage: vi.fn(async () => page()) },
      envelopePolicy: {
        ...envelopePolicy(),
        expectedIssuer: 'credential=TOP_SECRET',
      },
    })],
  ] as const)('uses one bounded error for %s failure without leaking detail', async (_, input) => {
    const transport = createIdentityLifecycleVerifiedPageTransport({
      ...input(),
      requestedLimit: 2,
    })
    const error = await captureFailure(transport.pullVerifiedPage({
      cursor: null,
      verificationTime: VERIFICATION_TIME,
    }))

    expect(error).toBeInstanceOf(IdentityLifecycleVerifiedPageTransportFailure)
    expect(error.name).toBe('IdentityLifecycleVerifiedPageTransportFailure')
    expect(error.message).toBe('Identity lifecycle verified-page transport failed')
    expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(error)).toEqual([])
  })

  it('composes the real verifier with the claimed pull cycle and durable commit', async () => {
    const { commitPageUnderLease, store } = createStore()
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: { pullPage: vi.fn(async () => page()) },
      requestedLimit: 100,
      envelopePolicy: envelopePolicy(),
    })

    await expect(runIdentityLifecyclePullCycle({
      store,
      transport,
      clock: { now: () => VERIFICATION_TIME },
      approvedConfigRevision: 1,
      workerId: 'academy-worker',
      leaseDurationMs: 30_000,
    })).resolves.toEqual({
      outcome: 'committed',
      cursor: null,
      health: {
        configuration: 'ready',
        page: { gap: false, conflict: false },
      },
      leaseRelease: 'confirmed',
    })
    expect(commitPageUnderLease).toHaveBeenCalledOnce()
  })

  it('maps verifier rejection through the cycle retry path without committing', async () => {
    const { commitPageUnderLease, store } = createStore()
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: {
        pullPage: vi.fn(async () => ({
          envelopes: [],
          nextCursor: { sequence: '1' },
          configRevision: 1,
        })),
      },
      requestedLimit: 100,
      envelopePolicy: envelopePolicy(),
    })

    await expect(runIdentityLifecyclePullCycle({
      store,
      transport,
      clock: { now: () => VERIFICATION_TIME },
      approvedConfigRevision: 1,
      workerId: 'academy-worker',
      leaseDurationMs: 30_000,
    })).resolves.toEqual({
      outcome: 'retry_required',
      sensitiveOperationsAllowed: false,
      leaseRelease: 'confirmed',
    })
    expect(commitPageUnderLease).not.toHaveBeenCalled()
  })

  it('stays framework, network, logger, and runtime wiring free', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/lifecycle-verified-page-transport.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/\b(?:fetch|Request|Response|console|logger)\b/)
    expect(source).not.toContain('registry')
    expect(source).not.toContain('wrangler')
  })
})
