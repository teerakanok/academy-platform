import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, createCoreHostClient, marker, profile, share, publicShare } = vi.hoisted(() => ({
  currentUser: vi.fn(), createCoreHostClient: vi.fn(), marker: vi.fn(),
  profile: vi.fn(), share: vi.fn(), publicShare: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/profile/core-host-client', () => ({ createCoreHostClient }))
vi.mock('@/lib/edge-rate-limit-policy', () => ({ hasEdgeRateLimitMarker: marker }))
import { POST as self } from '@/app/(site)/api/profile/self/route'
import { POST as publicRead } from '@/app/(site)/api/profile/public/read/route'

const origin = 'https://academy.example.test'
const principal = { issuer: 'https://accounts.example.test/', subject: 'synthetic-learner' }
const shareId = `shr_${'a'.repeat(32)}`
const secret = 'b'.repeat(64)
const request = (path: string, body: unknown, source = origin) => new Request(`${origin}${path}`, {
  method: 'POST', headers: { origin: source, 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('profile API boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser.mockResolvedValue({ account: principal })
    createCoreHostClient.mockReturnValue({ profile, share, publicShare })
    marker.mockResolvedValue(true)
  })

  it('uses only the resolved session principal and rejects supplied identity or name', async () => {
    profile.mockResolvedValue({ synthetic: true })
    const ok = await self(request('/api/profile/self', { operation: 'profile' }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(profile).toHaveBeenCalledWith(principal)
    expect((await self(request('/api/profile/self', { operation: 'profile', principal: { ...principal, subject: 'other' } }))).status).toBe(400)
    expect((await self(request('/api/profile/self', { operation: 'share', command: {
      requestId: '00000000-0000-4000-8000-000000000001', skillIds: ['synthetic'],
      includeRoleComparison: false, expiresInDays: 30, secret, displayName: 'forged',
    } }))).status).toBe(400)
    expect(share).not.toHaveBeenCalled()
    expect((await self(request('/api/profile/self', { operation: 'profile' }, 'https://other.example.test'))).status).toBe(403)
  })

  it('fails closed without an active session or host configuration', async () => {
    currentUser.mockResolvedValueOnce(null)
    expect((await self(request('/api/profile/self', { operation: 'profile' }))).status).toBe(401)
    createCoreHostClient.mockReturnValueOnce(null)
    expect((await self(request('/api/profile/self', { operation: 'profile' }))).status).toBe(503)
    expect(profile).not.toHaveBeenCalled()
  })

  it('requires the edge marker for public reads and never accepts the secret in a URL', async () => {
    marker.mockResolvedValueOnce(false)
    expect((await publicRead(request('/api/profile/public/read', { shareId, secret }))).status).toBe(503)
    expect(publicShare).not.toHaveBeenCalled()
    publicShare.mockResolvedValue({ synthetic: true })
    const ok = await publicRead(request('/api/profile/public/read', { shareId, secret }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(ok.headers.get('referrer-policy')).toBe('no-referrer')
    expect(publicShare).toHaveBeenCalledWith(shareId, secret)
    expect((await publicRead(request(`/api/profile/public/read?secret=${secret}`, { shareId, secret }))).status).toBe(400)
  })
})
