import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/(site)/api/security/csp-report/route'
import {
  academyContentSecurityPolicy,
} from '@/lib/content-security-policy'
import {
  ACADEMY_EDGE_SECURITY_HEADERS,
  withEdgeSecurityHeaders,
} from '@/lib/edge-security-headers'
import { enforceEdgeRateLimit } from '@/lib/edge-rate-limit-enforcement'
import {
  edgeRateLimitAdmission,
  withEdgeRateLimitMarker,
} from '@/lib/edge-rate-limit-policy'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'
import nextConfig from '../../next.config'

const ORIGIN = 'https://academy.tests.example'
const SECRET = 'csp-report-test-secret-32-bytes-long'

function reportRequest(body: BodyInit, headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({ 'cf-connecting-ip': '203.0.113.10' })
  for (const [key, value] of new Headers(headers)) requestHeaders.set(key, value)
  return new Request(`${ORIGIN}/api/security/csp-report`, {
    method: 'POST',
    body,
    headers: requestHeaders,
    ...(body instanceof ReadableStream ? { duplex: 'half' as const } : {}),
  })
}

async function admitted(request: Request, now?: () => number): Promise<Request> {
  return withEdgeRateLimitMarker(request, { secret: SECRET, now })
}

function legacyBody(directive = 'script-src-elem') {
  return JSON.stringify({
    'csp-report': {
      'document-uri': `${ORIGIN}/auth/callback?code=SECRET-CODE&state=SECRET-STATE`,
      'violated-directive': directive,
      'effective-directive': directive,
      'blocked-uri': 'https://attacker.example/callback?token=SECRET-TOKEN',
      'script-sample': 'SECRET-SAMPLE',
    },
  })
}

function reportingBody() {
  return JSON.stringify([{
    type: 'csp-violation',
    age: 1,
    url: `${ORIGIN}/dashboard?user=SECRET-USER`,
    user_agent: 'SECRET-AGENT',
    body: {
      documentURL: `${ORIGIN}/courses?user=SECRET-USER`,
      effectiveDirective: 'style-src-elem',
      sample: 'SECRET-SAMPLE',
    },
  }])
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CSP report endpoint', () => {
  it('accepts a bounded legacy browser report without echoing or logging sensitive fields', async () => {
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', SECRET)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(await admitted(reportRequest(legacyBody(), {
      'content-type': 'application/csp-report',
      origin: ORIGIN,
    })))

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(log).toHaveBeenCalledTimes(1)
    const emitted = log.mock.calls[0]![0]
    expect(emitted).toBe(JSON.stringify({
      event: 'csp_report_accepted',
      report_count: 1,
      directive_categories: ['script'],
    }))
    expect(emitted).not.toContain('SECRET')
    expect(emitted).not.toContain('attacker.example')
  })

  it('accepts the modern Reporting API shape and summarizes only count and category', async () => {
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', SECRET)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(await admitted(reportRequest(reportingBody(), {
      'content-type': 'application/reports+json',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-dest': 'report',
    })))

    expect(response.status).toBe(204)
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: 'csp_report_accepted',
      report_count: 1,
      directive_categories: ['style'],
    }))
  })

  it('streams to an 8 KiB ceiling and returns a generic 413', async () => {
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', SECRET)
    const first = 'x'.repeat(8193)
    const response = await POST(await admitted(reportRequest(first, {
      'content-type': 'application/csp-report',
    })))
    expect(response.status).toBe(413)

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8192))
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    })
    const streamed = await POST(await admitted(reportRequest(stream, {
      'content-type': 'application/reports+json',
    })))
    expect(streamed.status).toBe(413)
  })

  it.each([
    ['bad type', reportRequest(legacyBody(), { 'content-type': 'application/json' }), 415],
    ['bad shape', reportRequest(JSON.stringify({ other: true }), { 'content-type': 'application/csp-report' }), 400],
    ['too many modern reports', reportRequest(JSON.stringify(Array.from({ length: 21 }, () => ({
      type: 'csp-violation',
      body: { effectiveDirective: 'script-src-elem' },
    }))), { 'content-type': 'application/reports+json' }), 400],
    ['unrecognized modern report type', reportRequest(JSON.stringify([{
      type: 'network-error',
      body: { effectiveDirective: 'script-src-elem' },
    }]), { 'content-type': 'application/reports+json' }), 400],
    ['cross-origin', reportRequest(legacyBody(), {
      'content-type': 'application/csp-report',
      origin: 'https://attacker.example',
    }), 403],
    ['cross-site metadata', reportRequest(legacyBody(), {
      'content-type': 'application/csp-report',
      'sec-fetch-site': 'cross-site',
    }), 403],
    ['wrong fetch mode', reportRequest(legacyBody(), {
      'content-type': 'application/csp-report',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    }), 403],
  ])('rejects %s without a body or sensitive logging', async (_name, request, status) => {
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', SECRET)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(await admitted(request as Request))

    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(log).not.toHaveBeenCalled()
  })

  it('fails closed when the outer rate-limit marker is absent or invalid', async () => {
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', SECRET)
    const request = reportRequest(legacyBody(), { 'content-type': 'application/csp-report' })
    await expect(POST(request)).resolves.toMatchObject({ status: 403 })

    vi.stubEnv('RATE_LIMIT_KEY_SECRET', 'different-secret')
    await expect(POST(await admitted(request))).resolves.toMatchObject({ status: 403 })
  })
})

