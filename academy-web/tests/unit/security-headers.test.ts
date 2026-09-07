import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'
import { ACADEMY_EDGE_SECURITY_HEADERS } from '../../src/lib/edge-security-headers'

const EXPECTED_CSP = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['object-src', ["'none'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:']],
  ['font-src', ["'self'", 'data:']],
  ['media-src', ["'self'", 'blob:']],
  ['connect-src', ["'self'"]],
  ['worker-src', ["'self'", 'blob:']],
  ['frame-src', ["'none'"]],
  ['manifest-src', ["'self'"]],
] as const

async function globalHeaders(): Promise<Map<string, string>> {
  expect(nextConfig.headers).toBeTypeOf('function')
  const rules = await nextConfig.headers!()
  const globalRule = rules.find((rule) => rule.source === '/:path*')
  expect(globalRule).toBeDefined()
  return new Map(globalRule!.headers.map(({ key, value }) => [key, value]))
}

describe('production HTTP security headers', () => {
  it('applies the Academy baseline to every route', async () => {
    const headers = await globalHeaders()

    expect(Object.fromEntries(headers)).toMatchObject({
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      'X-DNS-Prefetch-Control': 'off',
    })
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false)
  })

  it('enforces the exact approved CSP directives', async () => {
    const headers = await globalHeaders()
    expect(headers.has('Content-Security-Policy')).toBe(false)
    const policy = ACADEMY_EDGE_SECURITY_HEADERS['Content-Security-Policy']

    expect(policy).toBeDefined()
    const directives = policy!.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ')
      return [name, sources] as const
    })
    const names = directives.map(([name]) => name)

    expect(directives).toEqual(EXPECTED_CSP)
    expect(new Set(names).size).toBe(names.length)

    const sources = directives.flatMap(([, values]) => values)
    expect(sources).not.toContain('*')
    expect(sources).not.toContain("'unsafe-eval'")
    expect(sources).not.toContain('http:')
    expect(sources).not.toContain('https:')
    expect(sources).not.toContain('ws:')
    expect(sources).not.toContain('wss:')
  })

  it('contains no duplicate or newline-bearing header values', async () => {
    const rules = await nextConfig.headers!()
    const headers = rules.find((rule) => rule.source === '/:path*')!.headers

    expect(new Set(headers.map(({ key }) => key)).size).toBe(headers.length)
    for (const { key, value } of headers) {
      expect(key).not.toMatch(/[\r\n]/u)
      expect(value).not.toMatch(/[\r\n]/u)
    }
  })
})

describe('development HTTP CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('permits framework development evaluation only in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { default: developmentConfig } = await import('../../next.config')
    const rules = await developmentConfig.headers!()
    const fullPolicy = rules[0].headers.find(({ key }) => key === 'Content-Security-Policy')!.value
    const scriptPolicy = fullPolicy.split('; ').find((directive) => directive.startsWith('script-src'))!

    expect(scriptPolicy).toBe("script-src 'self' 'unsafe-eval'")
  })
})
