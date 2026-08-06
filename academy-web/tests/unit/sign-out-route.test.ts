import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routeAuthClient, clearRouteAuthCookies } = vi.hoisted(() => ({
  routeAuthClient: vi.fn(),
  clearRouteAuthCookies: vi.fn(),
}))

vi.mock('@/lib/auth/route-client', () => ({
  routeAuthClient,
  clearRouteAuthCookies,
}))

import { POST } from '@/app/api/auth/sign-out/route'

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
})
