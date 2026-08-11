import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import {
  createIdentityCodeExchangeAdapter,
  IdentityCodeExchangeAdapterFailure,
} from '@/lib/identity/code-exchange-adapter'
import type { IdentityCodeExchangeJsonOperation } from '@/lib/identity/code-exchange-json-operation'
import { createIdentityCodeExchangeTransport } from '@/lib/identity/code-exchange-transport'
import {
  beginIdentityAuthorization,
  completeIdentityCallback,
  InMemoryIdentityTransactionStore,
  type LocalIdentityClient,
} from '@/lib/identity/transaction'

const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const CLIENT: LocalIdentityClient = {
  clientId: 'academy-web',
  redirectUri: 'https://academy.example.test/auth/callback',
  serviceId: 'academy',
  audience: 'https://academy.example.test',
  expectedIssuer: 'https://identity.example.test/auth/v1',
  clientAssertionAudience: 'https://accounts.example.test/v1/code/exchange',
}
const REQUEST = {
  clientId: CLIENT.clientId,
  clientAssertion: ASSERTION,
  redirectUri: CLIENT.redirectUri,
  code: 'authorization-code-1234567890',
  codeVerifier: 'v'.repeat(48),
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected code exchange adapter failure')
  } catch (error) {
    return error as Error
  }
}

function expectBoundedFailure(error: Error): void {
  expect(error).toBeInstanceOf(IdentityCodeExchangeAdapterFailure)
  expect(error.name).toBe('IdentityCodeExchangeAdapterFailure')
  expect(error.message).toBe('Identity code exchange adapter failed')
  expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
    .not.toContain('TOP_SECRET')
  expect(Object.keys(error)).toEqual([])
}

describe('Academy Identity code exchange adapter', () => {
  it('exposes only the exchange capability and preserves the operation receiver and value', async () => {
    const value = { parsed: 'untrusted-until-callback-verification' }
    const execute = vi.fn(async function (this: unknown, request: unknown) {
      expect(this).toBe(operation)
      expect(request).toBe(REQUEST)
      return value
    })
    const methodReads = vi.fn((target: { execute: typeof execute }, key: PropertyKey) => {
      if (key !== 'execute') throw new Error('unexpected operation property read')
      return target.execute
    })
    const operation = new Proxy({ execute }, { get: methodReads })
    const optionReads = new Map<PropertyKey, number>()
    const options = new Proxy({ operation }, {
      get(target, key, receiver) {
        optionReads.set(key, (optionReads.get(key) ?? 0) + 1)
        return Reflect.get(target, key, receiver)
      },
    })

    const port = createIdentityCodeExchangeAdapter(options)

    await expect(port.exchangeCode(REQUEST)).resolves.toBe(value)
    expect(Reflect.ownKeys(port)).toEqual(['exchangeCode'])
    expect(Object.fromEntries(optionReads)).toEqual({ operation: 1 })
    expect(methodReads).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
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
  ])('keeps %s assimilation inside one bounded failure', async (_label, createValue) => {
    const operation = {
      execute: () => createValue() as Promise<unknown>,
    }
    const port = createIdentityCodeExchangeAdapter({ operation })

    expectBoundedFailure(await captureFailure(port.exchangeCode(REQUEST)))
  })

  it('uses the same bounded construction failure for hostile option and method access', () => {
    const cases = [
      new Proxy({}, {
        get() {
          throw new Error('credential=TOP_SECRET')
        },
      }),
      {
        operation: Object.defineProperty({}, 'execute', {
          get() {
            throw new Error('credential=TOP_SECRET')
          },
        }),
      },
    ]

    for (const input of cases) {
      let failure: Error | undefined
      try {
        createIdentityCodeExchangeAdapter(input as { operation: IdentityCodeExchangeJsonOperation })
      } catch (error) {
        failure = error as Error
      }
      expectBoundedFailure(failure!)
    }
  })

  it('drives the real local callback seam without broad adapter authority', async () => {
    const store = new InMemoryIdentityTransactionStore()
    const started = beginIdentityAuthorization(store, CLIENT, '/dashboard', () => REQUEST.codeVerifier)
    let receivedEndpoint: unknown
    let receivedInit: RequestInit | undefined
    const operation = createIdentityCodeExchangeTransport({
      endpoint: CLIENT.clientAssertionAudience,
      timeoutMs: 1_000,
      fetchPort: {
        async fetch(endpoint, init) {
          receivedEndpoint = endpoint
          receivedInit = init
          return new Response(JSON.stringify({
            issuer: CLIENT.expectedIssuer,
            subject: 'learner-1',
            verifiedEmail: 'learner@example.test',
            audience: CLIENT.audience,
            serviceId: CLIENT.serviceId,
            nonce: started.request.nonce,
            activation: { status: 'active', revision: 1 },
          }), {
            status: 200,
            headers: {
              'cache-control': 'private, no-store',
              'content-type': 'application/json',
            },
          })
        },
      },
      responseReader: {
        read: (response) => readStrictJsonResponse(response, {
          maxBytes: 16 * 1024,
          maxDepth: 8,
          timeoutMs: 1_000,
        }),
      },
    })
    const exchangePort = createIdentityCodeExchangeAdapter({ operation })

    const completed = await completeIdentityCallback({
      adapter: exchangePort,
      store,
      client: CLIENT,
      callback: { code: REQUEST.code, state: started.state },
      browserBinding: started.browserBinding,
      clientAssertionProvider: { createClientAssertion: async () => ASSERTION },
    })

    expect(completed).toMatchObject({
      returnPath: '/dashboard',
      exchange: {
        issuer: CLIENT.expectedIssuer,
        subject: 'learner-1',
        audience: CLIENT.audience,
        serviceId: CLIENT.serviceId,
        nonce: started.request.nonce,
      },
    })
    expect(receivedEndpoint).toBe(CLIENT.clientAssertionAudience)
    expect(receivedInit?.method).toBe('POST')
    expect(JSON.parse(String(receivedInit?.body))).toEqual({
      clientId: CLIENT.clientId,
      clientAssertion: ASSERTION,
      redirectUri: CLIENT.redirectUri,
      code: REQUEST.code,
      codeVerifier: REQUEST.codeVerifier,
    })
  })

  it('keeps network, runtime, registry, and production values outside the adapter', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/code-exchange-adapter.ts',
      import.meta.url,
    ), 'utf8')

    expect(source).not.toMatch(/\bfetch\s*\(|\bResponse\b|process\.env|registry|wrangler/i)
    expect(source).not.toMatch(/accounts\.cyberskills\.co\.th|supabase\.cyberskills\.co\.th/)
  })
})
