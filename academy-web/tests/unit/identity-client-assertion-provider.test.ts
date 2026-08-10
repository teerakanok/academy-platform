import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityClientAssertionProvider as IdentityExchangeAssertionProvider } from '@/lib/identity/adapter'
import {
  createIdentityClientAssertionProvider,
  IdentityClientAssertionProviderFailure,
  type IdentityClientAssertionProviderOptions,
  type IdentityEs256AssertionSigner,
} from '@/lib/identity/client-assertion-provider'
import {
  createIdentityLifecyclePullRequestBuilder,
  type IdentityLifecycleClientAssertionProvider,
} from '@/lib/identity/lifecycle-pull-request'

const CLIENT_ID = 'academy-web'
const EXCHANGE_AUDIENCE = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const LIFECYCLE_AUDIENCE = 'https://identity-control.example/v1/lifecycle/events/pull'
const KEY_ID = 'academy-client-2026-08'
const NOW_SECONDS = 1_786_000_000
const JTI = 'assertion-jti-123456789'

describe('Academy Identity client assertion provider', () => {
  it('creates an exact producer-compatible ES256 lifecycle assertion', async () => {
    const keys = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )
    const sign = vi.fn(async function (
      this: { marker: string },
      input: {
        algorithm: 'ES256'
        clientId: string
        purpose: 'code_exchange' | 'lifecycle_pull'
        keyId: string
        signingInput: Uint8Array
      },
    ) {
      expect(this.marker).toBe('signer')
      expect(input).toMatchObject({
        algorithm: 'ES256',
        clientId: CLIENT_ID,
        purpose: 'lifecycle_pull',
        keyId: KEY_ID,
      })
      return new Uint8Array(await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        input.signingInput,
      ))
    })
    const signer = { marker: 'signer', sign }
    const options = fixture({ signer })
    const provider = createIdentityClientAssertionProvider(options)
    const lifecycleProvider: IdentityLifecycleClientAssertionProvider = provider

    const lifecycleAssertion = await lifecycleProvider.createClientAssertion({
      consumerId: CLIENT_ID,
      audience: LIFECYCLE_AUDIENCE,
    })
    const request = await createIdentityLifecyclePullRequestBuilder({
      consumerId: CLIENT_ID,
      clientAssertionAudience: LIFECYCLE_AUDIENCE,
      requestedLimit: 50,
      clientAssertionProvider: provider,
    }).createRequest({ cursor: '42' })
    expect(request).toEqual({
      consumerId: CLIENT_ID,
      clientAssertion: request.clientAssertion,
      cursor: { sequence: '42' },
      limit: 50,
    })

    for (const [index, assertion] of [lifecycleAssertion, request.clientAssertion].entries()) {
      const [encodedHeader, encodedClaims, encodedSignature] = assertion.split('.') as [string, string, string]
      const header = decodeJson(encodedHeader)
      const claims = decodeJson(encodedClaims)
      expect(Object.keys(header).sort()).toEqual(['alg', 'kid', 'typ'])
      expect(header).toEqual({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
      expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub'])
      expect(claims).toEqual({
        aud: LIFECYCLE_AUDIENCE,
        exp: NOW_SECONDS + 60,
        iat: NOW_SECONDS,
        iss: CLIENT_ID,
        jti: `${JTI}-${index + 1}`,
        sub: CLIENT_ID,
      })
      await expect(webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.publicKey,
        decodeBase64Url(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
      )).resolves.toBe(true)
    }
    expect(sign).toHaveBeenCalledTimes(2)
    expect(options.clock.now).toHaveBeenCalledTimes(2)
    expect(options.jtiSource.next).toHaveBeenCalledTimes(2)
  })

  it('creates a separately pinned assertion for the code-exchange port', async () => {
    const provider: IdentityExchangeAssertionProvider = createIdentityClientAssertionProvider(fixture({
      purpose: 'code_exchange',
      audience: EXCHANGE_AUDIENCE,
    }))

    const assertion = await provider.createClientAssertion({ audience: EXCHANGE_AUDIENCE })
    const [, encodedClaims] = assertion.split('.') as [string, string, string]
    expect(decodeJson(encodedClaims)).toMatchObject({
      aud: EXCHANGE_AUDIENCE,
      iss: CLIENT_ID,
      sub: CLIENT_ID,
    })
  })

  it.each([
    ['empty client ID', { clientId: '' }],
    ['overbound client ID', { clientId: `a${'b'.repeat(80)}` }],
    ['overbound audience', { audience: `https://accounts.cyberskills.co.th/${'a'.repeat(2_048)}` }],
    ['invalid purpose', { purpose: 'generic' }],
    ['noncanonical audience', { audience: 'https://accounts.cyberskills.co.th/v1/code/exchange#fragment' }],
    ['HTTP audience', { audience: 'http://accounts.cyberskills.co.th/v1/code/exchange' }],
    ['invalid key ID', { keyId: 'bad key' }],
    ['short lifetime', { lifetimeSeconds: 29 }],
    ['long lifetime', { lifetimeSeconds: 301 }],
    ['fractional lifetime', { lifetimeSeconds: 60.5 }],
  ])('rejects %s before creating a provider', (_label, override) => {
    expect(() => createIdentityClientAssertionProvider(fixture(override as never))).toThrow(
      IdentityClientAssertionProviderFailure,
    )
  })

  it('pins the configured client and audience before clock, JTI, or signer work', async () => {
    const options = fixture()
    const provider = createIdentityClientAssertionProvider(options)

    for (const input of [
      { audience: 'https://evil.example/assert' },
      { consumerId: 'another-client', audience: LIFECYCLE_AUDIENCE },
      { consumerId: CLIENT_ID, audience: LIFECYCLE_AUDIENCE, extra: true },
      Object.defineProperty({ consumerId: CLIENT_ID }, 'audience', {
        enumerable: true,
        get() { throw new Error('credential=TOP_SECRET') },
      }),
      null,
    ]) {
      await expectFixedFailure(provider.createClientAssertion(input as never))
    }

    expect(options.clock.now).not.toHaveBeenCalled()
    expect(options.jtiSource.next).not.toHaveBeenCalled()
    expect(options.signer.sign).not.toHaveBeenCalled()
  })

  it('refuses cross-purpose use before clock, JTI, or signer work', async () => {
    const exchange = fixture({ purpose: 'code_exchange', audience: EXCHANGE_AUDIENCE })
    const lifecycle = fixture()

    await expectFixedFailure(createIdentityClientAssertionProvider(exchange).createClientAssertion({
      consumerId: CLIENT_ID,
      audience: EXCHANGE_AUDIENCE,
    }))
    await expectFixedFailure(createIdentityClientAssertionProvider(lifecycle).createClientAssertion({
      audience: LIFECYCLE_AUDIENCE,
    }))

    for (const options of [exchange, lifecycle]) {
      expect(options.clock.now).not.toHaveBeenCalled()
      expect(options.jtiSource.next).not.toHaveBeenCalled()
      expect(options.signer.sign).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['client', { clientId: 'another-client' }],
    ['purpose', { purpose: 'code_exchange' }],
    ['key', { keyId: 'another-key' }],
  ])('rejects a signer capability bound to another %s before side effects', (_label, binding) => {
    const signerBinding = binding as Partial<Pick<
      IdentityEs256AssertionSigner,
      'clientId' | 'purpose' | 'keyId'
    >>
    const options = fixture({
      signer: {
        clientId: signerBinding.clientId ?? CLIENT_ID,
        purpose: signerBinding.purpose ?? 'lifecycle_pull',
        keyId: signerBinding.keyId ?? KEY_ID,
        sign: vi.fn(async () => new Uint8Array(64)),
      },
    })

    expect(() => createIdentityClientAssertionProvider(options)).toThrow(
      IdentityClientAssertionProviderFailure,
    )
    expect(options.clock.now).not.toHaveBeenCalled()
    expect(options.jtiSource.next).not.toHaveBeenCalled()
    expect(options.signer.sign).not.toHaveBeenCalled()
  })

  it('does not accept one signer capability across both assertion purposes', () => {
    const signer = {
      clientId: CLIENT_ID,
      purpose: 'code_exchange' as const,
      keyId: KEY_ID,
      sign: vi.fn(async () => new Uint8Array(64)),
    }
    const exchange = {
      ...fixture({
        purpose: 'code_exchange',
        audience: EXCHANGE_AUDIENCE,
      }),
      signer,
    }
    const lifecycle = { ...fixture(), signer } as never

    expect(() => createIdentityClientAssertionProvider(exchange)).not.toThrow()
    expect(() => createIdentityClientAssertionProvider(lifecycle)).toThrow(
      IdentityClientAssertionProviderFailure,
    )
    expect(signer.sign).not.toHaveBeenCalled()
  })

  it('captures the signer binding and method exactly once', async () => {
    const base = fixture()
    const reads = new Map<PropertyKey, number>()
    const signer = new Proxy(base.signer, {
      get(value, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return Reflect.get(value, key, receiver)
      },
    })
    const provider = createIdentityClientAssertionProvider({ ...base, signer })

    await expect(provider.createClientAssertion({
      consumerId: CLIENT_ID,
      audience: LIFECYCLE_AUDIENCE,
    })).resolves.toBeTypeOf('string')
    for (const key of ['clientId', 'purpose', 'keyId', 'sign']) {
      expect(reads.get(key)).toBe(1)
    }
  })

  it('reads each public request field once and does not use ordinary Proxy get', async () => {
    const options = fixture()
    const reads = new Map<PropertyKey, number>()
    const target = { consumerId: CLIENT_ID, audience: LIFECYCLE_AUDIENCE }
    const input = new Proxy(target, {
      getOwnPropertyDescriptor(value, key) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(value, key)
      },
      get() {
        throw new Error('ordinary property access is forbidden')
      },
    })

    await expect(createIdentityClientAssertionProvider(options).createClientAssertion(input))
      .resolves.toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(reads.get('consumerId')).toBe(1)
    expect(reads.get('audience')).toBe(1)
  })

  it.each([
    ['clock throw', fixture({ clock: { now: vi.fn(() => { throw new Error('clock secret') }) } })],
    ['invalid clock', fixture({ clock: { now: vi.fn(() => new Date(Number.NaN)) } })],
    ['JTI throw', fixture({ jtiSource: { next: vi.fn(() => { throw new Error('jti secret') }) } })],
    ['invalid JTI', fixture({ jtiSource: { next: vi.fn(() => 'short') } })],
    ['signer throw', fixture({ signer: { sign: vi.fn(async () => { throw new Error('key secret') }) } })],
    ['short signature', fixture({ signer: { sign: vi.fn(async () => new Uint8Array(63)) } })],
    ['long signature', fixture({ signer: { sign: vi.fn(async () => new Uint8Array(65)) } })],
  ])('collapses %s to one fixed secret-safe failure', async (_label, options) => {
    await expectFixedFailure(createIdentityClientAssertionProvider(options).createClientAssertion({
      consumerId: CLIENT_ID,
      audience: LIFECYCLE_AUDIENCE,
    }))
  })

  it('rejects an overbound signature before cloning its backing storage', async () => {
    let allocationAttempts = 0
    class OverboundSignature extends Uint8Array {
      static get [Symbol.species](): Uint8ArrayConstructor {
        allocationAttempts += 1
        return Uint8Array
      }
    }
    const options = fixture({
      signer: { sign: vi.fn(async () => new OverboundSignature(65)) },
    })

    await expectFixedFailure(createIdentityClientAssertionProvider(options).createClientAssertion({
      consumerId: CLIENT_ID,
      audience: LIFECYCLE_AUDIENCE,
    }))
    expect(allocationAttempts).toBe(0)
  })

  it('captures option values and port methods exactly once', async () => {
    const base = fixture()
    const reads = new Map<PropertyKey, number>()
    const input = new Proxy(base, {
      get(value, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return Reflect.get(value, key, receiver)
      },
    })
    const provider = createIdentityClientAssertionProvider(input)

    await expect(provider.createClientAssertion({
      consumerId: CLIENT_ID,
      audience: LIFECYCLE_AUDIENCE,
    })).resolves.toBeTypeOf('string')
    for (const key of [
      'clientId',
      'purpose',
      'audience',
      'keyId',
      'lifetimeSeconds',
      'clock',
      'jtiSource',
      'signer',
    ]) {
      expect(reads.get(key)).toBe(1)
    }
  })

  it('contains no key generation, secret loading, network, logging, or runtime wiring', async () => {
    const source = await readFile(
      new URL('../../src/lib/identity/client-assertion-provider.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/generateKey|importKey|exportKey|process\.env|fetch\(|console\.|wrangler|scheduled/i)
    expect(source).not.toMatch(/private.?jwk|private.?key/i)
  })
})

type FixtureOptions = IdentityClientAssertionProviderOptions & {
  purpose: 'code_exchange' | 'lifecycle_pull'
}

type FixtureOverride = Partial<Omit<FixtureOptions, 'signer'>> & {
  signer?: Partial<IdentityEs256AssertionSigner>
}

function fixture(
  override: FixtureOverride = {},
): FixtureOptions & {
  clock: { now: ReturnType<typeof vi.fn> }
  jtiSource: { next: ReturnType<typeof vi.fn> }
  signer: IdentityEs256AssertionSigner & { sign: ReturnType<typeof vi.fn> }
} {
  let jtiIndex = 0
  const {
    signer: signerOverride,
    ...optionOverride
  } = override
  const clientId = optionOverride.clientId ?? CLIENT_ID
  const purpose = optionOverride.purpose ?? 'lifecycle_pull'
  const keyId = optionOverride.keyId ?? KEY_ID
  return {
    clientId,
    purpose,
    audience: LIFECYCLE_AUDIENCE,
    keyId,
    lifetimeSeconds: 60,
    clock: { now: vi.fn(() => new Date(NOW_SECONDS * 1_000)) },
    jtiSource: { next: vi.fn(() => `${JTI}-${++jtiIndex}`) },
    ...optionOverride,
    signer: {
      clientId,
      purpose,
      keyId,
      sign: vi.fn(async () => new Uint8Array(64)),
      ...signerOverride,
    },
  } as never
}

async function expectFixedFailure(promise: Promise<unknown>): Promise<void> {
  const failure = await promise.catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(IdentityClientAssertionProviderFailure)
  expect(failure).toMatchObject({
    name: 'IdentityClientAssertionProviderFailure',
    message: 'Identity client assertion provider failed',
  })
  expect(String(failure)).toBe(
    'IdentityClientAssertionProviderFailure: Identity client assertion provider failed',
  )
  expect((failure as Error).stack).not.toMatch(/TOP_SECRET|clock secret|jti secret|key secret/)
  expect(Object.keys(failure as object)).toEqual([])
  expect(JSON.stringify(failure)).toBe('{}')
}

function decodeJson(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, 'base64url')) as Uint8Array<ArrayBuffer>
}
