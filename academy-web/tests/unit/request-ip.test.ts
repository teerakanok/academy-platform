import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientKey } from '@/lib/request-ip'

describe('clientKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('trusts Cloudflare client IP ahead of forwarded headers', () => {
    const request = new Request('https://academy.cyberskills.co.th/api/auth/otp', {
      headers: {
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '198.51.100.9',
      },
    })

    expect(clientKey(request)).toBe('203.0.113.7')
  })

  it('does not trust browser-supplied forwarded headers in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = new Request('https://academy.cyberskills.co.th/api/auth/otp', {
      headers: { 'x-forwarded-for': '198.51.100.9' },
    })

    expect(clientKey(request)).toBe('missing-cf-connecting-ip')
  })
})
