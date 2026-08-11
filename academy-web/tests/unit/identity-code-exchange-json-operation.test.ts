import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import {
  createIdentityCodeExchangeJsonOperation,
  IdentityCodeExchangeJsonOperationFailure,
  type IdentityCodeExchangeRequest,
} from '@/lib/identity/code-exchange-json-operation'
import { verifyIdentityCodeExchangeResult } from '@/lib/identity/code-exchange-result'

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

function strictReader() {
  const reader = {
    async read(response: Response) {
      expect(this).toBe(reader)
      return readStrictJsonResponse(response, {
        maxBytes: 16 * 1024,
        maxDepth: 8,
        timeoutMs: 1_000,
      })
    },
  }
  return reader
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected code exchange JSON operation failure')
  } catch (error) {
    return error as Error
  }
}

function expectBoundedFailure(error: Error): void {
  expect(error).toBeInstanceOf(IdentityCodeExchangeJsonOperationFailure)
  expect(error.name).toBe('IdentityCodeExchangeJsonOperationFailure')
  expect(error.message).toBe('Identity code exchange JSON operation failed')
  expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
    .not.toContain('TOP_SECRET')
  expect(Object.keys(error)).toEqual([])
}

describe('Academy Identity code exchange JSON operation', () => {
  it('sends a fresh exact request projection and returns strict parsed JSON', async () => {
    let received: IdentityCodeExchangeRequest | undefined
    const responseTransport = {
      async execute(request: IdentityCodeExchangeRequest) {
        expect(this).toBe(responseTransport)
        received = request
        return Response.json(RESULT, { headers: { 'cache-control': 'no-store' } })
      },
    }
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport,
      responseReader: strictReader(),
    })

    await expect(operation.execute(REQUEST)).resolves.toEqual(RESULT)
    expect(received).toEqual(REQUEST)
    expect(received).not.toBe(REQUEST)
    expect(Reflect.ownKeys(received!)).toEqual([
      'clientId',
      'clientAssertion',
      'redirectUri',
      'code',
      'codeVerifier',
    ])
  })

  it('captures both port methods once and preserves their receivers', async () => {
    const execute = vi.fn(async function (this: unknown) {
      expect(this).toBe(responsePort)
      return Response.json(RESULT)
    })
    const read = vi.fn(async function (this: unknown, response: Response) {
      expect(this).toBe(readerPort)
      return readStrictJsonResponse(response, { maxBytes: 16 * 1024, maxDepth: 8 })
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
    const responsePort = new Proxy({ execute }, { get: responseGet })
    const readerPort = new Proxy({ read }, { get: readerGet })
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport: responsePort,
      responseReader: readerPort,
    })

    await expect(operation.execute(REQUEST)).resolves.toEqual(RESULT)
    expect(responseGet).toHaveBeenCalledOnce()
    expect(readerGet).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })

  it.each([
    ['surplus field', { ...REQUEST, clientSecret: 'credential=TOP_SECRET' }],
    ['short client ID', { ...REQUEST, clientId: '' }],
    ['malformed assertion', { ...REQUEST, clientAssertion: 'not-a-compact-jws' }],
    ['noncanonical redirect', { ...REQUEST, redirectUri: 'http://127.0.0.1/callback' }],
    ['short code', { ...REQUEST, code: 'short' }],
    ['malformed verifier', { ...REQUEST, codeVerifier: '*'.repeat(48) }],
  ])('rejects %s before calling the response transport', async (_label, request) => {
    const execute = vi.fn(async () => Response.json(RESULT))
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport: { execute },
      responseReader: strictReader(),
    })

    expectBoundedFailure(await captureFailure(operation.execute(request)))
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects accessor and hostile Proxy request input without reading hidden values', async () => {
    let getterCalls = 0
    const accessorRequest = { ...REQUEST }
    Object.defineProperty(accessorRequest, 'clientAssertion', {
      enumerable: true,
      get() {
        getterCalls += 1
        return ASSERTION
      },
    })
    const proxyRequest = new Proxy({ ...REQUEST }, {
      ownKeys() {
        throw new Error('credential=TOP_SECRET')
      },
    })
    const execute = vi.fn(async () => Response.json(RESULT))
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport: { execute },
      responseReader: strictReader(),
    })

    for (const request of [accessorRequest, proxyRequest]) {
      expectBoundedFailure(await captureFailure(operation.execute(request)))
    }
    expect(getterCalls).toBe(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    ['response transport throws', {
      async execute() {
        throw new Error('credential=TOP_SECRET')
      },
    }, strictReader()],
    ['strict reader throws', {
      async execute() {
        return Response.json(RESULT)
      },
    }, {
      async read() {
        throw new Error('credential=TOP_SECRET')
      },
    }],
    ['strict reader returns fail-closed', {
      async execute() {
        return Response.json(RESULT)
      },
    }, {
      async read() {
        return { ok: false } as const
      },
    }],
  ])('uses one bounded error when %s', async (_label, responseTransport, responseReader) => {
    const operation = createIdentityCodeExchangeJsonOperation({ responseTransport, responseReader })

    expectBoundedFailure(await captureFailure(operation.execute(REQUEST)))
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
  ])('keeps %s assimilation inside the bounded failure surface', async (_label, createValue) => {
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport: { execute: async () => Response.json(RESULT) },
      responseReader: { read: async () => ({ ok: true as const, value: createValue() }) },
    })

    expectBoundedFailure(await captureFailure(operation.execute(REQUEST)))
  })

  it('hands the parsed unknown to the accepted result verifier before trust', async () => {
    const operation = createIdentityCodeExchangeJsonOperation({
      responseTransport: { execute: async () => Response.json(RESULT) },
      responseReader: strictReader(),
    })
    const parsed = await operation.execute(REQUEST)

    expect(verifyIdentityCodeExchangeResult(parsed, {
      audience: RESULT.audience,
      expectedIssuer: RESULT.issuer,
      nonce: RESULT.nonce,
      serviceId: RESULT.serviceId,
    })).toEqual({ ok: true, result: RESULT })
  })

  it('keeps endpoint, fetch, status, and runtime wiring outside this module', () => {
    const source = readFileSync(new URL('../../src/lib/identity/code-exchange-json-operation.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/\bnew\s+Request\b/)
    expect(source).not.toMatch(/accounts\.cyberskills\.co\.th|supabase\.cyberskills\.co\.th/)
    expect(source).not.toMatch(/console\.|logger\.|registry|wrangler/i)
  })
})
