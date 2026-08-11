import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityCodeExchangeJsonOperation,
  type IdentityCodeExchangeRequest,
} from '@/lib/identity/code-exchange-json-operation'
import {
  createIdentityCodeExchangeResponseTransport,
  IdentityCodeExchangeResponseTransportFailure,
  type IdentityCodeExchangeFetchPort,
} from '@/lib/identity/code-exchange-response-transport'
import { verifyIdentityCodeExchangeResult } from '@/lib/identity/code-exchange-result'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'

const ENDPOINT = 'https://accounts.example.test/v1/code/exchange'
const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const REQUEST: IdentityCodeExchangeRequest = {
  clientId: 'academy-web',
  clientAssertion: ASSERTION,
  redirectUri: 'https://academy.example.test/auth/callback',
  code: 'authorization-code-1234567890',
  codeVerifier: 'v'.repeat(48),
}
const RESULT = {
  issuer: 'https://identity.example.test/auth/v1',
  subject: 'learner-1',
  verifiedEmail: 'learner@example.test',
  audience: 'https://academy.example.test',
  serviceId: 'academy',
  nonce: 'nonce-value-1234567890',
  activation: { status: 'active', revision: 1 },
}

function acceptedResponse(body = '{}'): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
    },
  })
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected code exchange response transport failure')
  } catch (error) {
    return error as Error
  }
}

function expectBoundedFailure(error: Error): void {
  expect(error).toBeInstanceOf(IdentityCodeExchangeResponseTransportFailure)
  expect(error.name).toBe('IdentityCodeExchangeResponseTransportFailure')
  expect(error.message).toBe('Identity code exchange response transport failed')
  expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
    .not.toContain('TOP_SECRET')
  expect(Object.keys(error)).toEqual([])
}

