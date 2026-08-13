import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  verifyIdentityCodeExchangeResultEnvelope,
  type IdentityCodeExchangeResultEnvelopePolicy,
  type IdentityCodeExchangeResultVerificationKeySet,
} from '@/lib/identity/code-exchange-result-envelope'

const RESULT = {
  issuer: 'https://accounts.example.test/auth/v1',
  subject: 'consumer-vector-subject',
  verifiedEmail: 'vector@example.test',
  audience: 'https://academy.example.test',
  serviceId: 'academy',
  nonce: 'vector_nonce_reference_123456789',
  activation: { status: 'active' as const, revision: 7 },
}

const VECTOR = {
  verification: {
    expectedIssuer: 'https://identity.example.test/v1/code/results',
    expectedAudience: RESULT.audience,
    expectedClientId: 'academy-web',
    expectedNonce: RESULT.nonce,
    verificationTime: '2026-08-14T00:00:00.000Z',
    clockSkewSeconds: 10,
    maximumLifetimeSeconds: 90,
  },
  positive: {
    key: {
      keyId: 'identity-result-conformance-v1', algorithm: 'ES256' as const, state: 'active' as const,
      publicJwk: { kty: 'EC', crv: 'P-256', x: 'vsH-Muazqvy-BMIqlGTEZdM3RvQnpPXgHcuYgb3_N-4', y: 'BM50ND93TPNJH8-v3shQpGMEh9KB4t_5kT4nel_XXwk' },
    },
    signedResult: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1jb25mb3JtYW5jZS12MSIsInR5cCI6ImlkZW50aXR5LWNvZGUtZXhjaGFuZ2UtcmVzdWx0K2p3dCJ9.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.Occgs2MeuSjq3Gp1bwYPH2AB7LY-a30IUn3tfHyo3qRT2aE2GbNhHH8clEA-YDau3NRjQpI0BOlxUMXho-5Krw',
  },
  rotation: [
    ['identity-result-rotation-active-v2', 'active', 'iaeP8cO-wvJiLs_ojOKecMDxZtL024zV5tisVIbqYDY', '4TTiK6UEi94QiKUihuTHbHIDG-JVC1CdKN1evTPgEgE', 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1yb3RhdGlvbi1hY3RpdmUtdjIiLCJ0eXAiOiJpZGVudGl0eS1jb2RlLWV4Y2hhbmdlLXJlc3VsdCtqd3QifQ.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.qr4RMVc0iN1hxZBM-oxl8xCKDKVBMgZIJ0l0NNJm0ypS5b1tR-ibBLZqYnQWdc16Z3onweth3GV9pNRXrXWksw'],
    ['identity-result-rotation-overlap-v1', 'overlap', 'TfHGG_1iBBb-_RYOZBBhZsAZ6OHRBqcHW8mPsEPeTd4', '7g3lIIjkd8B_2JkNpalVmNGi3xJi5JURPxvaqNuwato', 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1yb3RhdGlvbi1vdmVybGFwLXYxIiwidHlwIjoiaWRlbnRpdHktY29kZS1leGNoYW5nZS1yZXN1bHQrand0In0.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.jwZ5hhn3CxKk0qGWnOrnaibX8ia1r8CHbKtlfgCVmrwyhabqG8usmuF16Dvba0Na6VPkzAssFQtuqf9mO0CyNA'],
    ['identity-result-rotation-retired-v0', 'retired', 'JwmqMvbWg8CnzfU3VKaILuP9D-oNRHwU25QS8Ggvxcc', '9TYLu97eNwzqrceiuGJ_xN1PYA8pFG9NvJsmc-xn7G0', 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1yb3RhdGlvbi1yZXRpcmVkLXYwIiwidHlwIjoiaWRlbnRpdHktY29kZS1leGNoYW5nZS1yZXN1bHQrand0In0.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.-s2DnwzG8lxv1A_jW7aYbfoYkKa5feXJhyrTJxHp95yHEaXWsPpCy7wRpNQxzV0W5tE8njw92d4Wc7ZnoRLQiA'],
  ] as const,
}

function policy(overrides: Partial<IdentityCodeExchangeResultEnvelopePolicy> = {}): IdentityCodeExchangeResultEnvelopePolicy {
  return {
    expectedIssuer: VECTOR.verification.expectedIssuer,
    expectedAudience: VECTOR.verification.expectedAudience,
    expectedClientId: VECTOR.verification.expectedClientId,
    expectedNonce: VECTOR.verification.expectedNonce,
    expectedPrincipalIssuer: RESULT.issuer,
    expectedServiceId: RESULT.serviceId,
    verificationTime: new Date(VECTOR.verification.verificationTime),
    clockSkewSeconds: VECTOR.verification.clockSkewSeconds,
    maximumLifetimeSeconds: VECTOR.verification.maximumLifetimeSeconds,
    ...overrides,
  }
}

function keySet(
  keys: IdentityCodeExchangeResultVerificationKeySet['keys'] = [VECTOR.positive.key],
): IdentityCodeExchangeResultVerificationKeySet {
  return { issuer: VECTOR.verification.expectedIssuer, revision: 1, keys: structuredClone(keys) }
}

describe('Identity signed code-exchange result consumer', () => {
  it('verifies the exact producer positive vector into a fresh result', async () => {
    const verified = await verifyIdentityCodeExchangeResultEnvelope(VECTOR.positive.signedResult, keySet(), policy())
    expect(verified).toEqual(RESULT)
    expect(verified).not.toBe(RESULT)
  })

  it('accepts active and overlap keys and rejects retired keys', async () => {
    for (const [keyId, state, x, y, signedResult] of VECTOR.rotation) {
      const candidate = { keyId, state, algorithm: 'ES256' as const, publicJwk: { kty: 'EC', crv: 'P-256', x, y } }
      const result = await verifyIdentityCodeExchangeResultEnvelope(
        signedResult,
        keySet(state === 'active' ? [candidate] : [VECTOR.positive.key, candidate]),
        policy(),
      )
      expect(result).toEqual(state === 'retired' ? null : RESULT)
    }
  })

  it('rejects binding, time, key namespace, and tamper mismatches', async () => {
    const badPolicies = [
      policy({ expectedIssuer: 'https://identity-other.example.test/v1/code/results' }),
      policy({ expectedAudience: 'https://crux.example.test' }),
      policy({ expectedClientId: 'crux-control' }),
      policy({ expectedNonce: 'wrong_nonce_reference_123456789' }),
      policy({ expectedPrincipalIssuer: 'https://accounts-other.example.test/auth/v1' }),
      policy({ expectedServiceId: 'crux' }),
      policy({ verificationTime: new Date('2026-08-14T00:01:01.000Z') }),
      policy({ maximumLifetimeSeconds: 59 }),
    ]
    for (const candidate of badPolicies) {
      await expect(verifyIdentityCodeExchangeResultEnvelope(VECTOR.positive.signedResult, keySet(), candidate)).resolves.toBeNull()
    }
    const lifecycleKey = { ...VECTOR.positive.key, keyId: 'identity-events-lifecycle-v1' }
    await expect(verifyIdentityCodeExchangeResultEnvelope(VECTOR.positive.signedResult, keySet([lifecycleKey]), policy())).resolves.toBeNull()
    const tampered = `${VECTOR.positive.signedResult.slice(0, -1)}A`
    await expect(verifyIdentityCodeExchangeResultEnvelope(tampered, keySet(), policy())).resolves.toBeNull()
  })

  it('rejects malformed and ambiguous keyrings before cryptographic authority', async () => {
    const invalidKeyrings: IdentityCodeExchangeResultVerificationKeySet['keys'][] = [
      [],
      [VECTOR.positive.key, VECTOR.positive.key],
      [VECTOR.positive.key, { ...VECTOR.positive.key, keyId: 'identity-result-second', state: 'active' }],
      [{ ...VECTOR.positive.key, publicJwk: { ...VECTOR.positive.key.publicJwk, x: 'x' } }],
    ]
    for (const keys of invalidKeyrings) {
      await expect(verifyIdentityCodeExchangeResultEnvelope(VECTOR.positive.signedResult, keySet(keys), policy())).resolves.toBeNull()
    }
  })

  it('snapshots keyring data without invoking accessors or ordinary property reads', async () => {
    let getterReads = 0
    let ordinaryReads = 0
    const hostileKey = Object.defineProperty({ ...VECTOR.positive.key }, 'state', {
      enumerable: true,
      get() {
        getterReads += 1
        return 'active'
      },
    })
    const proxiedKey = new Proxy(VECTOR.positive.key, {
      get() {
        ordinaryReads += 1
        throw new Error('secret=TOP_SECRET')
      },
    })
    const overbound = new Proxy([
      VECTOR.positive.key,
      VECTOR.positive.key,
      VECTOR.positive.key,
      VECTOR.positive.key,
    ], {
      ownKeys() {
        throw new Error('must reject from length before enumeration')
      },
    })
    for (const keys of [[hostileKey], overbound]) {
      await expect(verifyIdentityCodeExchangeResultEnvelope(
        VECTOR.positive.signedResult,
        { issuer: VECTOR.verification.expectedIssuer, revision: 1, keys },
        policy(),
      )).resolves.toBeNull()
    }
    await expect(verifyIdentityCodeExchangeResultEnvelope(
      VECTOR.positive.signedResult,
      { issuer: VECTOR.verification.expectedIssuer, revision: 1, keys: [proxiedKey] },
      policy(),
    )).resolves.toEqual(RESULT)
    expect(getterReads).toBe(0)
    expect(ordinaryReads).toBe(0)
  })

  it('is disconnected from transport, registry, routes, environment, and private keys', () => {
    const source = readFileSync(new URL('../../src/lib/identity/code-exchange-result-envelope.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(|process\.env|registry|wrangler|BEGIN PRIVATE|privateJwk|identity-events-|identity-assertion-/i)
  })
})
