export const EDGE_RATE_LIMIT_MARKER_HEADER = 'x-cyberskills-edge-rate-limit'
export const EDGE_RATE_LIMIT_MARKER_VERSION = 'v2'

export type EdgeRateLimitOperation =
  | 'leads'
  | 'unsubscribe'
  | 'otp'
  | 'verify'
  | 'identity-start-get'
  | 'identity-start-post'
  | 'identity-callback-get'

export interface EdgeRateLimitRule {
  operation: EdgeRateLimitOperation
  limit: number
  windowMs: number
}

const WINDOW_MS = 60_000
const LIMIT = 10
const MARKER_MAX_AGE_MS = 120_000
const MARKER_FUTURE_SKEW_MS = 30_000

const rules = new Map([
  ['POST:/api/leads', { operation: 'leads' as const, limit: LIMIT, windowMs: WINDOW_MS }],
  ['POST:/api/leads/unsubscribe', {
    operation: 'unsubscribe' as const,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/auth/otp', { operation: 'otp' as const, limit: LIMIT, windowMs: WINDOW_MS }],
  ['POST:/api/auth/verify', { operation: 'verify' as const, limit: LIMIT, windowMs: WINDOW_MS }],
  ['GET:/api/auth/identity/start', {
    operation: 'identity-start-get' as const,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/auth/identity/start', {
    operation: 'identity-start-post' as const,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['GET:/auth/callback', {
    operation: 'identity-callback-get' as const,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
])

export function edgeRateLimitRule(request: Request): EdgeRateLimitRule | null {
  const { pathname } = new URL(request.url)
  return rules.get(`${request.method}:${pathname}`) ?? null
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

interface EdgeRateLimitMarkerOptions {
  secret?: string | null
  now?: () => number
}

async function hmac(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

function markerPayload(request: Request, timestampMs: number): string {
  const pathname = new URL(request.url).pathname
  return `academy-edge-rate-limit:${EDGE_RATE_LIMIT_MARKER_VERSION}:${request.method}:${pathname}:${timestampMs}`
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hasEdgeRateLimitMarker(
  request: Request,
  { secret, now = Date.now }: EdgeRateLimitMarkerOptions = {},
): Promise<boolean> {
  if (!secret) return false
  const marker = request.headers.get(EDGE_RATE_LIMIT_MARKER_HEADER)
  const parts = marker?.split(':') ?? []
  if (parts.length !== 3 || parts[0] !== EDGE_RATE_LIMIT_MARKER_VERSION) return false

  const timestampMs = Number(parts[1])
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) return false
  const ageMs = now() - timestampMs
  if (ageMs > MARKER_MAX_AGE_MS || ageMs < -MARKER_FUTURE_SKEW_MS) return false

  const expected = await hmac(secret, markerPayload(request, timestampMs))
  return constantTimeStringEqual(parts[2], expected)
}

export async function withEdgeRateLimitMarker(
  request: Request,
  { secret, now = Date.now }: Required<Pick<EdgeRateLimitMarkerOptions, 'secret'>> & Pick<EdgeRateLimitMarkerOptions, 'now'>,
): Promise<Request> {
  if (!secret) throw new Error('edge rate-limit marker secret is required')
  const timestampMs = Math.trunc(now())
  const headers = new Headers(request.headers)
  headers.delete(EDGE_RATE_LIMIT_MARKER_HEADER)
  headers.set(
    EDGE_RATE_LIMIT_MARKER_HEADER,
    `${EDGE_RATE_LIMIT_MARKER_VERSION}:${timestampMs}:${await hmac(secret, markerPayload(request, timestampMs))}`,
  )
  return new Request(request, { headers })
}
