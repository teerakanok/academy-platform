import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routeAuthClient } = vi.hoisted(() => ({ routeAuthClient: vi.fn() }))

vi.mock('@/lib/auth/route-client', () => ({ routeAuthClient }))

import { GET } from '@/app/api/auth/me/route'

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://shared-auth.example')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-looking-value')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not inspect a shared GoTrue session on a non-loopback Academy request', async () => {
    const response = await GET(new Request('https://academy.cyberskills.co.th/api/auth/me'))

    expect(routeAuthClient).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ signedIn: false })
  })
})
