import vectors from '../fixtures/identity-assurance-v3-public-vectors.json'
import { verifyIdentityCodeExchangeResultEnvelope } from '@/lib/identity/code-exchange-result-envelope'
import { describe, expect, it } from 'vitest'
import { isAcceptableIdentityAuthenticationReceipt, isFreshIdentityAssurance, snapshotIdentityAuthentication } from '@/lib/identity/authentication-assurance'
import { verifyIdentityCodeExchangeResult } from '@/lib/identity/code-exchange-result'
const now = 1789310000
const result = { version: 3, authentication: { method: 'email_otp', auth_time: now - 20 }, issuer: 'https://accounts.example.test/auth/v1', subject: 'subject-1', verifiedEmail: 'learner@example.invalid', audience: 'https://academy.example.test', serviceId: 'academy', nonce: 'A'.repeat(43), activation: { status: 'active', revision: 1 } }
const expectations = { audience: result.audience, expectedIssuer: result.issuer, nonce: result.nonce, serviceId: result.serviceId }
describe('explicit OTP v3 consumer assurance', () => {
  it('accepts v3 OTP for normal sign-in but never sensitive assurance', () => {
    expect(verifyIdentityCodeExchangeResult(result, expectations)).toEqual({ ok: true, result })
    expect(snapshotIdentityAuthentication(result.authentication)).toEqual(result.authentication)
    expect(isAcceptableIdentityAuthenticationReceipt(result.authentication, now)).toBe(true)
    expect(isFreshIdentityAssurance(result.authentication, now)).toBe(false)
    expect(result.authentication.auth_time).toBe(now - 20)
  })
  it('keeps v2 WebAuthn only and rejects unsupported versions and methods', () => {
    expect(verifyIdentityCodeExchangeResult({ ...result, version: 2 }, expectations).ok).toBe(false)
    expect(verifyIdentityCodeExchangeResult({ ...result, version: 4 }, expectations).ok).toBe(false)
    expect(verifyIdentityCodeExchangeResult({ ...result, authentication: { method: 'password', auth_time: now } }, expectations).ok).toBe(false)
    expect(verifyIdentityCodeExchangeResult({ ...result, version: 2, authentication: { method: 'webauthn_uv', auth_time: now } }, expectations).ok).toBe(true)
  })
  it('rejects stale and future OTP timestamps without substituting a new timestamp', () => {
    for (const auth_time of [now - 331, now + 31, -1]) expect(isAcceptableIdentityAuthenticationReceipt({ method: 'email_otp', auth_time }, now)).toBe(false)
  })
})

// Exercise the producer's immutable synthetic Crux-audience bytes using an explicit
// matching verifier policy; production Academy policy remains Academy-bound.
describe('producer signed v3 interoperability', () => {
  it.each(vectors.vectors.filter((v) => v.name !== 'otp-v3-refused-by-v2'))('$name', async (fixture) => {
    const expected = JSON.parse(Buffer.from(fixture.signedResult.split('.')[1], 'base64url').toString()).result
    const verified = await verifyIdentityCodeExchangeResultEnvelope(fixture.signedResult, { issuer: vectors.issuer, revision: 1, keys: [{ keyId: vectors.keyId, algorithm: 'ES256', state: 'active', publicJwk: vectors.publicJwk }] }, { expectedIssuer: vectors.issuer, expectedAudience: vectors.audience, expectedClientId: vectors.clientId, expectedNonce: vectors.nonce, expectedPrincipalIssuer: expected.issuer, expectedServiceId: expected.serviceId, verificationTime: new Date(vectors.nowSeconds * 1000), clockSkewSeconds: 30, maximumLifetimeSeconds: 120 })
    expect(verified).toEqual(fixture.valid ? expected : null)
  })
})
