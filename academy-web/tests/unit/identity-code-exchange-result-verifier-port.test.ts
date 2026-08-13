import { describe, expect, it } from 'vitest'

import {
  IdentityCodeExchangeResultVerifierFailure,
  createIdentityCodeExchangeResultVerifierPort,
} from '@/lib/identity/code-exchange-result-verifier-port'

const RESULT = {
  issuer: 'https://accounts.example.test/auth/v1',
  subject: 'consumer-vector-subject',
  verifiedEmail: 'vector@example.test',
  audience: 'https://academy.example.test',
  serviceId: 'academy',
  nonce: 'vector_nonce_reference_123456789',
  activation: { status: 'active' as const, revision: 7 },
}

const ENVELOPE_ISSUER = 'https://identity.example.test/v1/code/results'
const VERIFICATION_TIME = new Date('2026-08-14T00:00:00.000Z')
const POSITIVE = {
  keyId: 'identity-result-conformance-v1',
  algorithm: 'ES256' as const,
  state: 'active' as const,
  publicJwk: {
    kty: 'EC', crv: 'P-256',
    x: 'vsH-Muazqvy-BMIqlGTEZdM3RvQnpPXgHcuYgb3_N-4',
    y: 'BM50ND93TPNJH8-v3shQpGMEh9KB4t_5kT4nel_XXwk',
  },
  signedResult: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1jb25mb3JtYW5jZS12MSIsInR5cCI6ImlkZW50aXR5LWNvZGUtZXhjaGFuZ2UtcmVzdWx0K2p3dCJ9.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.Occgs2MeuSjq3Gp1bwYPH2AB7LY-a30IUn3tfHyo3qRT2aE2GbNhHH8clEA-YDau3NRjQpI0BOlxUMXho-5Krw',
}
const OVERLAP = {
  keyId: 'identity-result-rotation-overlap-v1',
  algorithm: 'ES256' as const,
  state: 'overlap' as const,
  publicJwk: {
    kty: 'EC', crv: 'P-256',
    x: 'TfHGG_1iBBb-_RYOZBBhZsAZ6OHRBqcHW8mPsEPeTd4',
    y: '7g3lIIjkd8B_2JkNpalVmNGi3xJi5JURPxvaqNuwato',
  },
  signedResult: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1yb3RhdGlvbi1vdmVybGFwLXYxIiwidHlwIjoiaWRlbnRpdHktY29kZS1leGNoYW5nZS1yZXN1bHQrand0In0.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.jwZ5hhn3CxKk0qGWnOrnaibX8ia1r8CHbKtlfgCVmrwyhabqG8usmuF16Dvba0Na6VPkzAssFQtuqf9mO0CyNA',
}
const RETIRED = {
  keyId: 'identity-result-rotation-retired-v0',
  algorithm: 'ES256' as const,
  state: 'retired' as const,
  publicJwk: {
    kty: 'EC', crv: 'P-256',
    x: 'JwmqMvbWg8CnzfU3VKaILuP9D-oNRHwU25QS8Ggvxcc',
    y: '9TYLu97eNwzqrceiuGJ_xN1PYA8pFG9NvJsmc-xn7G0',
  },
  signedResult: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LXJlc3VsdC1yb3RhdGlvbi1yZXRpcmVkLXYwIiwidHlwIjoiaWRlbnRpdHktY29kZS1leGNoYW5nZS1yZXN1bHQrand0In0.eyJhdWQiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0IiwiY2xpZW50SWQiOiJhY2FkZW15LXdlYiIsImV4cCI6MTc4NjY2NTY2MCwiaWF0IjoxNzg2NjY1NjAwLCJpc3MiOiJodHRwczovL2lkZW50aXR5LmV4YW1wbGUudGVzdC92MS9jb2RlL3Jlc3VsdHMiLCJyZXN1bHQiOnsiaXNzdWVyIjoiaHR0cHM6Ly9hY2NvdW50cy5leGFtcGxlLnRlc3QvYXV0aC92MSIsInN1YmplY3QiOiJjb25zdW1lci12ZWN0b3Itc3ViamVjdCIsInZlcmlmaWVkRW1haWwiOiJ2ZWN0b3JAZXhhbXBsZS50ZXN0IiwiYXVkaWVuY2UiOiJodHRwczovL2FjYWRlbXkuZXhhbXBsZS50ZXN0Iiwic2VydmljZUlkIjoiYWNhZGVteSIsIm5vbmNlIjoidmVjdG9yX25vbmNlX3JlZmVyZW5jZV8xMjM0NTY3ODkiLCJhY3RpdmF0aW9uIjp7InN0YXR1cyI6ImFjdGl2ZSIsInJldmlzaW9uIjo3fX19.-s2DnwzG8lxv1A_jW7aYbfoYkKa5feXJhyrTJxHp95yHEaXWsPpCy7wRpNQxzV0W5tE8njw92d4Wc7ZnoRLQiA',
}

