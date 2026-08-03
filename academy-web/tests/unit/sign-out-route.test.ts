import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  return new Request('https://academy.cyberskills.co.th/api/auth/sign-out', {
    method: 'POST',
    headers: { origin: 'https://academy.cyberskills.co.th' },
  })
}

describe('POST /api/auth/sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
