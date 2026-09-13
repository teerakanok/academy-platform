import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import vectors from '../fixtures/consumer-consent-v1-public-vectors.json'
import { consentDigestInput, delegateConsent, signConsentAssertion, type ConsentOperation } from '@/lib/identity/consent-delegation'
import type { ConsentWithdrawal } from '@/lib/account/consent-contract'
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
const privateJwk = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })
const environment = {
  IDENTITY_RUNTIME_ENABLED: 'true', IDENTITY_RUNTIME_WIRED: 'true', IDENTITY_RELEASE_APPROVAL: 'true',
  IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '1000', IDENTITY_CLIENT_ASSERTION_KEY_ID: 'consent-test', IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: privateJwk,
  IDENTITY_RESULT_KEY_SET_DOCUMENT: JSON.stringify({ issuer: 'https://accounts.cyberskills.co.th/v1/code/results', revision: 1,
    keys: [{ keyId: 'result-test', algorithm: 'ES256', publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, state: 'active' }],
    retiredKeyFingerprints: [], retiredKeyIds: [] }),
}
const principal = { issuer: 'https://supabase.cyberskills.co.th/auth/v1', subject: '11111111-1111-4111-8111-111111111111' }
const withdrawal: ConsentWithdrawal = { type: 'marketing_email', operationId: '22222222-2222-4222-8222-222222222222', expectedRevision: '42' }
const state = { version: 1, consents: ['research_statistics', 'marketing_email'].map(type => ({
  type, status: 'not_granted', documentVersion: 'v1', grantedAt: null, withdrawnAt: null, revision: '0',
})) }
const response = (body: unknown = state, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
})
afterEach(() => vi.useRealTimers())
it('pins exact producer vectors and reproduces signed digest tuple for both valid operations', () => {
  expect(createHash('sha256').update(readFileSync('tests/fixtures/consumer-consent-v1-public-vectors.json')).digest('hex'))
    .toBe('651c43d5da68437cbbebb5ec42ac16752c13d553ecb1a05d30427a61a97a196c')
  for (const vector of vectors.vectors.filter(item => item.expected)) {
    const input = vector.operation === 'withdraw' ? { type: vector.body.type, operationId: vector.body.operationId, expectedRevision: vector.body.expectedRevision } as ConsentWithdrawal : undefined
    const tuple = consentDigestInput(vector.operation as ConsentOperation, vector.body.principal, input)
    const payload = JSON.parse(Buffer.from(vector.jwt.split('.')[1], 'base64url').toString())
    expect(createHash('sha256').update(tuple).digest('hex')).toBe(payload.requestDigest)
  }
})
it('signs exact dedicated claims with a valid ES256 signature and binds the revision', async () => {
  const jwt = await signConsentAssertion({ operation: 'withdraw', principal, withdrawal, privateJwk, keyId: 'consent-test', now: 1789300800, jti: 'consent_test_jti_1234' })
  const [header, payload, signature] = jwt.split('.')
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'consent-test', typ: 'identity-consent-delegation-v1+jwt' })
  expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
    iss: 'academy-web', sub: 'academy-web', aud: 'https://accounts.cyberskills.co.th/v1/consumer-consents/withdraw',
    iat: 1789300800, exp: 1789300860, jti: 'consent_test_jti_1234', purpose: 'consent.withdraw',
    requestDigest: createHash('sha256').update(consentDigestInput('withdraw', principal, withdrawal)).digest('hex'),
  })
  expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`))).toBe(true)
  expect(consentDigestInput('withdraw', principal, withdrawal)).not.toBe(consentDigestInput('withdraw', principal, { ...withdrawal, expectedRevision: '43' }))
})
it('sends only signed machine request to pinned endpoint and reads validated state', async () => {
  const fetcher = vi.fn(async () => response())
  expect(await delegateConsent('state', principal, undefined, { environment, fetch: fetcher })).toEqual({ status: 200, state })
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://accounts.cyberskills.co.th/v1/consumer-consents/state')
  expect(init).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store', method: 'POST' })
  expect(Object.keys(init.headers!)).toEqual(['content-type', 'authorization'])
  expect(JSON.parse(init.body as string)).toEqual({ version: 1, clientId: 'academy-web', principal })
})
it('returns revision conflict state without retrying or replacing revision', async () => {
  const fetcher = vi.fn(async () => response({ error: 'consent_revision_conflict', state }, 409))
  expect(await delegateConsent('withdraw', principal, withdrawal, { environment, fetch: fetcher })).toEqual({ status: 409, state })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).expectedRevision).toBe('42')
})
it.each([
  () => response({ ...state, email: 'forbidden@example.test' }),
  () => response({ ...state, consents: [state.consents[0], state.consents[0]] }),
  () => response(state, 200, { 'cache-control': 'public' }),
  () => response(state, 200, { 'set-cookie': 'not-forwarded' }),
  () => response({ padding: 'x'.repeat(17000) }),
  () => response(state, 302, { location: 'https://evil.test' }),
  () => new Response('{"version":1,"version":1,"consents":[]}', { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } }),
])('rejects unsafe upstream response', async makeResponse => {
  expect((await delegateConsent('state', principal, undefined, { environment, fetch: async () => makeResponse() })).status).toBe(503)
})
it('rejects wrong issuer and disabled runtime before any network call', async () => {
  const fetcher = vi.fn()
  expect((await delegateConsent('state', { ...principal, issuer: 'https://evil.test' }, undefined, { environment, fetch: fetcher })).status).toBe(503)
  expect((await delegateConsent('state', principal, undefined, { environment: {}, fetch: fetcher })).status).toBe(503)
  expect(fetcher).not.toHaveBeenCalled()
})
it('bounds a hung fetch and aborts the transport', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | null | undefined
  const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => { signal = init?.signal; return new Promise<Response>(() => {}) })
  const pending = delegateConsent('state', principal, undefined, { environment, fetch: fetcher })
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled(), { interval: 10 })
  await vi.advanceTimersByTimeAsync(5000)
  expect((await pending).status).toBe(503); expect(signal?.aborted).toBe(true)
})
it('cancels a rejected response body without consuming upstream content', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream({ type: 'bytes', cancel })
  const result = await delegateConsent('state', principal, undefined, { environment,
    fetch: async () => new Response(body, { status: 302, headers: { 'cache-control': 'no-store' } }) })
  expect(result.status).toBe(503); expect(cancel).toHaveBeenCalledTimes(1)
})
it('bounds and cancels a delayed body under the same transport deadline', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const fetcher = vi.fn(async () => new Response(new ReadableStream({ type: 'bytes', cancel }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  }))
  const pending = delegateConsent('state', principal, undefined, { environment, fetch: fetcher })
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled(), { interval: 10 })
  await vi.advanceTimersByTimeAsync(5000)
  expect((await pending).status).toBe(503); expect(cancel).toHaveBeenCalledTimes(1)
})
