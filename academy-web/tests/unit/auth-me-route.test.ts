import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, routeAuthClient } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  routeAuthClient: vi.fn(),
}))

vi.mock('@/lib/auth/route-client', () => ({ routeAuthClient }))
vi.mock('@/lib/auth/session', () => ({ currentUser }))

import { GET } from '@/app/(site)/api/auth/me/route'

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://shared-auth.example')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-looking-value')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('validates the opaque production session with currentUser on a non-loopback request', async () => {
    currentUser.mockResolvedValue({ account: {}, email: 'learner@example.com' })

    const response = await GET(new Request('https://academy.cyberskills.co.th/api/auth/me'))

    expect(routeAuthClient).not.toHaveBeenCalled()
    expect(currentUser).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ signedIn: true, email: 'learner@example.com' })
  })

  it('reports signed out when currentUser rejects an absent durable session', async () => {
    currentUser.mockResolvedValue(null)

    const response = await GET(new Request('https://academy.cyberskills.co.th/api/auth/me'))

    expect(routeAuthClient).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ signedIn: false })
  })
})
