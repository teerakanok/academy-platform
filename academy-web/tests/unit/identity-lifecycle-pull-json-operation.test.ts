import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import {
  createIdentityLifecyclePullJsonOperation,
  IdentityLifecyclePullJsonOperationFailure,
} from '@/lib/identity/lifecycle-pull-json-operation'
import {
  createIdentityLifecyclePullOperationTransport,
  type IdentityLifecyclePullOperation,
} from '@/lib/identity/lifecycle-pull-operation-transport'
import type { IdentityLifecyclePullRequest } from '@/lib/identity/lifecycle-pull-request'
import { runIdentityLifecyclePullCycle } from '@/lib/identity/lifecycle-pull-cycle'
import type { IdentityLifecycleLeasedPageStore } from '@/lib/identity/lifecycle-page-store'
import { createIdentityLifecycleVerifiedPageTransport } from '@/lib/identity/lifecycle-verified-page-transport'

const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const VERIFICATION_TIME = new Date('2026-08-09T02:01:00.000Z')
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000903'

function byteStream(source: UnderlyingByteSource): ReadableStream<Uint8Array> {
  const ByteReadableStream = ReadableStream as unknown as {
    new (underlyingSource: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  return new ByteReadableStream(source)
}

function trackedResponse(body: string) {
  const bytes = new TextEncoder().encode(body)
  const activity = { cancels: 0, pulls: 0 }
  let sent = false
  const stream = byteStream({
    type: 'bytes',
    pull(controller) {
      activity.pulls += 1
      if (sent) {
        controller.close()
        return
      }
      sent = true
      controller.enqueue(bytes)
      controller.close()
    },
    cancel() {
      activity.cancels += 1
    },
  })
  return {
    activity,
    response: new Response(stream, {
      headers: { 'content-type': 'application/json' },
    }),
  }
}

function strictReader() {
  const reader = {
    async read(response: Response) {
      expect(this).toBe(reader)
      return readStrictJsonResponse(response, {
        maxBytes: 512,
        maxDepth: 8,
        timeoutMs: 1_000,
      })
    },
  }
  return reader
}

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

function parsedTransport(operation: IdentityLifecyclePullOperation) {
  return createIdentityLifecyclePullOperationTransport({
    consumerId: 'academy-web',
    clientAssertionAudience: 'https://accounts.example.test/v1/lifecycle/pull',
    requestedLimit: 2,
    clientAssertionProvider: {
      createClientAssertion: vi.fn(async () => ASSERTION),
    },
    operation,
  })
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected JSON operation failure')
  } catch (error) {
    return error as Error
  }
}

describe('Academy Identity lifecycle pull JSON operation', () => {
  it('hands the exact request to the response transport and returns strict parsed JSON', async () => {
    const request: IdentityLifecyclePullRequest = {
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      cursor: { sequence: '41' },
      limit: 2,
    }
    const responseTransport = {
      async execute(received: IdentityLifecyclePullRequest) {
        expect(this).toBe(responseTransport)
        expect(received).toBe(request)
        return trackedResponse(JSON.stringify({
          envelopes: [],
          nextCursor: { sequence: '41' },
          configRevision: 1,
        })).response
      },
    }
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport,
      responseReader: strictReader(),
    })

    await expect(operation.execute(request)).resolves.toEqual({
      envelopes: [],
      nextCursor: { sequence: '41' },
      configRevision: 1,
    })
  })

  it('captures both port methods once and preserves both receivers', async () => {
    const execute = vi.fn(async function (this: unknown) {
      expect(this).toBe(responsePort)
      return trackedResponse('{"envelopes":[],"nextCursor":null,"configRevision":1}').response
    })
    const read = vi.fn(async function (this: unknown, response: Response) {
      expect(this).toBe(readerPort)
      return readStrictJsonResponse(response, { maxBytes: 128, maxDepth: 4 })
    })
    const responseGet = vi.fn((target: { execute: typeof execute }, key: PropertyKey) => {
      if (key !== 'execute') throw new Error('unexpected response port property read')
      if (responseGet.mock.calls.length > 1) throw new Error('response method re-read')
      return target.execute
    })
    const readerGet = vi.fn((target: { read: typeof read }, key: PropertyKey) => {
      if (key !== 'read') throw new Error('unexpected reader property read')
      if (readerGet.mock.calls.length > 1) throw new Error('reader method re-read')
      return target.read
    })
    const responseTarget = { execute }
    const readerTarget = { read }
    const responsePort = new Proxy(responseTarget, { get: responseGet })
    const readerPort = new Proxy(readerTarget, { get: readerGet })
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport: responsePort,
      responseReader: readerPort,
    })

    await expect(operation.execute({
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      limit: 2,
    })).resolves.toEqual({ envelopes: [], nextCursor: null, configRevision: 1 })
    expect(responseGet).toHaveBeenCalledOnce()
    expect(readerGet).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })

  it.each([
    ['response transport throws', {
      async execute() {
        throw new Error('credential=TOP_SECRET')
      },
    }, strictReader()],
    ['reader rejects', {
      async execute() {
        return trackedResponse('{"ok":true}').response
      },
    }, {
      async read() {
        throw new Error('credential=TOP_SECRET')
      },
    }],
    ['reader returns fail-closed result', {
      async execute() {
        return trackedResponse('{"ok":true}').response
      },
    }, {
      async read() {
        return { ok: false } as const
      },
    }],
  ])('uses one bounded error when %s', async (_label, responseTransport, responseReader) => {
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport,
      responseReader,
    })
    const error = await captureFailure(operation.execute({
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      limit: 2,
    }))

    expect(error).toBeInstanceOf(IdentityLifecyclePullJsonOperationFailure)
    expect(error.name).toBe('IdentityLifecyclePullJsonOperationFailure')
    expect(error.message).toBe('Identity lifecycle pull JSON operation failed')
    expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(error)).toEqual([])
  })

  it.each([
    ['rejecting Promise', () => Promise.reject(new Error('credential=TOP_SECRET'))],
    ['rejecting callable thenable', () => ({
      then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        reject(new Error('credential=TOP_SECRET'))
      },
    })],
    ['throwing then getter', () => Object.defineProperty({}, 'then', {
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })],
  ])('keeps %s assimilation inside the bounded error surface', async (_label, createValue) => {
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport: {
        async execute() {
          return trackedResponse('{"ok":true}').response
        },
      },
      responseReader: {
        async read() {
          return { ok: true as const, value: createValue() }
        },
      },
    })
    const error = await captureFailure(operation.execute({
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      limit: 2,
    }))

    expect(error).toBeInstanceOf(IdentityLifecyclePullJsonOperationFailure)
    expect(error.name).toBe('IdentityLifecyclePullJsonOperationFailure')
    expect(error.message).toBe('Identity lifecycle pull JSON operation failed')
    expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(error)).toEqual([])
  })

  it('assimilates a resolving thenable once while preserving ordinary JSON value identity', async () => {
    const resolved = { envelopes: [], nextCursor: null, configRevision: 1 }
    let thenReads = 0
    let thenCalls = 0
    const thenable = Object.defineProperty({}, 'then', {
      get() {
        thenReads += 1
        return (resolve: (value: unknown) => void) => {
          thenCalls += 1
          resolve(resolved)
        }
      },
    })
    const values = [thenable, resolved]
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport: {
        async execute() {
          return trackedResponse('{"ok":true}').response
        },
      },
      responseReader: {
        async read() {
          return { ok: true as const, value: values.shift() }
        },
      },
    })
    const request: IdentityLifecyclePullRequest = {
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      limit: 2,
    }

    await expect(operation.execute(request)).resolves.toBe(resolved)
    expect({ thenReads, thenCalls }).toEqual({ thenReads: 1, thenCalls: 1 })
    await expect(operation.execute(request)).resolves.toBe(resolved)
  })

  it('rejects duplicate JSON keys through the real strict reader', async () => {
    const { activity, response } = trackedResponse(
      '{"envelopes":[],"nextCursor":null,"configRevision":1,"configRevision":2}',
    )
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport: { execute: vi.fn(async () => response) },
      responseReader: strictReader(),
    })

    await expect(operation.execute({
      consumerId: 'academy-web',
      clientAssertion: ASSERTION,
      limit: 2,
    })).rejects.toBeInstanceOf(IdentityLifecyclePullJsonOperationFailure)
    expect(activity.pulls).toBe(1)
  })

  it.each([
    ['valid page commits', '{"envelopes":[],"nextCursor":null,"configRevision":1}', 'committed'],
    ['invalid cursor retries', '{"envelopes":[],"nextCursor":{"sequence":"1"},"configRevision":1}', 'retry_required'],
  ] as const)('%s through the real request, JSON, verifier, and lease boundaries', async (
    _label,
    body,
    expectedOutcome,
  ) => {
    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport: {
        execute: vi.fn(async () => trackedResponse(body).response),
      },
      responseReader: strictReader(),
    })
    const transport = createIdentityLifecycleVerifiedPageTransport({
      pageTransport: parsedTransport(operation),
      requestedLimit: 2,
      envelopePolicy: envelopePolicy(),
    })
    const { commitPageUnderLease, store } = createStore()

    const result = await runIdentityLifecyclePullCycle({
      store,
      transport,
      clock: { now: () => VERIFICATION_TIME },
      approvedConfigRevision: 1,
      workerId: 'academy-worker',
      leaseDurationMs: 30_000,
    })

    expect(result.outcome).toBe(expectedOutcome)
    expect(commitPageUnderLease).toHaveBeenCalledTimes(expectedOutcome === 'committed' ? 1 : 0)
  })

  it('stays endpoint, HTTP-policy, logger, and runtime disconnected', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/lifecycle-pull-json-operation.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/\b(?:fetch|URL|console|logger)\b/)
    expect(source).not.toContain('status')
    expect(source).not.toContain('registry')
    expect(source).not.toContain('wrangler')
  })
})
