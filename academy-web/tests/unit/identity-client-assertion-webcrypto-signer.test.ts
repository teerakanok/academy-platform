import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityClientAssertionProvider,
  type IdentityEs256AssertionSigner,
} from '@/lib/identity/client-assertion-provider'
import {
  createIdentityClientAssertionWebCryptoSigner,
  IdentityClientAssertionWebCryptoSignerFailure,
  type IdentityClientAssertionWebCryptoSignerOptions,
} from '@/lib/identity/client-assertion-webcrypto-signer'

const CLIENT_ID = 'academy-web'
const PURPOSE = 'lifecycle_pull' as const
const KEY_ID = 'academy-lifecycle-2026-08'
const AUDIENCE = 'https://identity-control.example/v1/lifecycle/events/pull'
const NOW_SECONDS = 1_786_000_000

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Academy Identity client assertion Web Crypto signer', () => {
  it('signs an exact provider assertion with one opaque non-exportable P-256 key', async () => {
    installWebCrypto()
    const keys = await generateP256(false)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))
    const provider = createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      audience: AUDIENCE,
      keyId: KEY_ID,
      lifetimeSeconds: 60,
      clock: { now: () => new Date(NOW_SECONDS * 1_000) },
      jtiSource: { next: () => 'assertion-jti-123456789' },
      signer,
    })

    const assertion = await provider.createClientAssertion({
      consumerId: CLIENT_ID,
      audience: AUDIENCE,
    })
    const [header, claims, signature] = assertion.split('.') as [string, string, string]

    await expect(webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.publicKey,
      Uint8Array.from(Buffer.from(signature, 'base64url')),
      new TextEncoder().encode(`${header}.${claims}`),
    )).resolves.toBe(true)
    expect(signer).toMatchObject({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      keyId: KEY_ID,
    })
    expect(Reflect.ownKeys(signer).sort()).toEqual(['clientId', 'keyId', 'purpose', 'sign'])
    expect('privateKey' in signer).toBe(false)
  })

  it.each([
    ['extractable private key', async () => (await generateP256(true)).privateKey],
    ['public key', async () => (await generateP256(false)).publicKey],
    ['wrong curve', async () => (await generateEc('P-384', false)).privateKey],
  ])('rejects an %s before exposing a signer', async (_label, getKey) => {
    installWebCrypto()
    const privateKey = await getKey()

    expect(() => createIdentityClientAssertionWebCryptoSigner(options(privateKey)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)
  })

  it('rejects an extractable key even when an own property shadows native metadata', async () => {
    installWebCrypto()
    const keys = await generateP256(true)
    Object.defineProperty(keys.privateKey, 'extractable', {
      value: false,
      configurable: true,
    })

    expect(() => createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)
  })

  it('rejects a duck-typed object with forged CryptoKey metadata', () => {
    installWebCrypto()
    const forged = {
      type: 'private',
      extractable: false,
      algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
      usages: ['sign'],
    } as unknown as CryptoKey

    expect(() => createIdentityClientAssertionWebCryptoSigner(options(forged)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)
  })

  it('rejects a Proxy that forges metadata around a genuine key', async () => {
    installWebCrypto()
    const keys = await generateP256(false)
    const forged = new Proxy(keys.privateKey, {
      get(target, key) {
        if (key === 'type') return 'private'
        if (key === 'extractable') return false
        if (key === 'algorithm') return { name: 'ECDSA', namedCurve: 'P-256' }
        if (key === 'usages') return ['sign']
        return Reflect.get(target, key)
      },
    })

    expect(() => createIdentityClientAssertionWebCryptoSigner(options(forged)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)
  })

  it('reads nested key metadata once and rejects a stateful wrong curve', async () => {
    installWebCrypto()
    const keys = await generateP256(false)
    let namedCurveReads = 0
    Object.defineProperty(keys.privateKey.algorithm, 'namedCurve', {
      configurable: true,
      get() {
        namedCurveReads += 1
        return namedCurveReads === 1 ? 'P-384' : 'P-256'
      },
    })

    expect(() => createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)
    expect(namedCurveReads).toBe(1)
  })

  it.each([
    ['client', { clientId: 'another-client' }],
    ['purpose', { purpose: 'code_exchange' }],
    ['key ID', { keyId: 'another-key' }],
    ['algorithm', { algorithm: 'RS256' }],
  ])('rejects a mismatched %s before Web Crypto signing', async (_label, override) => {
    installWebCrypto()
    const keys = await generateP256(false)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))

    await expectFixedFailure(signer.sign({
      algorithm: 'ES256',
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      keyId: KEY_ID,
      signingInput: new TextEncoder().encode('header.claims'),
      ...override,
    } as never))
  })

  it('rejects malformed or overbound signing input without coercion', async () => {
    installWebCrypto()
    const keys = await generateP256(false)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))

    for (const input of [
      null,
      { algorithm: 'ES256', clientId: CLIENT_ID, purpose: PURPOSE, keyId: KEY_ID },
      {
        algorithm: 'ES256',
        clientId: CLIENT_ID,
        purpose: PURPOSE,
        keyId: KEY_ID,
        signingInput: new Uint8Array(0),
      },
      {
        algorithm: 'ES256',
        clientId: CLIENT_ID,
        purpose: PURPOSE,
        keyId: KEY_ID,
        signingInput: new Uint8Array(4_097),
      },
      Object.defineProperty({
        algorithm: 'ES256',
        clientId: CLIENT_ID,
        purpose: PURPOSE,
        keyId: KEY_ID,
      }, 'signingInput', {
        enumerable: true,
        get() { throw new Error('credential=TOP_SECRET') },
      }),
    ]) {
      await expectFixedFailure(signer.sign(input as never))
    }
  })

  it('captures Web Crypto and sign once while preserving the original receiver', async () => {
    const keys = await generateP256(false)
    const reads = new Map<PropertyKey, number>()
    const sign = vi.fn(async function (
      this: SubtleCrypto,
      algorithm: AlgorithmIdentifier | EcdsaParams,
      key: CryptoKey,
      data: BufferSource,
    ) {
      expect(this).toBe(subtleProxy)
      return Reflect.apply(webcrypto.subtle.sign, webcrypto.subtle, [algorithm, key, data])
    })
    const subtleProxy = new Proxy(webcrypto.subtle as unknown as SubtleCrypto, {
      get(target, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        if (key === 'sign') return sign
        return Reflect.get(target, key, receiver)
      },
    })
    const cryptoProxy = new Proxy(webcrypto as unknown as Crypto, {
      get(target, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        if (key === 'subtle') return subtleProxy
        return Reflect.get(target, key, receiver)
      },
    })
    installWebCrypto(cryptoProxy)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))

    await expect(signer.sign(validSigningInput())).resolves.toHaveLength(64)
    expect(reads.get('subtle')).toBe(1)
    expect(reads.get('sign')).toBe(1)
    expect(sign).toHaveBeenCalledOnce()
  })

  it('captures each option and runtime input field once', async () => {
    installWebCrypto()
    const keys = await generateP256(false)
    const optionReads = new Map<PropertyKey, number>()
    const inputReads = new Map<PropertyKey, number>()
    const optionProxy = new Proxy(options(keys.privateKey), {
      get(value, key, receiver) {
        optionReads.set(key, (optionReads.get(key) ?? 0) + 1)
        return Reflect.get(value, key, receiver)
      },
    })
    const inputProxy = new Proxy(validSigningInput(), {
      getOwnPropertyDescriptor(value, key) {
        inputReads.set(key, (inputReads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(value, key)
      },
      get() {
        throw new Error('ordinary property access is forbidden')
      },
    })
    const signer = createIdentityClientAssertionWebCryptoSigner(optionProxy)

    await expect(signer.sign(inputProxy)).resolves.toHaveLength(64)
    for (const key of ['clientId', 'purpose', 'keyId', 'privateKey']) {
      expect(optionReads.get(key)).toBe(1)
    }
    for (const key of ['algorithm', 'clientId', 'purpose', 'keyId', 'signingInput']) {
      expect(inputReads.get(key)).toBe(1)
    }
  })

  it('snapshots signing bytes before an asynchronous crypto operation observes them', async () => {
    const keys = await generateP256(false)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let observed = new Uint8Array(0)
    const sign = vi.fn(async (
      algorithm: AlgorithmIdentifier | EcdsaParams,
      key: CryptoKey,
      data: BufferSource,
    ) => {
      await gate
      observed = Uint8Array.from(data as Uint8Array)
      return Reflect.apply(webcrypto.subtle.sign, webcrypto.subtle, [algorithm, key, data])
    })
    installWebCrypto({ subtle: { sign } } as unknown as Crypto)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))
    const input = validSigningInput()
    const expected = Uint8Array.from(input.signingInput)

    const pending = signer.sign(input)
    input.signingInput.fill(0)
    release()

    await expect(pending).resolves.toHaveLength(64)
    expect(observed).toEqual(expected)
  })

  it('collapses missing or throwing Web Crypto to one fixed detail-free failure', async () => {
    const keys = await generateP256(false)
    vi.stubGlobal('crypto', undefined)
    expect(() => createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey)))
      .toThrow(IdentityClientAssertionWebCryptoSignerFailure)

    const sign = vi.fn(async () => { throw new Error('private operation TOP_SECRET') })
    installWebCrypto({ subtle: { sign } } as unknown as Crypto)
    const signer = createIdentityClientAssertionWebCryptoSigner(options(keys.privateKey))
    await expectFixedFailure(signer.sign(validSigningInput()))
  })

  it('contains no key generation, import, export, storage, network, logging, or runtime wiring', async () => {
    const source = await readFile(
      new URL('../../src/lib/identity/client-assertion-webcrypto-signer.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/generateKey|importKey|exportKey|process\.env|fetch\(|console\.|wrangler|scheduled/i)
    expect(source).not.toMatch(/jwk|pkcs|pem|secret/i)
  })
})

