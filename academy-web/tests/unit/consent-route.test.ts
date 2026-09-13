import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), quota: vi.fn(), marker: vi.fn(), delegate: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/authenticated-mutation-quota', () => ({ checkAuthenticatedMutationQuota: mocks.quota }))
vi.mock('@/lib/edge-rate-limit-policy', () => ({ hasEdgeRateLimitMarker: mocks.marker }))
vi.mock('@/lib/identity/consent-delegation', () => ({ CONSENT_PRINCIPAL_ISSUER: 'https://supabase.cyberskills.co.th/auth/v1', delegateConsent: mocks.delegate }))
import { handleConsentRequest } from '@/lib/account/consent-route'
const issuer = 'https://supabase.cyberskills.co.th/auth/v1'
const subject = '11111111-1111-4111-8111-111111111111'
const input = { type: 'research_statistics', operationId: '22222222-2222-4222-8222-222222222222', expectedRevision: '42' }
function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request('https://academy.cyberskills.co.th/api/account/consents/state', { method: 'POST',
    headers: { origin: 'https://academy.cyberskills.co.th', 'content-type': 'application/json', cookie: '__Host-academy_session=' + 'A'.repeat(43), ...headers }, body: JSON.stringify(body) })
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.marker.mockResolvedValue(true); mocks.quota.mockResolvedValue({ allowed: true })
  mocks.currentUser.mockResolvedValue({ account: { id: 'local-account', issuer, subject }, email: 'display-only@example.test' })
  mocks.delegate.mockResolvedValue({ status: 200, state: { version: 1, consents: [] } })
})
it('derives only the canonical principal from durable server session and uses account quota', async () => {
  const response = await handleConsentRequest(request(), 'state')
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
  expect(mocks.delegate).toHaveBeenCalledWith('state', { issuer, subject }, undefined)
  expect(mocks.currentUser).toHaveBeenCalledWith({ recordActivity: false })
  expect(mocks.quota).toHaveBeenCalledWith({ operation: 'account-consent', accountId: 'local-account', courseSlug: 'account' })
})
it.each([{ principal: { issuer, subject } }, { email: 'fake@example.test' }, { subject }, { clientId: 'academy-web' }])('rejects browser identity fields %j', async body => {
  expect((await handleConsentRequest(request(body), 'state')).status).toBe(400)
  expect(mocks.delegate).not.toHaveBeenCalled()
})
it('rejects cross-site, missing edge marker and missing durable cookie', async () => {
  expect((await handleConsentRequest(request({}, { origin: 'https://evil.test' }), 'state')).status).toBe(403)
  mocks.marker.mockResolvedValue(false)
  expect((await handleConsentRequest(request(), 'state')).status).toBe(403)
  mocks.marker.mockResolvedValue(true)
  expect((await handleConsentRequest(request({}, { cookie: '' }), 'state')).status).toBe(401)
  expect(mocks.delegate).not.toHaveBeenCalled()
})
it('rejects expired session, wrong issuer and exhausted quota before delegation', async () => {
  mocks.currentUser.mockResolvedValueOnce(null)
  expect((await handleConsentRequest(request(), 'state')).status).toBe(401)
  mocks.currentUser.mockResolvedValueOnce({ account: { issuer: 'https://evil.test', subject } })
  expect((await handleConsentRequest(request(), 'state')).status).toBe(403)
  mocks.quota.mockResolvedValue({ allowed: false, status: 429, retryAfterSeconds: 30 })
  const response = await handleConsentRequest(request(), 'state')
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('30')
  expect(mocks.delegate).not.toHaveBeenCalled()
})
it('preserves operation and revision exactly and forwards an authoritative conflict without retrying', async () => {
  const state = { version: 1, consents: [] }
  mocks.delegate.mockResolvedValue({ status: 409, state })
  const response = await handleConsentRequest(request(input), 'withdraw')
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'consent_revision_conflict', state })
  expect(mocks.delegate).toHaveBeenCalledExactlyOnceWith('withdraw', { issuer, subject }, input)
})
it.each(['bad', '', '-1', '01', '9223372036854775808', 42])('rejects invalid revision %s', async revision => {
  expect((await handleConsentRequest(request({ ...input, expectedRevision: revision }), 'withdraw')).status).toBe(400)
  expect(mocks.delegate).not.toHaveBeenCalled()
})
