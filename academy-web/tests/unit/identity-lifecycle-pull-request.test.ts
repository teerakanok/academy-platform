import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createIdentityLifecyclePullRequestBuilder,
  IdentityLifecyclePullRequestFailure,
} from '@/lib/identity/lifecycle-pull-request'

const CONSUMER_ID = 'academy-web'
const ASSERTION_AUDIENCE = 'https://identity.example.test/v1/lifecycle/pull'
const CLIENT_ASSERTION = `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}`

function createProvider(assertion = CLIENT_ASSERTION) {
  return {
    createClientAssertion: vi.fn(async () => assertion),
  }
}

function createBuilder(overrides: Record<string, unknown> = {}) {
  return createIdentityLifecyclePullRequestBuilder({
    consumerId: CONSUMER_ID,
    clientAssertionAudience: ASSERTION_AUDIENCE,
    requestedLimit: 50,
    clientAssertionProvider: createProvider(),
    ...overrides,
  })
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('expected request-builder failure')
  } catch (error) {
    return error as Error
  }
}

describe('Academy Identity lifecycle pull request builder', () => {
  it('creates the exact initial request and binds the signer to consumer and audience', async () => {
    const clientAssertionProvider = createProvider()
    const builder = createBuilder({ clientAssertionProvider })

    await expect(builder.createRequest({ cursor: null })).resolves.toEqual({
      consumerId: CONSUMER_ID,
      clientAssertion: CLIENT_ASSERTION,
      limit: 50,
    })
    expect(clientAssertionProvider.createClientAssertion).toHaveBeenCalledOnce()
    expect(clientAssertionProvider.createClientAssertion).toHaveBeenCalledWith({
      consumerId: CONSUMER_ID,
      audience: ASSERTION_AUDIENCE,
    })
  })

  it('creates a fresh continued request with the exact canonical cursor', async () => {
    const builder = createBuilder()

    const first = await builder.createRequest({ cursor: '42' })
    const second = await builder.createRequest({ cursor: '42' })

    expect(first).toEqual({
      consumerId: CONSUMER_ID,
      clientAssertion: CLIENT_ASSERTION,
      cursor: { sequence: '42' },
      limit: 50,
    })
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.cursor).not.toBe(first.cursor)
  })

  it.each([
    ['empty consumer', { consumerId: '' }],
    ['invalid consumer', { consumerId: 'bad consumer' }],
    ['overbound consumer', { consumerId: `a${'b'.repeat(160)}` }],
    ['HTTP audience', { clientAssertionAudience: 'http://identity.example.test/pull' }],
    ['credentialed audience', { clientAssertionAudience: 'https://user@identity.example.test/pull' }],
    ['fragment audience', { clientAssertionAudience: 'https://identity.example.test/pull#secret' }],
    ['zero limit', { requestedLimit: 0 }],
    ['fractional limit', { requestedLimit: 1.5 }],
    ['overbound limit', { requestedLimit: 101 }],
  ])('rejects invalid local configuration before signer use: %s', (_label, override) => {
    const clientAssertionProvider = createProvider()
    expect(() => createBuilder({ ...override, clientAssertionProvider }))
      .toThrow(IdentityLifecyclePullRequestFailure)
    expect(clientAssertionProvider.createClientAssertion).not.toHaveBeenCalled()
  })

  it('rejects a non-string consumer ID without coercing it', () => {
    const toString = vi.fn(() => CONSUMER_ID)
    expect(() => createBuilder({ consumerId: { toString } as never }))
      .toThrow(IdentityLifecyclePullRequestFailure)
    expect(toString).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    '',
    '00',
    '-1',
    '+1',
    '9223372036854775808',
  ])('rejects a noncanonical cursor before signer use: %s', async (cursor) => {
    const clientAssertionProvider = createProvider()
    const builder = createBuilder({ clientAssertionProvider })

    await expect(builder.createRequest(
      cursor === undefined ? undefined as never : { cursor },
    )).rejects.toBeInstanceOf(IdentityLifecyclePullRequestFailure)
    expect(clientAssertionProvider.createClientAssertion).not.toHaveBeenCalled()
  })

  it.each([
    '',
    'short.short.short',
    `${'a'.repeat(4093)}.b.c`,
    `${'a'.repeat(32)}.${'b'.repeat(32)}.${'c'.repeat(32)}=`,
  ])('rejects a malformed signer result: %s', async (assertion) => {
    const builder = createBuilder({ clientAssertionProvider: createProvider(assertion) })
    await expect(builder.createRequest({ cursor: null }))
      .rejects.toBeInstanceOf(IdentityLifecyclePullRequestFailure)
  })

  it('captures the signer method once and preserves its receiver', async () => {
    const createClientAssertion = vi.fn(async function (this: { marker: string }) {
      expect(this.marker).toBe('provider')
      return CLIENT_ASSERTION
    })
    const target = { marker: 'provider', createClientAssertion }
    let methodReads = 0
    const get = vi.fn((value: typeof target, key: PropertyKey) => {
      if (key === 'marker') return value.marker
      if (key === 'createClientAssertion') {
        methodReads += 1
        if (methodReads > 1) throw new Error('signer method re-read')
        return value.createClientAssertion
      }
      throw new Error('unexpected provider read')
    })
    const clientAssertionProvider = new Proxy(target, { get })
    const builder = createBuilder({ clientAssertionProvider })

    await expect(builder.createRequest({ cursor: null })).resolves.toMatchObject({
      clientAssertion: CLIENT_ASSERTION,
    })
    expect(methodReads).toBe(1)
    expect(createClientAssertion).toHaveBeenCalledOnce()
  })

  it.each([
    ['provider throw', {
      createClientAssertion: vi.fn(async () => {
        throw new Error('credential=TOP_SECRET')
      }),
    }],
    ['provider result', createProvider('credential=TOP_SECRET')],
  ])('emits one bounded failure without leaking %s detail', async (_label, clientAssertionProvider) => {
    const builder = createBuilder({ clientAssertionProvider })
    const error = await captureFailure(builder.createRequest({ cursor: null }))

    expect(error).toBeInstanceOf(IdentityLifecyclePullRequestFailure)
    expect(error.name).toBe('IdentityLifecyclePullRequestFailure')
    expect(error.message).toBe('Identity lifecycle pull request failed')
    expect([String(error), error.stack ?? '', JSON.stringify(error)].join('\n'))
      .not.toContain('TOP_SECRET')
    expect(Object.keys(error)).toEqual([])
  })

  it('stays network, raw-parser, logger, and runtime wiring free', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/lifecycle-pull-request.ts',
      import.meta.url,
    ), 'utf8')
    expect(source).not.toMatch(/\b(?:fetch|Request|Response|JSON\.parse|console|logger)\b/)
    expect(source).not.toContain('registry')
    expect(source).not.toContain('wrangler')
  })
})
