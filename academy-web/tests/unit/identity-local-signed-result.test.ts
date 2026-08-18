import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentityCodeExchangeResultVerifierFailure } from '@/lib/identity/code-exchange-result-verifier-port'
import { createIdentityLocalRuntime, createLocalCodeExchangeResultVerifier } from '@/lib/identity/local-runtime'
import { createIdentityResultKeySetCache } from '@/lib/identity/result-key-set-cache'

const ENVELOPE_ISSUER = 'https://identity.local.test/v1/code/results'
const PRINCIPAL_ISSUER = 'https://identity.local.test/v1'
const AUDIENCE = 'https://academy.local.test'
const CLIENT_ID = 'academy-web-local'
const SERVICE_ID = 'academy'
const KEY_ID = 'identity-result-local-dev-v1'
const NONCE = 'signed-result-nonce-123'

const originalEnvironment = { ...process.env }
const originalFetch = globalThis.fetch
const encoder = new TextEncoder()

type ResultOverrides = Partial<{
  issuer: string
  audience: string
  nonce: string
}>

type EnvelopeOverrides = Partial<{
  issuer: string
  audience: string
  clientId: string
  keyId: string
  result: ResultOverrides
}>

function base64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function resultFor(overrides: ResultOverrides = {}) {
  return {
    issuer: overrides.issuer ?? PRINCIPAL_ISSUER,
    subject: 'learner-1',
    verifiedEmail: 'learner@example.test',
    audience: overrides.audience ?? AUDIENCE,
    serviceId: SERVICE_ID,
    nonce: overrides.nonce ?? NONCE,
    activation: { status: 'active', revision: 1 },
  }
}

describe('Academy local signed Identity Control results', () => {
  let publicKey: CryptoKey
  let privateKey: CryptoKey
  let publicJwk: { kty: 'EC', crv: 'P-256', x: string, y: string }
  let stateDirectory: string

  beforeEach(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    publicKey = keyPair.publicKey
    privateKey = keyPair.privateKey
    const exported = await crypto.subtle.exportKey('jwk', publicKey)
    publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! }
    stateDirectory = mkdtempSync(join(tmpdir(), 'academy-local-signed-'))
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE: '1',
      ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN: 'http://localhost:3000',
      ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN: 'http://localhost:5173',
      ACADEMY_IDENTITY_CONTROL_LOCAL_API_ORIGIN: 'http://localhost:8788',
      ACADEMY_IDENTITY_CONTROL_LOCAL_STATE_DIRECTORY: stateDirectory,
    }
  })

  afterEach(() => {
    process.env = { ...originalEnvironment }
    globalThis.fetch = originalFetch
    rmSync(stateDirectory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function keySetDocument(keyId = KEY_ID) {
    return {
      issuer: ENVELOPE_ISSUER,
      revision: 1,
      keys: [{
        keyId,
        algorithm: 'ES256',
        publicJwk,
        state: 'active',
      }],
      retiredKeyFingerprints: [],
      retiredKeyIds: [],
    }
  }

  async function signedResult(overrides: EnvelopeOverrides = {}): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1_000)
    const result = resultFor(overrides.result)
    const headerPart = base64Url(encoder.encode(JSON.stringify({
      alg: 'ES256',
      kid: overrides.keyId ?? KEY_ID,
      typ: 'identity-code-exchange-result+jwt',
    })))
    const claimsPart = base64Url(encoder.encode(JSON.stringify({
      aud: overrides.audience ?? AUDIENCE,
      clientId: overrides.clientId ?? CLIENT_ID,
      exp: issuedAt + 60,
      iat: issuedAt,
      iss: overrides.issuer ?? ENVELOPE_ISSUER,
      result,
    })))
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      encoder.encode(`${headerPart}.${claimsPart}`),
    )
    return `${headerPart}.${claimsPart}.${base64Url(new Uint8Array(signature))}`
  }

  function verifier(load: () => Promise<string>) {
    return createLocalCodeExchangeResultVerifier(createIdentityResultKeySetCache({
      load,
      clock: () => 0,
      cooldownMs: 1_000,
      negativeCacheMs: 5_000,
    }))
  }

  const binding = {
    expectedAudience: AUDIENCE,
    expectedClientId: CLIENT_ID,
    expectedNonce: NONCE,
    expectedPrincipalIssuer: PRINCIPAL_ISSUER,
    expectedServiceId: SERVICE_ID,
  }

  it('round-trips a verified ES256 result through the published key set', async () => {
    let loads = 0
    const port = verifier(async () => {
      loads += 1
      return JSON.stringify(keySetDocument())
    })

    await expect(port.verify({ signedResult: await signedResult() }, binding))
      .resolves.toEqual(resultFor())
    expect(loads).toBe(1)
  })

  it.each([
    ['a tampered signature', async () => {
      const value = await signedResult()
      const lastCharacter = value[value.length - 1]
      const replacement = lastCharacter === 'A' ? 'B' : 'A'
      return { signedResult: `${value.slice(0, -1)}${replacement}` }
    }],
    ['an alg-none header', async () => {
      const value = await signedResult()
      const [, claimsPart, signaturePart] = value.split('.')
      const headerPart = base64Url(encoder.encode(JSON.stringify({
        alg: 'none',
        kid: KEY_ID,
        typ: 'identity-code-exchange-result+jwt',
      })))
      return { signedResult: `${headerPart}.${claimsPart}.${signaturePart}` }
    }],
    ['an HS256 header', async () => {
      const value = await signedResult()
      const [, claimsPart, signaturePart] = value.split('.')
      const headerPart = base64Url(encoder.encode(JSON.stringify({
        alg: 'HS256',
        kid: KEY_ID,
        typ: 'identity-code-exchange-result+jwt',
      })))
      return { signedResult: `${headerPart}.${claimsPart}.${signaturePart}` }
    }],
    ['an unknown key id', async () => ({ signedResult: await signedResult({ keyId: 'identity-result-unknown-v1' }) })],
    ['the wrong envelope issuer', async () => ({ signedResult: await signedResult({ issuer: 'https://attacker.example/v1/code/results' }) })],
    ['the wrong audience', async () => ({ signedResult: await signedResult({ audience: 'https://attacker.example', result: { audience: 'https://attacker.example' } }) })],
    ['the wrong client id', async () => ({ signedResult: await signedResult({ clientId: 'attacker-web-local' }) })],
    ['the wrong nonce', async () => ({ signedResult: await signedResult({ result: { nonce: 'attacker-nonce-123456' } }) })],
  ])('rejects %s', async (_label, createValue) => {
    const port = verifier(async () => JSON.stringify(keySetDocument()))

    await expect(port.verify(await createValue(), binding))
      .rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
  })

  it('requires no-store on the key-set response', async () => {
    const signed = await signedResult()
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(keySetDocument()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
    const runtime = createIdentityLocalRuntime(new Request('http://localhost:3000/auth/callback'))

    await expect(runtime.resultVerifier.verify({ signedResult: signed }, binding))
      .rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8788/v1/code/result-keys',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit', method: 'GET' }),
    )
  })

  it('rejects malformed signed-result response shapes without a plain-result fallback', async () => {
    const port = verifier(async () => JSON.stringify(keySetDocument()))
    const legacyPlainResult = resultFor()

    await expect(port.verify(legacyPlainResult, binding))
      .rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
    await expect(port.verify({ signedResult: await signedResult(), legacy: legacyPlainResult }, binding))
      .rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
    await expect(port.verify({}, binding))
      .rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
  })
})