function options(
  privateKey: CryptoKey,
  override: Partial<IdentityClientAssertionWebCryptoSignerOptions> = {},
): IdentityClientAssertionWebCryptoSignerOptions {
  return {
    clientId: CLIENT_ID,
    purpose: PURPOSE,
    keyId: KEY_ID,
    privateKey,
    ...override,
  }
}

function validSigningInput(): Parameters<IdentityEs256AssertionSigner['sign']>[0] {
  return {
    algorithm: 'ES256',
    clientId: CLIENT_ID,
    purpose: PURPOSE,
    keyId: KEY_ID,
    signingInput: new TextEncoder().encode('header.claims'),
  }
}

async function generateP256(extractable: boolean): Promise<CryptoKeyPair> {
  return generateEc('P-256', extractable)
}

async function generateEc(namedCurve: 'P-256' | 'P-384', extractable: boolean): Promise<CryptoKeyPair> {
  return webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve },
    extractable,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>
}

function installWebCrypto(value: Crypto = webcrypto as unknown as Crypto): void {
  vi.stubGlobal('crypto', value)
}

async function expectFixedFailure(promise: Promise<unknown>): Promise<void> {
  const failure = await promise.catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(IdentityClientAssertionWebCryptoSignerFailure)
  expect(failure).toMatchObject({
    name: 'IdentityClientAssertionWebCryptoSignerFailure',
    message: 'Identity client assertion Web Crypto signer failed',
  })
  expect(String(failure)).toBe(
    'IdentityClientAssertionWebCryptoSignerFailure: Identity client assertion Web Crypto signer failed',
  )
  expect((failure as Error).stack).not.toMatch(/TOP_SECRET|private operation/)
  expect(Object.keys(failure as object)).toEqual([])
  expect(JSON.stringify(failure)).toBe('{}')
}
