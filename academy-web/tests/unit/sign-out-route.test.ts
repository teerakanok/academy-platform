import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routeAuthClient, clearRouteAuthCookies, revokeLocalAcademySession, productionSessionStore } = vi.hoisted(() => ({
  routeAuthClient: vi.fn(),
  clearRouteAuthCookies: vi.fn(),
  revokeLocalAcademySession: vi.fn(),
  productionSessionStore: vi.fn(),
}))

vi.mock('@/lib/auth/route-client', () => ({
  routeAuthClient,
  clearRouteAuthCookies,
}))

vi.mock('@/lib/identity/local-runtime', () => ({ revokeLocalAcademySession }))
vi.mock('@/lib/identity/production-runtime', () => ({
  createAcademyIdentityProductionSessionStore: productionSessionStore,
}))

import { POST } from '@/app/(site)/api/auth/sign-out/route'
import { projectSignOutResponse } from '@/lib/auth/account-response-client'

function request() {
  return new Request('http://127.0.0.1:3000/api/auth/sign-out', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3000' },
  })
}

describe('POST /api/auth/sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-public-fixture-key')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('provider revoke ล้มเหลวก็ล้าง cookie ของ browser และคืน contract local-only', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: new Error('provider unavailable') })
    routeAuthClient.mockResolvedValue({ auth: { signOut } })

    const response = await POST(request())

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(clearRouteAuthCookies).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      scope: 'local',
      revocation: 'not-confirmed',
    })
  })

  it('local store revoke ล้มเหลวก็ expire browser cookie และคืน not-confirmed', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE', '1')
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN', 'http://localhost:3000')
    revokeLocalAcademySession.mockImplementation(() => {
      throw new Error('local store unavailable')
    })

    const response = await POST(new Request('http://localhost:3000/api/auth/sign-out', {
      method: 'POST',
      headers: {
        cookie: `academy_session=${'A'.repeat(32)}`,
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      scope: 'local',
      revocation: 'not-confirmed',
    })
    expect(response.headers.get('set-cookie')).toContain('academy_session=;')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('revokes the production opaque session and expires only the current-device cookie', async () => {
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '')
    const revoke = vi.fn().mockResolvedValue(undefined)
    productionSessionStore.mockReturnValue({ revoke })
    const sessionId = 'A'.repeat(43)

    const response = await POST(new Request('https://academy.cyberskills.co.th/api/auth/sign-out', {
      method: 'POST',
      headers: {
        cookie: `academy_session=${sessionId}`,
        host: 'academy.cyberskills.co.th',
        origin: 'https://academy.cyberskills.co.th',
        'sec-fetch-site': 'same-origin',
      },
    }))

    expect(revoke).toHaveBeenCalledWith(sessionId)
    const payload = await response.json()
    expect(payload).toEqual({
      ok: true,
      scope: 'local',
      revocation: 'confirmed',
    })
    expect(projectSignOutResponse(payload)).toEqual({ revocation: 'confirmed' })
    expect(response.headers.get('set-cookie')).toContain('academy_session=;')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
