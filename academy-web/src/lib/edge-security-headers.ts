export const ACADEMY_EDGE_SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
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

  for (const [key, value] of Object.entries(ACADEMY_EDGE_SECURITY_HEADERS)) {
    if (key !== 'Content-Security-Policy' || !preservesNoncePolicy) headers.set(key, value)
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
