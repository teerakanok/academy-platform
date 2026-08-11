import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import {
  IdentityCodeExchangeJsonOperationFailure,
  type IdentityCodeExchangeRequest,
} from '@/lib/identity/code-exchange-json-operation'
import {
  createIdentityCodeExchangeTransport,
  IdentityCodeExchangeTransportFailure,
  type IdentityCodeExchangeTransportOptions,
} from '@/lib/identity/code-exchange-transport'
import { verifyIdentityCodeExchangeResult } from '@/lib/identity/code-exchange-result'

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

function acceptedResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
    },
  })
}

function createOptions(
  fetchPort: IdentityCodeExchangeTransportOptions['fetchPort'],
): IdentityCodeExchangeTransportOptions {
  const responseReader = {
    async read(response: Response) {
      expect(this).toBe(responseReader)
      return readStrictJsonResponse(response, {
        maxBytes: 16 * 1024,
        maxDepth: 8,
        timeoutMs: 1_000,
      })
    },
  }
  return {
    endpoint: ENDPOINT,
    timeoutMs: 1_000,
    fetchPort,
    responseReader,
  }
}

function expectConstructionFailure(input: unknown): void {
  expect(input).toBeInstanceOf(IdentityCodeExchangeTransportFailure)
  const error = input as Error
  expect(error.name).toBe('IdentityCodeExchangeTransportFailure')
  expect(error.message).toBe('Identity code exchange transport failed')
  expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
    .not.toContain('TOP_SECRET')
  expect(Object.keys(error)).toEqual([])
}

describe('Academy Identity code exchange transport composition', () => {
  it('composes an exact POST through strict parsing into the transaction verifier', async () => {
    let receivedEndpoint: unknown
    let receivedInit: RequestInit | undefined
    const fetchPort = {
      async fetch(endpoint: string, init: RequestInit) {
        expect(this).toBe(fetchPort)
        receivedEndpoint = endpoint
        receivedInit = init
        return acceptedResponse(JSON.stringify(RESULT))
      },
    }
    const operation = createIdentityCodeExchangeTransport(createOptions(fetchPort))

    const parsed = await operation.execute(REQUEST)

    expect(receivedEndpoint).toBe(ENDPOINT)
    expect(receivedInit?.method).toBe('POST')
    expect(JSON.parse(String(receivedInit?.body))).toEqual(REQUEST)
    expect(verifyIdentityCodeExchangeResult(parsed, {
      expectedIssuer: RESULT.issuer,
      audience: RESULT.audience,
      serviceId: RESULT.serviceId,
      nonce: RESULT.nonce,
    })).toEqual({ ok: true, result: RESULT })
  })

  it('snapshots every public option and nested port method once with original receivers', async () => {
    const fetch = vi.fn(async function (this: unknown) {
      expect(this).toBe(fetchPort)
      return acceptedResponse(JSON.stringify(RESULT))
    })
    const fetchGet = vi.fn((target: { fetch: typeof fetch }, key: PropertyKey) => {
      if (key !== 'fetch') throw new Error('unexpected fetch-port property read')
      return target.fetch
    })
    const fetchPort = new Proxy({ fetch }, { get: fetchGet })
    const read = vi.fn(async function (this: unknown, response: Response) {
      expect(this).toBe(responseReader)
      return readStrictJsonResponse(response, {
        maxBytes: 16 * 1024,
        maxDepth: 8,
        timeoutMs: 1_000,
      })
    })
    const readerGet = vi.fn((target: { read: typeof read }, key: PropertyKey) => {
      if (key !== 'read') throw new Error('unexpected reader property read')
      return target.read
    })
    const responseReader = new Proxy({ read }, { get: readerGet })
    const reads = new Map<PropertyKey, number>()
    const options = new Proxy({
      endpoint: ENDPOINT,
      timeoutMs: 1_000,
      fetchPort,
      responseReader,
    }, {
      get(target, key, receiver) {
        const count = (reads.get(key) ?? 0) + 1
        reads.set(key, count)
        if (count > 1) throw new Error(`composition option re-read: ${String(key)}`)
        return Reflect.get(target, key, receiver)
      },
    })
    const operation = createIdentityCodeExchangeTransport(options)

    await expect(operation.execute(REQUEST)).resolves.toEqual(RESULT)
    expect(Object.fromEntries(reads)).toEqual({
      endpoint: 1,
      timeoutMs: 1,
      fetchPort: 1,
      responseReader: 1,
    })
    expect(fetchGet).toHaveBeenCalledOnce()
    expect(readerGet).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })

  it.each([
    ['invalid endpoint', 'http://accounts.example.test/v1/code/exchange', 1_000],
    ['invalid timeout', ENDPOINT, 5_001],
  ])('rejects %s before reading either nested port method', (_label, endpoint, timeoutMs) => {
    const fetchGet = vi.fn(() => {
      throw new Error('fetch method must not be read')
    })
    const readerGet = vi.fn(() => {
      throw new Error('reader method must not be read')
    })
    const fetchPort = new Proxy({}, { get: fetchGet }) as IdentityCodeExchangeTransportOptions['fetchPort']
    const responseReader = new Proxy({}, { get: readerGet }) as IdentityCodeExchangeTransportOptions['responseReader']

    let failure: unknown
    try {
      createIdentityCodeExchangeTransport({ endpoint, timeoutMs, fetchPort, responseReader })
    } catch (error) {
      failure = error
    }

    expectConstructionFailure(failure)
    expect(fetchGet).not.toHaveBeenCalled()
    expect(readerGet).not.toHaveBeenCalled()
  })

  it('uses one fixed construction failure when a public option getter throws', () => {
    const input = new Proxy(createOptions({
      fetch: async () => acceptedResponse('{}'),
    }), {
      get(target, key, receiver) {
        if (key === 'timeoutMs') throw new Error('credential=TOP_SECRET')
        return Reflect.get(target, key, receiver)
      },
    })

    let failure: unknown
    try {
      createIdentityCodeExchangeTransport(input)
    } catch (error) {
      failure = error
    }

    expectConstructionFailure(failure)
  })

  it('keeps duplicate semantic JSON untrusted and detail-free', async () => {
    const operation = createIdentityCodeExchangeTransport(createOptions({
      fetch: async () => acceptedResponse(
        '{"issuer":"one","issuer":"two","subject":"credential=TOP_SECRET"}',
      ),
    }))

    let failure: Error | undefined
    try {
      await operation.execute(REQUEST)
    } catch (error) {
      failure = error as Error
    }

    expect(failure).toBeInstanceOf(IdentityCodeExchangeJsonOperationFailure)
    expect(failure?.message).toBe('Identity code exchange JSON operation failed')
    expect([String(failure), failure?.stack ?? '', JSON.stringify(failure)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(failure!)).toEqual([])
  })

  it('keeps production values, runtime wiring, and direct network APIs outside composition', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/code-exchange-transport.ts',
      import.meta.url,
    ), 'utf8')

    expect(source).not.toMatch(/accounts\.cyberskills\.co\.th|supabase\.cyberskills\.co\.th/)
    expect(source).not.toMatch(/\bfetch\s*\(|process\.env|registry|wrangler|console\.|logger\./i)
  })
})
