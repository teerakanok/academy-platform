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
  it('signs an exact provider assertion from JWK text and never exposes a key', async () => {
    installWebCrypto()
    const key = await generateP256Jwk()
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))
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
      key.publicKey,
      Uint8Array.from(Buffer.from(signature, 'base64url')),
      new TextEncoder().encode(`${header}.${claims}`),
    )).resolves.toBe(true)
    expect(signer).toMatchObject({ clientId: CLIENT_ID, purpose: PURPOSE, keyId: KEY_ID })
    // The key lives in the closure. There is no property to read it back from,
    // and nothing that echoes the JWK text the caller passed in.
    expect(Reflect.ownKeys(signer).sort()).toEqual(['clientId', 'keyId', 'purpose', 'sign'])
    expect(JSON.stringify(signer)).not.toMatch(/[Pp]rivate|jwk|"d"/)
  })

  it('imports the key non-extractable and sign-only, inside the boundary', async () => {
    // The whole contract rests on this call: the signer owns a key it imported
    // under terms it chose. Assert those terms at the boundary rather than by
    // reading metadata back off the key, because how a runtime represents a
    // CryptoKey is exactly what cannot be relied on.
    const calls: unknown[][] = []
    const importKey = vi.fn(async (...args: unknown[]) => {
      calls.push(args)
      return Reflect.apply(webcrypto.subtle.importKey, webcrypto.subtle, args as never)
    })
    installWebCrypto(subtleWith({ importKey }))
    const key = await generateP256Jwk()

    await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))

    expect(calls).toHaveLength(1)
    const [format, keyData, algorithm, extractable, usages] = calls[0]!
    expect(format).toBe('jwk')
    expect(algorithm).toEqual({ name: 'ECDSA', namedCurve: 'P-256' })
    expect(extractable).toBe(false)
    expect(usages).toEqual(['sign'])
    // Exactly the five JWK members, freshly built here — not the caller's object.
    expect(Object.keys(keyData as object).sort()).toEqual(['crv', 'd', 'kty', 'x', 'y'])
  })

  it('produces a key that the runtime itself refuses to export', async () => {
    // Belt and braces on the assertion above: prove a key imported on those exact
    // terms is genuinely non-exportable, so `extractable: false` is a fact about
    // the runtime rather than an argument nobody checked.
    installWebCrypto()
    const key = await generateP256Jwk()
    const imported = await webcrypto.subtle.importKey(
      'jwk',
      JSON.parse(key.jwk) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    await expect(webcrypto.subtle.exportKey('jwk', imported)).rejects.toThrow()
    await expect(webcrypto.subtle.exportKey('pkcs8', imported)).rejects.toThrow()
  })

  it.each([
    ['a CryptoKey instead of text', async () => (await generateP256Jwk()).privateKey],
    ['a parsed object instead of text', async () => JSON.parse((await generateP256Jwk()).jwk)],
    ['text that is not JSON', async () => '{not json'],
    ['a JSON array', async () => '[]'],
    ['JSON null', async () => 'null'],
    ['empty text', async () => ''],
    ['oversized text', async () => `"${'x'.repeat(4_100)}"`],
  ])('rejects %s before any import', async (_label, build) => {
    installWebCrypto()
    await expectFixedFailure(
      createIdentityClientAssertionWebCryptoSigner(options(await build() as never)),
    )
  })

  it.each([
    ['a surplus member', (jwk: Jwk) => ({ ...jwk, ext: true })],
    ['a key_ops member', (jwk: Jwk) => ({ ...jwk, key_ops: ['sign'] })],
    ['no private scalar', (jwk: Jwk) => without(jwk, 'd')],
    ['no y coordinate', (jwk: Jwk) => without(jwk, 'y')],
    ['the wrong key type', (jwk: Jwk) => ({ ...jwk, kty: 'OKP' })],
    ['the wrong curve name', (jwk: Jwk) => ({ ...jwk, crv: 'P-384' })],
    ['a malformed coordinate', (jwk: Jwk) => ({ ...jwk, x: `${jwk.x}=` })],
    ['a truncated scalar', (jwk: Jwk) => ({ ...jwk, d: jwk.d.slice(0, 42) })],
    ['a non-string scalar', (jwk: Jwk) => ({ ...jwk, d: 1 })],
  ])('rejects a JWK with %s', async (_label, mutate) => {
    installWebCrypto()
    const key = await generateP256Jwk()
    const mutated = mutate(JSON.parse(key.jwk) as Jwk)

    await expectFixedFailure(
      createIdentityClientAssertionWebCryptoSigner(options(JSON.stringify(mutated))),
    )
  })

  it('rejects a well-formed JWK whose scalar does not belong to its point', async () => {
    // Shape is not validity. A JWK can pass every syntactic check and still be a
    // scalar from one key pasted onto the public point of another; the runtime's
    // own import is the thing that decides, and its refusal must surface as the
    // one fixed failure rather than as a distinguishable crypto error.
    installWebCrypto()
    const first = JSON.parse((await generateP256Jwk()).jwk) as Jwk
    const second = JSON.parse((await generateP256Jwk()).jwk) as Jwk

    await expectFixedFailure(createIdentityClientAssertionWebCryptoSigner(
      options(JSON.stringify({ ...first, d: second.d })),
    ))
  })

  it.each([
    ['client ID', { clientId: 'not a client id!' }],
    ['purpose', { purpose: 'refresh' }],
    ['key ID', { keyId: 'not a key id!' }],
  ])('rejects a malformed %s before importing anything', async (_label, override) => {
    const importKey = vi.fn(async () => { throw new Error('must not be reached') })
    installWebCrypto(subtleWith({ importKey }))
    const key = await generateP256Jwk()

    await expectFixedFailure(
      createIdentityClientAssertionWebCryptoSigner(options(key.jwk, override as never)),
    )
    expect(importKey).not.toHaveBeenCalled()
  })

  it.each([
    ['client', { clientId: 'another-client' }],
    ['purpose', { purpose: 'code_exchange' }],
    ['key ID', { keyId: 'another-key' }],
    ['algorithm', { algorithm: 'RS256' }],
  ])('rejects a mismatched %s before Web Crypto signing', async (_label, override) => {
    installWebCrypto()
    const key = await generateP256Jwk()
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))

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
    const key = await generateP256Jwk()
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))

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

  it('captures Web Crypto, importKey and sign once while preserving the receiver', async () => {
    const key = await generateP256Jwk()
    const reads = new Map<PropertyKey, number>()
    // Both methods are forwarded onto the real SubtleCrypto rather than onto the
    // Proxy: Node's WebIDL brand check rejects a proxied receiver outright, which
    // is itself proof that these are the runtime's own methods.
    const sign = vi.fn(async function (this: SubtleCrypto, ...args: unknown[]) {
      expect(this).toBe(subtleProxy)
      return Reflect.apply(webcrypto.subtle.sign, webcrypto.subtle, args as never)
    })
    const importKey = vi.fn(async function (this: SubtleCrypto, ...args: unknown[]) {
      expect(this).toBe(subtleProxy)
      return Reflect.apply(webcrypto.subtle.importKey, webcrypto.subtle, args as never)
    })
    const subtleProxy = new Proxy(webcrypto.subtle as unknown as SubtleCrypto, {
      get(target, property, receiver) {
        reads.set(property, (reads.get(property) ?? 0) + 1)
        if (property === 'sign') return sign
        if (property === 'importKey') return importKey
        return Reflect.get(target, property, receiver)
      },
    })
    const cryptoProxy = new Proxy(webcrypto as unknown as Crypto, {
      get(target, property, receiver) {
        reads.set(property, (reads.get(property) ?? 0) + 1)
        if (property === 'subtle') return subtleProxy
        return Reflect.get(target, property, receiver)
      },
    })
    installWebCrypto(cryptoProxy)
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))

    await expect(signer.sign(validSigningInput())).resolves.toHaveLength(64)
    expect(reads.get('subtle')).toBe(1)
    expect(reads.get('sign')).toBe(1)
    expect(reads.get('importKey')).toBe(1)
    expect(sign).toHaveBeenCalledOnce()
    expect(importKey).toHaveBeenCalledOnce()
  })

  it('captures each option and runtime input field once', async () => {
    installWebCrypto()
    const key = await generateP256Jwk()
    const optionReads = new Map<PropertyKey, number>()
    const inputReads = new Map<PropertyKey, number>()
    const optionProxy = new Proxy(options(key.jwk), {
      get(value, property, receiver) {
        optionReads.set(property, (optionReads.get(property) ?? 0) + 1)
        return Reflect.get(value, property, receiver)
      },
    })
    const inputProxy = new Proxy(validSigningInput(), {
      getOwnPropertyDescriptor(value, property) {
        inputReads.set(property, (inputReads.get(property) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(value, property)
      },
      get() {
        throw new Error('ordinary property access is forbidden')
      },
    })
    const signer = await createIdentityClientAssertionWebCryptoSigner(optionProxy)

    await expect(signer.sign(inputProxy)).resolves.toHaveLength(64)
    for (const property of ['clientId', 'purpose', 'keyId', 'privateJwk']) {
      expect(optionReads.get(property)).toBe(1)
    }
    for (const property of ['algorithm', 'clientId', 'purpose', 'keyId', 'signingInput']) {
      expect(inputReads.get(property)).toBe(1)
    }
  })

  it('snapshots signing bytes before an asynchronous crypto operation observes them', async () => {
    const key = await generateP256Jwk()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let observed = new Uint8Array(0)
    const sign = vi.fn(async (...args: unknown[]) => {
      await gate
      observed = Uint8Array.from(args[2] as Uint8Array)
      return Reflect.apply(webcrypto.subtle.sign, webcrypto.subtle, args as never)
    })
    installWebCrypto(subtleWith({ sign }))
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))
    const input = validSigningInput()
    const expected = Uint8Array.from(input.signingInput)

    const pending = signer.sign(input)
    input.signingInput.fill(0)
    release()

    await expect(pending).resolves.toHaveLength(64)
    expect(observed).toEqual(expected)
  })

  it('collapses missing or throwing Web Crypto to one fixed detail-free failure', async () => {
    const key = await generateP256Jwk()
    vi.stubGlobal('crypto', undefined)
    await expectFixedFailure(createIdentityClientAssertionWebCryptoSigner(options(key.jwk)))

    // A runtime that offers signing but no import is refused rather than worked
    // around: there is no other way for this module to obtain a key.
    installWebCrypto({ subtle: { sign: async () => new ArrayBuffer(64) } } as unknown as Crypto)
    await expectFixedFailure(createIdentityClientAssertionWebCryptoSigner(options(key.jwk)))

    const importKey = vi.fn(async () => { throw new Error('key material TOP_SECRET') })
    installWebCrypto(subtleWith({ importKey }))
    await expectFixedFailure(createIdentityClientAssertionWebCryptoSigner(options(key.jwk)))

    const sign = vi.fn(async () => { throw new Error('private operation TOP_SECRET') })
    installWebCrypto(subtleWith({ sign }))
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))
    await expectFixedFailure(signer.sign(validSigningInput()))
  })

  it('rejects a signature the runtime returns at the wrong length', async () => {
    const key = await generateP256Jwk()
    const sign = vi.fn(async () => new ArrayBuffer(63))
    installWebCrypto(subtleWith({ sign }))
    const signer = await createIdentityClientAssertionWebCryptoSigner(options(key.jwk))

    await expectFixedFailure(signer.sign(validSigningInput()))
  })

  it('contains no key generation, export, storage, network, logging, or runtime wiring', async () => {
    const source = await readFile(
      new URL('../../src/lib/identity/client-assertion-webcrypto-signer.ts', import.meta.url),
      'utf8',
    )
    // `importKey` is now the point of the module, so it is no longer banned.
    // Minting and extracting key material still are: this module must be unable
    // to create a key, read one back out, or move one anywhere.
    expect(source).not.toMatch(/generateKey|exportKey|deriveKey|wrapKey|unwrapKey/)
    expect(source).not.toMatch(/process\.env|fetch\(|console\.|wrangler|scheduled|localStorage/i)
  })
})