const BINDING = {
  expectedAudience: RESULT.audience,
  expectedClientId: 'academy-web',
  expectedNonce: RESULT.nonce,
  expectedPrincipalIssuer: RESULT.issuer,
  expectedServiceId: RESULT.serviceId,
}

describe('Identity code-exchange signed-result verifier port', () => {
  it('accepts exact active and overlap producer vectors into fresh results', async () => {
    const active = createPort([POSITIVE])
    await expect(active.verify({ signedResult: POSITIVE.signedResult }, BINDING)).resolves.toEqual(RESULT)

    const overlap = createPort([POSITIVE, OVERLAP])
    await expect(overlap.verify({ signedResult: OVERLAP.signedResult }, BINDING)).resolves.toEqual(RESULT)
  })

  it('rejects retired, tampered, unsigned, binding, service, and time mismatches with a fixed failure', async () => {
    const retired = createPort([POSITIVE, RETIRED])
    const active = createPort([POSITIVE])
    const expired = createPort([POSITIVE], new Date('2026-08-14T00:01:01.000Z'))
    const unknownKid = replaceJwsHeader(POSITIVE.signedResult, {
      alg: 'ES256', kid: 'identity-result-unknown-v1', typ: 'identity-code-exchange-result+jwt',
    })
    const cases: Array<() => Promise<unknown>> = [
      () => retired.verify({ signedResult: RETIRED.signedResult }, BINDING),
      () => active.verify({ signedResult: unknownKid }, BINDING),
      () => active.verify({ signedResult: `${POSITIVE.signedResult.slice(0, -1)}A` }, BINDING),
      () => active.verify(RESULT, BINDING),
      () => active.verify({ signedResult: POSITIVE.signedResult }, { ...BINDING, expectedAudience: 'https://other.example.test' }),
      () => active.verify({ signedResult: POSITIVE.signedResult }, { ...BINDING, expectedClientId: 'other-client' }),
      () => active.verify({ signedResult: POSITIVE.signedResult }, { ...BINDING, expectedNonce: 'wrong_nonce_reference_123456789' }),
      () => active.verify({ signedResult: POSITIVE.signedResult }, { ...BINDING, expectedPrincipalIssuer: 'https://accounts-other.example.test/auth/v1' }),
      () => active.verify({ signedResult: POSITIVE.signedResult }, { ...BINDING, expectedServiceId: 'crux' }),
      () => expired.verify({ signedResult: POSITIVE.signedResult }, BINDING),
    ]
    for (const operation of cases) await expectFailure(operation())
  })
})

function createPort(
  keys: Array<typeof POSITIVE | typeof OVERLAP | typeof RETIRED>,
  verificationTime = VERIFICATION_TIME,
) {
  const verificationKeys = keys.map((key) => ({
    keyId: key.keyId,
    algorithm: key.algorithm,
    state: key.state,
    publicJwk: key.publicJwk,
  }))
  return createIdentityCodeExchangeResultVerifierPort({
    keySet: { issuer: ENVELOPE_ISSUER, revision: 1, keys: verificationKeys },
    clock: () => new Date(verificationTime),
    clockSkewSeconds: 10,
    maximumLifetimeSeconds: 90,
  })
}

function replaceJwsHeader(jws: string, header: Record<string, string>): string {
  const [, payload, signature] = jws.split('.')
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${payload}.${signature}`
}

async function expectFailure(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(IdentityCodeExchangeResultVerifierFailure)
  await operation.catch((error: unknown) => {
    expect((error as Error).message).toBe('Identity code exchange result verification failed')
    expect(Object.keys(error as object)).toEqual([])
  })
}