function responseWithCancel(status: number, cacheControl = 'no-store') {
  let cancelCalls = 0
  const response = new Response(new ReadableStream({
    cancel() {
      cancelCalls += 1
    },
  }), {
    status,
    headers: {
      'cache-control': cacheControl,
      'content-type': 'application/json',
    },
  })
  return { response, cancelCalls: () => cancelCalls }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Academy Identity code exchange response transport', () => {
  it('sends one exact bounded POST and returns the accepted response unchanged', async () => {
    const response = acceptedResponse('{"ok":true}')
    let receivedEndpoint: unknown
    let receivedInit: RequestInit | undefined
    const fetchPort: IdentityCodeExchangeFetchPort = {
      async fetch(endpoint, init) {
        expect(this).toBe(fetchPort)
        receivedEndpoint = endpoint
        receivedInit = init
        return response
      },
    }
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort,
    })

    await expect(transport.execute(REQUEST)).resolves.toBe(response)
    expect(receivedEndpoint).toBe(ENDPOINT)
    expect(receivedInit?.method).toBe('POST')
    expect(receivedInit?.cache).toBe('no-store')
    expect(receivedInit?.credentials).toBe('omit')
    expect(receivedInit?.redirect).toBe('error')
    expect(receivedInit?.signal).toBeInstanceOf(AbortSignal)
    expect(receivedInit?.signal?.aborted).toBe(false)
    expect(new Headers(receivedInit?.headers).get('accept')).toBe('application/json')
    expect(new Headers(receivedInit?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(receivedInit?.body))).toEqual(REQUEST)
    expect(Reflect.ownKeys(JSON.parse(String(receivedInit?.body)))).toEqual([
      'clientId',
      'clientAssertion',
      'redirectUri',
      'code',
      'codeVerifier',
    ])
  })

  it('composes through strict JSON into the accepted result verifier', async () => {
    const responseTransport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch: async () => acceptedResponse(JSON.stringify(RESULT)) },
    })
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport,
      responseReader: {
        read: (response) => readStrictJsonResponse(response, {
          maxBytes: 16 * 1024,
          maxDepth: 8,
          timeoutMs: 1_000,
        }),
      },
    })

    const parsed = await operation.execute(REQUEST)

    expect(verifyIdentityCodeExchangeResult(parsed, {
      expectedIssuer: RESULT.issuer,
      audience: RESULT.audience,
      serviceId: RESULT.serviceId,
      nonce: RESULT.nonce,
    })).toEqual({ ok: true, result: RESULT })
  })

  it('captures public options and the fetch method once while preserving receivers', async () => {
    const fetch = vi.fn(async function (this: unknown) {
      expect(this).toBe(fetchPort)
      return acceptedResponse()
    })
    const fetchGet = vi.fn((target: { fetch: typeof fetch }, key: PropertyKey) => {
      if (key !== 'fetch') throw new Error('unexpected fetch-port property read')
      if (fetchGet.mock.calls.length > 1) throw new Error('fetch method re-read')
      return target.fetch
    })
    const fetchPort = new Proxy({ fetch }, { get: fetchGet })
    const reads = new Map<PropertyKey, number>()
    const options = new Proxy({ endpoint: ENDPOINT, timeoutMs: 1_000, fetchPort }, {
      get(target, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        if ((reads.get(key) ?? 0) > 1) throw new Error(`option ${String(key)} re-read`)
        return Reflect.get(target, key, receiver)
      },
    })
    const transport = createIdentityCodeExchangeResponseTransport(options)

    await expect(transport.execute(REQUEST)).resolves.toBeInstanceOf(Response)
    expect([...reads.entries()]).toEqual([
      ['endpoint', 1],
      ['timeoutMs', 1],
      ['fetchPort', 1],
    ])
    expect(fetchGet).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['HTTP endpoint', 'http://accounts.example.test/v1/code/exchange', 1_000],
    ['credentialed endpoint', 'https://user@accounts.example.test/v1/code/exchange', 1_000],
    ['fragment endpoint', `${ENDPOINT}#fragment`, 1_000],
    ['query endpoint', `${ENDPOINT}?tenant=academy`, 1_000],
    ['wrong route', 'https://accounts.example.test/v1/other', 1_000],
    ['noncanonical endpoint', 'https://ACCOUNTS.example.test/v1/code/exchange', 1_000],
    ['zero timeout', ENDPOINT, 0],
    ['overbound timeout', ENDPOINT, 5_001],
    ['fractional timeout', ENDPOINT, 1.5],
  ])('rejects %s during construction before reading the fetch method', (_label, endpoint, timeoutMs) => {
    let methodReads = 0
    const fetchPort = Object.defineProperty({}, 'fetch', {
      get() {
        methodReads += 1
        throw new Error('credential=TOP_SECRET')
      },
    }) as IdentityCodeExchangeFetchPort

    let failure: Error | undefined
    try {
      createIdentityCodeExchangeResponseTransport({ endpoint, timeoutMs, fetchPort })
    } catch (error) {
      failure = error as Error
    }

    expectBoundedFailure(failure!)
    expect(methodReads).toBe(0)
  })

  it.each([
    ['surplus field', { ...REQUEST, clientSecret: 'credential=TOP_SECRET' }],
    ['malformed assertion', { ...REQUEST, clientAssertion: 'not-a-compact-jws' }],
    ['short code', { ...REQUEST, code: 'short' }],
    ['malformed verifier', { ...REQUEST, codeVerifier: '*'.repeat(48) }],
  ])('rejects direct %s input before fetch', async (_label, request) => {
    const fetch = vi.fn(async () => acceptedResponse())
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    expectBoundedFailure(await captureFailure(transport.execute(request)))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects direct accessor and hostile reflection input without reading hidden values', async () => {
    let assertionGets = 0
    const accessor = { ...REQUEST }
    Object.defineProperty(accessor, 'clientAssertion', {
      enumerable: true,
      get() {
        assertionGets += 1
        return ASSERTION
      },
    })
    const hostile = new Proxy({ ...REQUEST }, {
      ownKeys() {
        throw new Error('credential=TOP_SECRET')
      },
    })
    const fetch = vi.fn(async () => acceptedResponse())
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    for (const request of [accessor, hostile]) {
      expectBoundedFailure(await captureFailure(transport.execute(request)))
    }
    expect(assertionGets).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['fetch throws', {
      async fetch() {
        throw new Error('credential=TOP_SECRET')
      },
    }],
    ['fetch rejects through a callable thenable', {
      fetch() {
        return {
          then(_resolve: (value: Response) => void, reject: (reason: unknown) => void) {
            reject(new Error('credential=TOP_SECRET'))
          },
        } as unknown as Promise<Response>
      },
    }],
    ['fetch returns a non-response', {
      async fetch() {
        return { status: 200, body: 'credential=TOP_SECRET' } as unknown as Response
      },
    }],
  ])('uses one bounded failure when %s', async (_label, fetchPort) => {
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort,
    })

    expectBoundedFailure(await captureFailure(transport.execute(REQUEST)))
  })

  it.each([
    ['non-200 status', 503, 'no-store'],
    ['missing no-store', 200, 'private'],
  ])('cancels and rejects a response with %s', async (_label, status, cacheControl) => {
    const rejected = responseWithCancel(status, cacheControl)
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch: async () => rejected.response },
    })

    expectBoundedFailure(await captureFailure(transport.execute(REQUEST)))
    await Promise.resolve()
    expect(rejected.cancelCalls()).toBe(1)
    expect(rejected.response.body?.locked).toBe(false)
  })

  it('fails on its own deadline even when fetch ignores the AbortSignal', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 5,
      fetchPort: {
        fetch(_endpoint, init) {
          signal = init.signal ?? undefined
          return new Promise<Response>(() => undefined)
        },
      },
    })
    const failure = captureFailure(transport.execute(REQUEST))

    await vi.advanceTimersByTimeAsync(5)

    expectBoundedFailure(await failure)
    expect(signal?.aborted).toBe(true)
  })

  it('keeps the deadline bounded when abort dispatch mutates and then throws', async () => {
    vi.useFakeTimers()
    const nativeAbort = AbortController.prototype.abort
    const abort = vi.spyOn(AbortController.prototype, 'abort').mockImplementation(function (
      this: AbortController,
      reason?: unknown,
    ) {
      nativeAbort.call(this, reason)
      throw new Error('credential=TOP_SECRET')
    })
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 5,
      fetchPort: { fetch: () => new Promise<Response>(() => undefined) },
    })
    const failure = captureFailure(transport.execute(REQUEST))

    await vi.advanceTimersByTimeAsync(5)

    expectBoundedFailure(await failure)
    expect(abort).toHaveBeenCalledOnce()
  })

  it('bounds AbortController construction failure before timer or fetch use', async () => {
    const fetch = vi.fn(async () => acceptedResponse())
    vi.stubGlobal('AbortController', class {
      constructor() {
        throw new Error('credential=TOP_SECRET')
      }
    })
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    expectBoundedFailure(await captureFailure(transport.execute(REQUEST)))
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds timer setup failure before fetch use', async () => {
    const fetch = vi.fn(async () => acceptedResponse())
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => {
      throw new Error('credential=TOP_SECRET')
    }) as unknown as typeof setTimeout)
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    expectBoundedFailure(await captureFailure(transport.execute(REQUEST)))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds timeout-reason construction failure and clears the armed timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('DOMException', class {
      constructor() {
        throw new Error('credential=TOP_SECRET')
      }
    })
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 5,
      fetchPort: { fetch: () => new Promise<Response>(() => undefined) },
    })
    const failure = captureFailure(transport.execute(REQUEST))

    await vi.advanceTimersByTimeAsync(5)

    expectBoundedFailure(await failure)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds timer cleanup failure and cancels the response it cannot return', async () => {
    const rejected = responseWithCancel(200)
    const nativeClearTimeout = globalThis.clearTimeout
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((timer) => {
      nativeClearTimeout(timer)
      throw new Error('credential=TOP_SECRET')
    }) as typeof clearTimeout)
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort: { fetch: async () => rejected.response },
    })

    expectBoundedFailure(await captureFailure(transport.execute(REQUEST)))
    await Promise.resolve()
    expect(rejected.cancelCalls()).toBe(1)
    expect(rejected.response.body?.locked).toBe(false)
  })

  it('cancels a response that arrives after the deadline without an unhandled rejection', async () => {
    vi.useFakeTimers()
    let resolveFetch: (response: Response) => void = () => undefined
    const late = responseWithCancel(200)
    const transport = createIdentityCodeExchangeResponseTransport({
      endpoint: ENDPOINT,
      timeoutMs: 5,
      fetchPort: {
        fetch() {
          return new Promise<Response>((resolve) => {
            resolveFetch = resolve
          })
        },
      },
    })
    const failure = captureFailure(transport.execute(REQUEST))

    await vi.advanceTimersByTimeAsync(5)
    expectBoundedFailure(await failure)
    resolveFetch(late.response)
    await Promise.resolve()
    await Promise.resolve()

    expect(late.cancelCalls()).toBe(1)
    expect(late.response.body?.locked).toBe(false)
  })

  it('keeps production endpoint values, runtime wiring, and logs outside this module', () => {
    const source = readFileSync(new URL('../../src/lib/identity/code-exchange-response-transport.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/accounts\.cyberskills\.co\.th|supabase\.cyberskills\.co\.th/)
    expect(source).not.toMatch(/process\.env|wrangler|registry|console\.|logger\./i)
  })
})
