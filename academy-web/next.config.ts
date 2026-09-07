import type { NextConfig } from 'next'
import { academyContentSecurityPolicy } from './src/lib/content-security-policy'

const nextConfig: NextConfig = {
  // Security baseline: ไม่มี external resource ใน CSP scope ของ app นี้ —
  // fonts ผ่าน next/font (self-hosted ตอน build), ไม่มี third-party script
  poweredByHeader: false,
  webpack(config, { dev }) {
    if (!dev && process.env.ACADEMY_BUILD_DISABLE_WEBPACK_CACHE === '1') {
      config.cache = false
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Rendered production CSP belongs to middleware. OpenNext combines
          // configured headers with middleware headers; a second static policy
          // would block legitimate nonce-bearing hydration scripts.
          ...(process.env.NODE_ENV === 'development' ? [{
            key: 'Content-Security-Policy',
            value: academyContentSecurityPolicy(["'self'", "'unsafe-eval'"]),
          }] : []),
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
