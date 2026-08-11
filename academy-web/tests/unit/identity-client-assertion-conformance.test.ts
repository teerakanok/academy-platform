import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityClientAssertionJtiSource,
} from '@/lib/identity/client-assertion-jti-source'
import {
  createIdentityClientAssertionProvider,
  IdentityClientAssertionProviderFailure,
} from '@/lib/identity/client-assertion-provider'
import {
  createIdentityClientAssertionWebCryptoSigner,
} from '@/lib/identity/client-assertion-webcrypto-signer'

const CLIENT_ID = 'academy-web'
const PURPOSE = 'code_exchange' as const
const KEY_ID = 'academy-code-exchange-2026-08'
const AUDIENCE = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const NOW_SECONDS = 1_786_000_000
const JTIS = [
  '018f0c65-4e3f-4ce4-8e64-4efcdd7b5b91',
  '34a49b39-2030-44bb-8bd5-fbd40928cc0a',
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Academy Identity client-assertion conformance', () => {
  it('binds a fresh signed assertion to the exact exchange client and audience', async () => {
    let jtiIndex = 0
    const randomUUID = vi.fn(() => JTIS[jtiIndex++] ?? JTIS[1])
    const runtimeCrypto = Object.create(webcrypto) as Crypto
    Object.defineProperties(runtimeCrypto, {
      randomUUID: { value: randomUUID, enumerable: true },
      subtle: { value: webcrypto.subtle, enumerable: true },
    })
    vi.stubGlobal('crypto', runtimeCrypto)

    const keys = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    ) as CryptoKeyPair
    const signer = createIdentityClientAssertionWebCryptoSigner({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      keyId: KEY_ID,
      privateKey: keys.privateKey,
    })
    const provider = createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: PURPOSE,
      audience: AUDIENCE,
      keyId: KEY_ID,
      lifetimeSeconds: 60,
      clock: { now: () => new Date(NOW_SECONDS * 1_000) },
      jtiSource: createIdentityClientAssertionJtiSource(),
      signer,
    })

    const first = await provider.createClientAssertion({ audience: AUDIENCE })
    const second = await provider.createClientAssertion({ audience: AUDIENCE })

    expect(first).not.toBe(second)
    expect(randomUUID).toHaveBeenCalledTimes(2)
    await expectAssertion(first, JTIS[0], keys.publicKey)
    await expectAssertion(second, JTIS[1], keys.publicKey)

    await expect(provider.createClientAssertion({
      audience: 'https://accounts.cyberskills.co.th/v1/code/exchange/other',
    })).rejects.toBeInstanceOf(IdentityClientAssertionProviderFailure)
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })
})

async function expectAssertion(
  compactJws: string,
  expectedJti: string,
  publicKey: CryptoKey,
): Promise<void> {
  const segments = compactJws.split('.')
  expect(segments).toHaveLength(3)
  const [encodedHeader, encodedClaims, encodedSignature] = segments as [string, string, string]
  expect(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))).toEqual({
    alg: 'ES256',
    kid: KEY_ID,
    typ: 'JWT',
  })
  expect(JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))).toEqual({
    aud: AUDIENCE,
    exp: NOW_SECONDS + 60,
    iat: NOW_SECONDS,
    iss: CLIENT_ID,
    jti: expectedJti,
    sub: CLIENT_ID,
  })
  await expect(webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    Uint8Array.from(Buffer.from(encodedSignature, 'base64url')),
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  )).resolves.toBe(true)
}
