import { describe, expect, it } from 'vitest'
import vectors from '../fixtures/identity-assurance-v2-public-vectors.json'
import { verifyIdentityCodeExchangeResultEnvelope } from '@/lib/identity/code-exchange-result-envelope'
import { isAcceptableIdentityAuthenticationReceipt, isFreshIdentityAssurance, snapshotIdentityAuthentication, snapshotIdentitySessionAssurance } from '@/lib/identity/authentication-assurance'

const vector = vectors.vectors.find((value) => value.serviceId === 'academy')!
const keySet = { issuer: vectors.issuer, revision: 1, keys: [{
  keyId: vectors.keyId, algorithm: 'ES256', state: 'active', publicJwk: vectors.publicJwk,
}] }
const policy = (offset = 0) => ({
  expectedIssuer: vectors.issuer, expectedAudience: vector.audience,
  expectedClientId: vector.clientId, expectedNonce: vector.nonce,
  expectedPrincipalIssuer: vector.result.issuer, expectedServiceId: vector.serviceId,
  verificationTime: new Date((vectors.now + offset) * 1_000), clockSkewSeconds: 30, maximumLifetimeSeconds: 120,
})

describe('coordinated producer assurance v2 interoperability', () => {
  it.each(vector.cases)('$id', async (fixture) => {
    const result = await verifyIdentityCodeExchangeResultEnvelope(fixture.envelope, keySet, policy(fixture.offset))
    expect(result !== null).toBe(fixture.accepted)
    if (fixture.accepted) expect(result).toEqual(vector.result)
  })
  it('refuses signed-field tampering without re-signing', async () => {
    const [header, payload, signature] = vector.cases[0].envelope.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    claims.result.authentication.auth_time = vectors.now
    const tampered = [header, Buffer.from(JSON.stringify(claims)).toString('base64url'), signature].join('.')
    expect(await verifyIdentityCodeExchangeResultEnvelope(tampered, keySet, policy())).toBeNull()
  })
  it('receipt skew is distinct from sensitive freshness, with no clamping', () => {
    const authentication = { method: 'webauthn_uv', auth_time: vectors.now + 30 }
    expect(isAcceptableIdentityAuthenticationReceipt(authentication, vectors.now)).toBe(true)
    expect(isFreshIdentityAssurance(authentication, vectors.now)).toBe(false)
    expect(isFreshIdentityAssurance(authentication, vectors.now + 30)).toBe(true)
    expect(authentication.auth_time).toBe(vectors.now + 30)
    expect(isFreshIdentityAssurance(vector.result.authentication, vectors.now - 1)).toBe(true)
    expect(isFreshIdentityAssurance(vector.result.authentication, vectors.now)).toBe(false)
    expect(isAcceptableIdentityAuthenticationReceipt(vector.result.authentication, vectors.now + 30)).toBe(true)
    expect(isAcceptableIdentityAuthenticationReceipt(vector.result.authentication, vectors.now + 31)).toBe(false)
  })
  it('unknown legacy, accessor and malformed authentication cannot authorize step-up', () => {
    expect(snapshotIdentitySessionAssurance({ method: 'legacy_unknown' })).toEqual({ method: 'legacy_unknown' })
    for (const value of [undefined, null, { method: 'legacy_unknown' },
      { method: 'webauthn_uv', auth_time: -1 }, { method: 'webauthn_uv', auth_time: Number.MAX_SAFE_INTEGER + 1 },
      { method: 'webauthn_uv', get auth_time() { throw new Error('not evaluated') } },
      { method: 'webauthn_uv', auth_time: vectors.now, extra: true }]) {
      expect(snapshotIdentityAuthentication(value)).toBeNull()
      expect(isFreshIdentityAssurance(value, vectors.now)).toBe(false)
    }
  })
})

