import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

const EXPECTED_REPORT_ONLY_CSP = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['object-src', ["'none'"]],
  ['script-src', ["'self'", "'unsafe-inline'"]],
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
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      'X-DNS-Prefetch-Control': 'off',
    })
    expect(headers.has('Content-Security-Policy')).toBe(false)
  })

  it('declares the exact approved CSP directives for report-only observation', async () => {
    const headers = await globalHeaders()
    const policy = headers.get('Content-Security-Policy-Report-Only')

    expect(policy).toBeDefined()
    const directives = policy!.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ')
      return [name, sources] as const
    })
    const names = directives.map(([name]) => name)

    expect(directives).toEqual(EXPECTED_REPORT_ONLY_CSP)
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
