import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

afterEach(() => vi.unstubAllEnvs())

describe('profile route admission', () => {
  it('requires an Academy session before the private profile and malformed share URLs', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const path of ['/profile', '/profile/share/synthetic-share']) {
      const response = await middleware(new NextRequest(`https://academy.example.test${path}`))
      expect(response.status).toBe(307)
      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/sign-in')
      expect(location.searchParams.get('next')).toBe(path)
    }
  })

  it('allows only the bounded public share page and public read endpoint without a session', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const path of [`/profile/share/shr_${'a'.repeat(32)}`, '/api/profile/public/read']) {
      const response = await middleware(new NextRequest(`https://academy.example.test${path}`))
      expect(response.status).toBe(200)
    }
    const response = await middleware(new NextRequest('https://academy.example.test/api/profile/self'))
    expect(response.status).toBe(401)
  })
})
