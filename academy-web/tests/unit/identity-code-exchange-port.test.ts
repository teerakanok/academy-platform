import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import { IdentityCodeExchangeAdapterFailure } from '@/lib/identity/code-exchange-adapter'
import {
  createIdentityCodeExchangePort,
  IdentityCodeExchangePortFailure,
  type IdentityCodeExchangePortOptions,
} from '@/lib/identity/code-exchange-port'
import type {
  IdentityCodeExchangeRuntimeConfigInput,
} from '@/lib/identity/code-exchange-runtime-config'
import {
  beginIdentityAuthorization,
  completeIdentityCallback,
  InMemoryIdentityTransactionStore,
  type LocalIdentityAuthorizationRegistration,
  type LocalIdentityClient,
} from '@/lib/identity/transaction'

const ENDPOINT = 'https://accounts.example.test/v1/code/exchange'
const ADMITTED_CONFIG: IdentityCodeExchangeRuntimeConfigInput = {
  enabled: true,
  releaseApproval: true,
  endpoint: ENDPOINT,
  clientAssertionAudience: ENDPOINT,
  timeoutMs: 1_000,
}
const ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`
const CLIENT: LocalIdentityClient = {
  clientId: 'academy-web',
  redirectUri: 'https://academy.example.test/auth/callback',
  serviceId: 'academy',
  audience: 'https://academy.example.test',
  expectedIssuer: 'https://identity.example.test/auth/v1',
  clientAssertionAudience: ENDPOINT,
}
const REGISTRATION = {
  client: CLIENT,
  redirectUris: [CLIENT.redirectUri],
} as const satisfies LocalIdentityAuthorizationRegistration
const REQUEST = {
  clientId: CLIENT.clientId,
  clientAssertion: ASSERTION,
  redirectUri: CLIENT.redirectUri,
  code: 'authorization-code-1234567890',
  codeVerifier: 'v'.repeat(48),
}
const RESULT = {
  issuer: CLIENT.expectedIssuer,
  subject: 'learner-1',
  verifiedEmail: 'learner@example.test',
  audience: CLIENT.audience,
  serviceId: CLIENT.serviceId,
  nonce: 'nonce-value-1234567890',
  activation: { status: 'active', revision: 1 },
}

function acceptedResponse(value: unknown = RESULT): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
    },
  })
}

function strictReader() {
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
  return responseReader
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected code exchange port failure')
  } catch (error) {
    return error as Error
  }
}

function expectConstructionFailure(error: Error): void {
  expect(error).toBeInstanceOf(IdentityCodeExchangePortFailure)
  expect(error.name).toBe('IdentityCodeExchangePortFailure')
  expect(error.message).toBe('Identity code exchange port construction failed')
  expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
    .not.toContain('TOP_SECRET')
  expect(Object.keys(error)).toEqual([])
}

describe('Academy Identity final code exchange port composition', () => {
  it('executes the exact accepted operation through the least-capability port', async () => {
    let receivedEndpoint: unknown
    let receivedInit: RequestInit | undefined
    const port = createIdentityCodeExchangePort({
      config: ADMITTED_CONFIG,
      fetchPort: {
        async fetch(endpoint, init) {
          receivedEndpoint = endpoint
          receivedInit = init
          return acceptedResponse()
        },
      },
      responseReader: strictReader(),
    })

    await expect(port.exchangeCode(REQUEST)).resolves.toEqual(RESULT)
    expect(Reflect.ownKeys(port)).toEqual(['exchangeCode'])
    expect(receivedEndpoint).toBe(ENDPOINT)
    expect(receivedInit?.method).toBe('POST')
    expect(JSON.parse(String(receivedInit?.body))).toEqual(REQUEST)
  })

  it('reads every option and nested method once and preserves both receivers', async () => {
    const fetch = vi.fn(async function (this: unknown) {
      expect(this).toBe(fetchPort)
      return acceptedResponse()
    })
    const fetchReads = vi.fn((target: { fetch: typeof fetch }, key: PropertyKey) => {
      if (key !== 'fetch') throw new Error('unexpected fetch property read')
      return target.fetch
    })
    const fetchPort = new Proxy({ fetch }, { get: fetchReads })
    const read = vi.fn(async function (this: unknown, response: Response) {
      expect(this).toBe(responseReader)
      return readStrictJsonResponse(response, { maxBytes: 16 * 1024, maxDepth: 8 })
    })
    const readerReads = vi.fn((target: { read: typeof read }, key: PropertyKey) => {
      if (key !== 'read') throw new Error('unexpected reader property read')
      return target.read
    })
    const responseReader = new Proxy({ read }, { get: readerReads })
    const optionReads = new Map<PropertyKey, number>()
    const configReads = new Map<PropertyKey, number>()
    const configGet = vi.fn(() => {
      throw new Error('runtime config must not use ordinary property access')
    })
    const config = new Proxy({ ...ADMITTED_CONFIG }, {
      get: configGet,
      getOwnPropertyDescriptor(target, key) {
        configReads.set(key, (configReads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const options = new Proxy({
      config,
      fetchPort,
      responseReader,
    }, {
      get(target, key, receiver) {
        optionReads.set(key, (optionReads.get(key) ?? 0) + 1)
        return Reflect.get(target, key, receiver)
      },
    })

    const port = createIdentityCodeExchangePort(options)

    await expect(port.exchangeCode(REQUEST)).resolves.toEqual(RESULT)
    expect(Object.fromEntries(optionReads)).toEqual({
      config: 1,
      fetchPort: 1,
      responseReader: 1,
    })
    expect(configGet).not.toHaveBeenCalled()
    expect(Object.fromEntries(configReads)).toEqual({
      enabled: 1,
      releaseApproval: 1,
      endpoint: 1,
      clientAssertionAudience: 1,
      timeoutMs: 1,
    })
    expect(fetchReads).toHaveBeenCalledOnce()
    expect(readerReads).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })

  it.each([
    ['disabled and unreleased', {
      ...ADMITTED_CONFIG,
      enabled: false,
      releaseApproval: false,
    }],
    ['disabled despite release approval', {
      ...ADMITTED_CONFIG,
      enabled: false,
      releaseApproval: true,
    }],
    ['unreleased despite enablement', {
      ...ADMITTED_CONFIG,
      enabled: true,
      releaseApproval: false,
    }],
    ['malformed scalar config', {
      ...ADMITTED_CONFIG,
      timeoutMs: 5_001,
    }],
  ])('rejects %s before reading either nested method', (_label, config) => {
    const fetchGet = vi.fn(() => {
      throw new Error('fetch method must not be read')
    })
    const readerGet = vi.fn(() => {
      throw new Error('reader method must not be read')
    })
    const input = {
      config,
      fetchPort: new Proxy({}, { get: fetchGet }),
      responseReader: new Proxy({}, { get: readerGet }),
    } as IdentityCodeExchangePortOptions

    let failure: Error | undefined
    try {
      createIdentityCodeExchangePort(input)
    } catch (error) {
      failure = error as Error
    }

    expectConstructionFailure(failure!)
    expect(fetchGet).not.toHaveBeenCalled()
    expect(readerGet).not.toHaveBeenCalled()
  })

  it('uses one bounded construction error for a hostile public option', () => {
    const input = new Proxy({
      config: ADMITTED_CONFIG,
      fetchPort: { fetch: async () => acceptedResponse() },
      responseReader: strictReader(),
    }, {
      get(target, key, receiver) {
        if (key === 'config') throw new Error('credential=TOP_SECRET')
        return Reflect.get(target, key, receiver)
      },
    })

    let failure: Error | undefined
    try {
      createIdentityCodeExchangePort(input)
    } catch (error) {
      failure = error as Error
    }

    expectConstructionFailure(failure!)
  })

  it('keeps execution failures on the accepted bounded adapter surface', async () => {
    const port = createIdentityCodeExchangePort({
      config: ADMITTED_CONFIG,
      fetchPort: {
        async fetch() {
          throw new Error('credential=TOP_SECRET')
        },
      },
      responseReader: strictReader(),
    })

    const failure = await captureFailure(port.exchangeCode(REQUEST))
    expect(failure).toBeInstanceOf(IdentityCodeExchangeAdapterFailure)
    expect(failure.message).toBe('Identity code exchange adapter failed')
    expect([String(failure), failure.stack ?? '', JSON.stringify(failure)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(failure)).toEqual([])
  })

  it('completes the real local callback seam without a broad adapter', async () => {
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, REGISTRATION, '/dashboard', () => REQUEST.codeVerifier)
    const port = createIdentityCodeExchangePort({
      config: ADMITTED_CONFIG,
      fetchPort: {
        fetch: async () => acceptedResponse({ ...RESULT, nonce: started.request.nonce }),
      },
      responseReader: strictReader(),
    })

    await expect(completeIdentityCallback({
      adapter: port,
      store,
      client: CLIENT,
      callback: { code: REQUEST.code, state: started.state },
      browserBinding: started.browserBinding,
      clientAssertionProvider: { createClientAssertion: async () => ASSERTION },
    })).resolves.toMatchObject({
      returnPath: '/dashboard',
      exchange: {
        issuer: CLIENT.expectedIssuer,
        subject: RESULT.subject,
        nonce: started.request.nonce,
      },
    })
  })

  it('keeps runtime wiring and production values outside the final composition', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/code-exchange-port.ts',
      import.meta.url,
    ), 'utf8')

    expect(source).toContain('projectIdentityCodeExchangeRuntimeConfig')
    expect(source).not.toMatch(/\bfetch\s*\(|\bResponse\b|process\.env|registry|wrangler/i)
    expect(source).not.toMatch(/accounts\.cyberskills\.co\.th|supabase\.cyberskills\.co\.th/)
  })
})
