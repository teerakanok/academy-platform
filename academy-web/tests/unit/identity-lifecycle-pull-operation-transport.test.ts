import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createIdentityLifecyclePullOperationTransport,
  IdentityLifecyclePullOperationTransportFailure,
} from '@/lib/identity/lifecycle-pull-operation-transport'
import { runIdentityLifecyclePullCycle } from '@/lib/identity/lifecycle-pull-cycle'
import type { IdentityLifecycleLeasedPageStore } from '@/lib/identity/lifecycle-page-store'
import { createIdentityLifecycleVerifiedPageTransport } from '@/lib/identity/lifecycle-verified-page-transport'

const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const VERIFICATION_TIME = new Date('2026-08-09T02:01:00.000Z')
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000902'

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

function createOptions(operation: { execute(request: unknown): Promise<unknown> }) {
  return {
    consumerId: 'academy-web',
    clientAssertionAudience: 'https://accounts.example.test/v1/lifecycle/pull',
    requestedLimit: 2,
    clientAssertionProvider: {
      createClientAssertion: vi.fn(async () => ASSERTION),
    },
    operation,
  }
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected operation transport failure')
  } catch (error) {
    return error as Error
  }
}

describe('Academy Identity lifecycle pull-operation transport', () => {
  it('builds exact initial and continued producer requests for the logical operation', async () => {
    const requests: unknown[] = []
    const operation = {
      async execute(request: unknown) {
        expect(this).toBe(operation)
        requests.push(request)
        return {
          envelopes: [],
          nextCursor: requests.length === 1 ? null : { sequence: '42' },
          configRevision: 1,
        }
      },
    }
    const options = createOptions(operation)
    const transport = createIdentityLifecyclePullOperationTransport(options)

    await expect(transport.pullPage({ cursor: null, limit: 2 })).resolves.toMatchObject({
      nextCursor: null,
    })
    await expect(transport.pullPage({ cursor: '42', limit: 2 })).resolves.toMatchObject({
      nextCursor: { sequence: '42' },
    })

    expect(requests).toEqual([
      {
        consumerId: 'academy-web',
        clientAssertion: ASSERTION,
        limit: 2,
      },
      {
        consumerId: 'academy-web',
        clientAssertion: ASSERTION,
        cursor: { sequence: '42' },
        limit: 2,
      },
    ])
    expect(options.clientAssertionProvider.createClientAssertion).toHaveBeenCalledTimes(2)
    expect(options.clientAssertionProvider.createClientAssertion).toHaveBeenNthCalledWith(1, {
      consumerId: 'academy-web',
      audience: 'https://accounts.example.test/v1/lifecycle/pull',
    })
  })

  it('rejects cursor or limit mismatch before signing or executing', async () => {
    const execute = vi.fn(async () => null)
    const options = createOptions({ execute })
    const transport = createIdentityLifecyclePullOperationTransport(options)

    await expect(transport.pullPage({ cursor: '01', limit: 2 }))
      .rejects.toBeInstanceOf(IdentityLifecyclePullOperationTransportFailure)
    await expect(transport.pullPage({ cursor: null, limit: 3 }))
      .rejects.toBeInstanceOf(IdentityLifecyclePullOperationTransportFailure)
    expect(options.clientAssertionProvider.createClientAssertion).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('captures the operation method once and preserves its receiver', async () => {
    const execute = vi.fn(async function (this: unknown) {
      expect(this).toBe(operation)
      return { envelopes: [], nextCursor: null, configRevision: 1 }
    })
    const get = vi.fn((target: { execute: typeof execute }, key: PropertyKey) => {
      if (key !== 'execute') throw new Error('unexpected operation property read')
      if (get.mock.calls.length > 1) throw new Error('operation method re-read')
      return target.execute
    })
    const operation = new Proxy({ execute }, { get })
    const transport = createIdentityLifecyclePullOperationTransport(createOptions(operation))

    await expect(transport.pullPage({ cursor: null, limit: 2 })).resolves.toEqual({
      envelopes: [], nextCursor: null, configRevision: 1,
    })
    expect(get).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
  })

  it.each([
    ['signer', () => createOptions({
      execute: vi.fn(async () => ({ envelopes: [], nextCursor: null, configRevision: 1 })),
    }), true],
    ['operation', () => createOptions({
      execute: vi.fn(async () => {
        throw new Error('credential=TOP_SECRET')
      }),
    }), false],
  ] as const)('uses one bounded error for %s failure', async (_label, create, signerFails) => {
    const options = create()
    if (signerFails) {
      options.clientAssertionProvider.createClientAssertion.mockRejectedValueOnce(
        new Error('credential=TOP_SECRET'),
      )
    }
    const transport = createIdentityLifecyclePullOperationTransport(options)
    const error = await captureFailure(transport.pullPage({ cursor: null, limit: 2 }))

    expect(error).toBeInstanceOf(IdentityLifecyclePullOperationTransportFailure)
    expect(error.name).toBe('IdentityLifecyclePullOperationTransportFailure')
    expect(error.message).toBe('Identity lifecycle pull operation failed')
    expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(error)).toEqual([])
  })

  it('composes the real request, page verifier, pull cycle, and leased commit', async () => {
    const operation = {
      execute: vi.fn(async () => ({
        envelopes: [],
        nextCursor: null,
        configRevision: 1,
      })),
    }
    const parsedTransport = createIdentityLifecyclePullOperationTransport(
      createOptions(operation),
    )
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: parsedTransport,
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })
    const { commitPageUnderLease, store } = createStore()

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
    expect(operation.execute).toHaveBeenCalledOnce()
    expect(commitPageUnderLease).toHaveBeenCalledOnce()
  })

  it('routes an invalid operation page to bounded retry without committing', async () => {
    const parsedTransport = createIdentityLifecyclePullOperationTransport(createOptions({
      execute: vi.fn(async () => ({
        envelopes: [],
        nextCursor: { sequence: '1' },
        configRevision: 1,
      })),
    }))
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: parsedTransport,
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })
    const { commitPageUnderLease, store } = createStore()

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

  it('stays logical-operation-only and runtime disconnected', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/lifecycle-pull-operation-transport.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/\b(?:fetch|Request|Response|URL|console|logger)\b/)
    expect(source).not.toContain('registry')
    expect(source).not.toContain('wrangler')
  })
})
