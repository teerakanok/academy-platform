export const EDGE_RATE_LIMIT_MARKER_HEADER = 'x-cyberskills-edge-rate-limit'
export const EDGE_RATE_LIMIT_MARKER = 'v1'

export type EdgeRateLimitOperation = 'leads' | 'unsubscribe' | 'otp' | 'verify'

export interface EdgeRateLimitRule {
  operation: EdgeRateLimitOperation
  limit: number
  windowMs: number
}

const WINDOW_MS = 60_000
const LIMIT = 10

const rules: Record<string, EdgeRateLimitRule> = {
  '/api/leads': { operation: 'leads', limit: LIMIT, windowMs: WINDOW_MS },
  '/api/leads/unsubscribe': { operation: 'unsubscribe', limit: LIMIT, windowMs: WINDOW_MS },
  '/api/auth/otp': { operation: 'otp', limit: LIMIT, windowMs: WINDOW_MS },
  '/api/auth/verify': { operation: 'verify', limit: LIMIT, windowMs: WINDOW_MS },
}

export function edgeRateLimitRule(request: Request): EdgeRateLimitRule | null {
  if (request.method !== 'POST') return null
  return rules[new URL(request.url).pathname] ?? null
}

// At the outer Worker, only this header is set by Cloudflare. Do not treat XFF
// as an actor identity there: callers can supply it themselves.
export function edgeClientAddress(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')?.trim() || null
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function edgeRateLimitObjectName({
  operation,
  clientAddress,
  secret,
}: {
  operation: EdgeRateLimitOperation
  clientAddress: string
  secret: string
}): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`academy:${operation}:${clientAddress}`))
  return `v1:${operation}:${base64Url(signature)}`
}

export function hasEdgeRateLimitMarker(headers: Headers): boolean {
  return headers.get(EDGE_RATE_LIMIT_MARKER_HEADER) === EDGE_RATE_LIMIT_MARKER
}

export function withEdgeRateLimitMarker(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete(EDGE_RATE_LIMIT_MARKER_HEADER)
  headers.set(EDGE_RATE_LIMIT_MARKER_HEADER, EDGE_RATE_LIMIT_MARKER)
  return new Request(request, { headers })
}
