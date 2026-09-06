import { describe, expect, it } from 'vitest'
import { unservedHostResponse } from '@/lib/edge-host-policy'
import { servePrivateMedia } from '@/lib/media/worker-delivery'

const EXPECTED_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'X-DNS-Prefetch-Control': 'off',
} as const

describe('Worker-generated response security headers', () => {
  it('applies the existing Next.js baseline to host refusals', () => {
    const response = unservedHostResponse()

    for (const [key, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(response.headers.get(key)).toBe(value)
    }
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('applies the baseline to protected-media refusal and error responses', async () => {
    const [legacy, unconfigured] = await Promise.all([
      servePrivateMedia(new Request('https://academy.test/media/lesson-demo.mp4'), {
        MEDIA_SIGNING_SECRET: 'unused-secret',
      }),
      servePrivateMedia(new Request('https://academy.test/course-media/formats-handout'), {}),
    ])

    expect(legacy?.status).toBe(404)
    expect(unconfigured?.status).toBe(503)
    for (const response of [legacy, unconfigured]) {
      expect(response).toBeDefined()
      for (const [key, value] of Object.entries(EXPECTED_HEADERS)) {
        expect(response!.headers.get(key)).toBe(value)
      }
    }
  })
})
