import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { middleware } from '@/middleware'

describe('production middleware opaque-session prefilter', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('continues a protected request carrying a syntactically valid Academy session cookie', async () => {
    const request = new NextRequest('https://academy.cyberskills.co.th/dashboard', {
      headers: { cookie: `academy_session=${'A'.repeat(43)}` },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('still redirects a protected production page without a session cookie', async () => {
    const response = await middleware(
      new NextRequest('https://academy.cyberskills.co.th/dashboard'),
    )

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in')
  })

  it('still denies a protected production API without a session cookie', async () => {
    const response = await middleware(
      new NextRequest('https://academy.cyberskills.co.th/api/progress'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'ต้องเข้าสู่ระบบก่อน',
    })
  })
})
