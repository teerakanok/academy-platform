import type { NextConfig } from 'next'

function localAccountCenterFormActionOrigin(): string | null {
  if (
    process.env.NODE_ENV === 'production'
    || process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE !== '1'
  ) return null

  const value = process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && url.origin === value
      ? value
      : null
  } catch {
    return null
  }
}

const localAccountCenterOrigin = localAccountCenterFormActionOrigin()

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `form-action 'self'${localAccountCenterOrigin ? ` ${localAccountCenterOrigin}` : ''}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  // next dev (react-refresh/eval sourcemap) ต้องการ unsafe-eval; production ไม่เติมเด็ดขาด
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "manifest-src 'self'",
].join('; ')

const nextConfig: NextConfig = {
  // Security baseline: ไม่มี external resource ใน CSP scope ของ app นี้ —
  // fonts ผ่าน next/font (self-hosted ตอน build), ไม่มี third-party script
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ]
  },
}

export default nextConfig
