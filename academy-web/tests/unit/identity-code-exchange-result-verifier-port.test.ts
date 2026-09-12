import publicVectors from '../fixtures/identity-assurance-v2-public-vectors.json'
import { describe, expect, it } from 'vitest'

import {
  IdentityCodeExchangeResultVerifierFailure,
  createIdentityCodeExchangeResultVerifierPort,
} from '@/lib/identity/code-exchange-result-verifier-port'

const vector = publicVectors.vectors.find((value) => value.serviceId === 'academy')!
const RESULT = vector.result
const ENVELOPE_ISSUER = publicVectors.issuer
const VERIFICATION_TIME = new Date(publicVectors.now * 1_000)
const POSITIVE = { keyId: publicVectors.keyId, algorithm: 'ES256' as const,
  state: 'active' as const, publicJwk: publicVectors.publicJwk, signedResult: vector.cases[0].envelope }
const OVERLAP = { ...POSITIVE, state: 'overlap' as const }
const RETIRED = { ...POSITIVE, state: 'retired' as const }

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

    const overlap = createPort([{ ...POSITIVE, keyId: 'identity-result-other' }, OVERLAP])
    await expect(overlap.verify({ signedResult: OVERLAP.signedResult }, BINDING)).resolves.toEqual(RESULT)
  })

  it('rejects retired, tampered, unsigned, binding, service, and time mismatches with a fixed failure', async () => {
    const retired = createPort([{ ...POSITIVE, keyId: 'identity-result-other' }, RETIRED])
    const active = createPort([POSITIVE])
    const expired = createPort([POSITIVE], new Date((publicVectors.now + 61) * 1_000))
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