describe('CSP reporting admission and quota', () => {
  it('protects only the exact report method and uses actor plus global DO checks', async () => {
    const protectedRule = edgeRateLimitAdmission(reportRequest('x'))
    expect(protectedRule).toMatchObject({
      kind: 'protected',
      rule: { operation: 'csp-report', limit: 20, globalLimit: 300 },
    })
    expect(edgeRateLimitAdmission(new Request(`${ORIGIN}/api/security/csp-report`, { method: 'GET' }))).toEqual({ kind: 'public' })

    const calls: string[] = []
    const namespace = {
      getByName(name: string) {
        calls.push(name)
        return {
          async check() {
            return { allowed: true, retryAfterSeconds: 0 }
          },
        }
      },
    }
    const admittedRequest = await enforceEdgeRateLimit(reportRequest('x'), {
      EDGE_RATE_LIMITER: namespace,
      RATE_LIMIT_KEY_SECRET: SECRET,
    })
    expect(admittedRequest).toBeInstanceOf(Request)
    expect(calls.length).toBe(2)
    expect(calls.some((name) => name.startsWith('v1:global:csp-report:'))).toBe(true)
    expect(calls.some((name) => name.startsWith(`v1:csp-report:`))).toBe(true)
  })

  it('stops at both quota actors before parsing and preserves the generic 429 response', async () => {
    const namespace = {
      getByName(name: string) {
        return {
          async check() {
            return { allowed: !name.startsWith('v1:global:'), retryAfterSeconds: 17 }
          },
        }
      },
    }
    const response = await enforceEdgeRateLimit(reportRequest('raw-sentinel'), {
      EDGE_RATE_LIMITER: namespace,
      RATE_LIMIT_KEY_SECRET: SECRET,
    })

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(429)
    expect((response as Response).headers.get('cache-control')).toBe('no-store')
    await expect((response as Response).text()).resolves.not.toContain('raw-sentinel')
  })
})

describe('document isolation and reporting headers', () => {
  it('uses none base URI, local reporting, COOP, nonce preservation, and no duplicates', () => {
    const policy = academyContentSecurityPolicy(
      ["'self'", "'nonce-abc'", "'strict-dynamic'"],
      'abc',
    )
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain('report-uri /api/security/csp-report')
    expect(policy).toContain("style-src 'self' 'nonce-abc'")
    expect(policy).toContain("style-src-attr 'unsafe-inline'")
    expect(policy).not.toContain("style-src 'self' 'unsafe-inline'")

    const noncePolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "script-src 'self' 'nonce-abc' 'strict-dynamic'",
      "style-src 'self' 'nonce-abc'",
      "style-src-attr 'unsafe-inline'",
    ].join('; ')
    const response = withEdgeSecurityHeaders(new Response('<html></html>', {
      headers: { 'content-type': 'text/html', 'content-security-policy': noncePolicy },
    }))
    const finalPolicy = response.headers.get('content-security-policy') ?? ''
    const names = finalPolicy.split(';').map((directive) => directive.trim().split(' ')[0])
    expect(finalPolicy).toContain("base-uri 'none'")
    expect(finalPolicy).toContain('report-uri /api/security/csp-report')
    expect(finalPolicy).toContain("'nonce-abc'")
    expect(finalPolicy).toContain("'strict-dynamic'")
    expect(new Set(names).size).toBe(names.length)
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('rejects a nonce that could add a CSP directive', () => {
    expect(() => academyContentSecurityPolicy(
      ["'self'", "'strict-dynamic'"],
      "abc'; style-src *",
    )).toThrow('Invalid CSP style nonce')
  })

  it('applies COOP through static Next headers and middleware documents', async () => {
    const rules = await nextConfig.headers!()
    const headers = rules.find((rule) => rule.source === '/:path*')!.headers
    expect(headers).toContainEqual({
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin',
    })

    const request = new NextRequest(`${ORIGIN}/sign-in`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    const response = await middleware(request as Parameters<typeof middleware>[0])
    expect(response.headers.get('Content-Security-Policy')).toContain("base-uri 'none'")
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')

    expect(ACADEMY_EDGE_SECURITY_HEADERS['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })

  it('documents full-page auth and browser-origin behavior without popup dependence', () => {
    const documentation = readFileSync(join(process.cwd(), 'docs/security/csp-reporting.md'), 'utf8')
    const application = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8')
    expect(documentation).toContain('Cross-Origin-Opener-Policy: same-origin')
    expect(documentation).toContain('application/reports+json')
    expect(documentation).toContain('fixed')
    expect(application).not.toContain('window.open(')
  })
})
