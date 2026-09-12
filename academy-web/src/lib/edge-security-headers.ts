import { ACADEMY_SSO_ORIGIN } from './auth/sso-signout-policy'

export const ACADEMY_EDGE_SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "report-uri /api/security/csp-report",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self' ${ACADEMY_SSO_ORIGIN}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'X-DNS-Prefetch-Control': 'off',
} as const

export function withEdgeSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  const pagePolicy = headers.get('Content-Security-Policy')
  const pageScriptPolicy = pagePolicy
    ?.split(';')
    .find((directive) => directive.trim().startsWith('script-src'))
    ?.trim()
  const preservesNoncePolicy = Boolean(
    pageScriptPolicy
    && pageScriptPolicy.includes("'nonce-")
    && pageScriptPolicy.includes("'strict-dynamic'")
    && !pageScriptPolicy.includes("'unsafe-inline'")
    && !pageScriptPolicy.includes("'unsafe-eval'"),
  )

  const fallbackPolicy = directives(ACADEMY_EDGE_SECURITY_HEADERS['Content-Security-Policy'])
  if (preservesNoncePolicy && pagePolicy) {
    const pageDirectives = directives(pagePolicy)
    if (pageDirectives) {
      const merged = new Map(fallbackPolicy)
      for (const [name, value] of pageDirectives) merged.set(name, value)
      merged.set('base-uri', "'none'")
      merged.set('report-uri', '/api/security/csp-report')
      headers.set('Content-Security-Policy', [...merged].map(([name, value]) => `${name} ${value}`).join('; '))
    } else {
      headers.set('Content-Security-Policy', ACADEMY_EDGE_SECURITY_HEADERS['Content-Security-Policy'])
    }
  } else {
    headers.set('Content-Security-Policy', ACADEMY_EDGE_SECURITY_HEADERS['Content-Security-Policy'])
  }
  for (const [key, value] of Object.entries(ACADEMY_EDGE_SECURITY_HEADERS)) {
    if (key !== 'Content-Security-Policy') headers.set(key, value)
  }
  if (preservesNoncePolicy && headers.get('content-type')?.includes('text/html')) {
    headers.set('Cache-Control', 'private, no-store')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function directives(policy: string): Map<string, string> | null {
  const merged = new Map<string, string>()
  for (const directive of policy.split(';')) {
    const trimmed = directive.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(' ')
    const name = separator === -1 ? trimmed : trimmed.slice(0, separator)
    const value = separator === -1 ? '' : trimmed.slice(separator + 1).trim()
    if (!/^[a-z-]+$/u.test(name) || merged.has(name)) return null
    merged.set(name, value)
  }
  return merged
}