type Jwk = { kty: string, crv: string, x: string, y: string, d: string }

function without(jwk: Jwk, member: keyof Jwk): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...jwk }
  delete copy[member]
  return copy
}

function options(
  privateJwk: string,
  override: Partial<IdentityClientAssertionWebCryptoSignerOptions> = {},
): IdentityClientAssertionWebCryptoSignerOptions {
  return {
    clientId: CLIENT_ID,
    purpose: PURPOSE,
    keyId: KEY_ID,
    privateJwk,
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

async function generateP256Jwk(): Promise<{
  jwk: string
  publicKey: CryptoKey
  privateKey: CryptoKey
}> {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const exported = await webcrypto.subtle.exportKey('jwk', pair.privateKey) as Jwk
  const jwk = JSON.stringify({
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    y: exported.y,
    d: exported.d,
  })
  return { jwk, publicKey: pair.publicKey, privateKey: pair.privateKey }
}

/** A crypto whose SubtleCrypto is the real one with named methods replaced. */
function subtleWith(overrides: Record<string, unknown>): Crypto {
  const subtle = Object.create(webcrypto.subtle) as SubtleCrypto
  for (const [name, value] of Object.entries(overrides)) {
    Object.defineProperty(subtle, name, { value, enumerable: true, configurable: true })
  }
  // The real methods brand-check their receiver, so anything not overridden must
  // still run against the genuine SubtleCrypto.
  for (const name of ['importKey', 'sign'] as const) {
    if (name in overrides) continue
    Object.defineProperty(subtle, name, {
      value: (...args: unknown[]) => Reflect.apply(
        webcrypto.subtle[name] as (...a: unknown[]) => unknown,
        webcrypto.subtle,
        args,
      ),
      enumerable: true,
      configurable: true,
    })
  }
  return { subtle } as unknown as Crypto
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
  expect((failure as Error).stack).not.toMatch(/TOP_SECRET|private operation|key material/)
  expect(Object.keys(failure as object)).toEqual([])
  expect(JSON.stringify(failure)).toBe('{}')
}
