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
      headers: { cookie: `__Host-academy_session=${'A'.repeat(43)}` },
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

  it('rejects caller CSP controls and mints unique nonce policies', async () => {
    const makeRequest = () => new NextRequest('https://academy.cyberskills.co.th/', {
      headers: {
        cookie: `__Host-academy_session=${'A'.repeat(43)}`,
        'content-security-policy': "script-src 'nonce-attacker-value'",
        'x-nonce': 'attacker',
      },
    })

    const [first, second] = [await middleware(makeRequest()), await middleware(makeRequest())]
    const policy = first.headers.get('content-security-policy') ?? ''
    const forwardedNonce = first.headers.get('x-middleware-request-x-nonce')
    const scriptPolicy = policy.split('; ').find((directive) => directive.startsWith('script-src')) ?? ''

    expect(scriptPolicy).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]{44}' 'strict-dynamic'$/)
    expect(scriptPolicy).not.toContain('unsafe-inline')
    expect(scriptPolicy).not.toContain('unsafe-eval')
    expect(scriptPolicy).not.toContain('attacker')
    expect(forwardedNonce).not.toBe('attacker')
    expect(first.headers.get('x-middleware-request-content-security-policy')).toContain(forwardedNonce!)
    expect(second.headers.get('x-middleware-request-x-nonce')).not.toBe(forwardedNonce)
  })

  it('preserves production sign-in redirects while applying the strict edge fallback', async () => {
    const response = await middleware(new NextRequest('https://academy.cyberskills.co.th/dashboard'))
    const policy = response.headers.get('content-security-policy') ?? ''
    const scriptPolicy = policy.split('; ').find((directive) => directive.startsWith('script-src')) ?? ''

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in')
    expect(scriptPolicy).toBe("script-src 'self'")
  })
})
