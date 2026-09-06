export const EDGE_RATE_LIMIT_MARKER_HEADER = 'x-cyberskills-edge-rate-limit'
export const EDGE_RATE_LIMIT_MARKER_VERSION = 'v2'

export type EdgeRateLimitScope = 'actor' | 'target' | 'global'

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
  globalLimit?: number
  targetField?: 'email' | 'token'
  targetLimit?: number
}

const WINDOW_MS = 60_000
const LIMIT = 10
const MARKER_MAX_AGE_MS = 120_000
const MARKER_FUTURE_SKEW_MS = 30_000

const rules = new Map([
  ['POST:/api/leads', {
    operation: 'leads' as const,
    globalLimit: 300,
    limit: LIMIT,
    targetField: 'email' as const,
    targetLimit: 5,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/leads/unsubscribe', {
    operation: 'unsubscribe' as const,
    globalLimit: 300,
    limit: LIMIT,
    targetField: 'token' as const,
    targetLimit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/auth/otp', {
    operation: 'otp' as const,
    globalLimit: 300,
    limit: LIMIT,
    targetField: 'email' as const,
    targetLimit: 5,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/auth/verify', {
    operation: 'verify' as const,
    globalLimit: 600,
    limit: LIMIT,
    targetField: 'email' as const,
    targetLimit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['GET:/api/auth/identity/start', {
    operation: 'identity-start-get' as const,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['POST:/api/auth/identity/start', {
    operation: 'identity-start-post' as const,
    globalLimit: 600,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
  ['GET:/auth/callback', {
    operation: 'identity-callback-get' as const,
    globalLimit: 600,
    limit: LIMIT,
    windowMs: WINDOW_MS,
  }],
])

export type EdgeRateLimitAdmission =
  | { kind: 'public' }
  | { kind: 'protected'; rule: EdgeRateLimitRule }
  | { kind: 'invalid' }

function canonicalAdmission(request: Request): EdgeRateLimitAdmission {
  let pathname: string
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return { kind: 'invalid' }
  }

  if (
    pathname.includes('\\')
    || pathname.includes('//')
    || /[\u0000-\u001f\u007f]/.test(pathname)
  ) return { kind: 'invalid' }
  const segments = pathname.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) return { kind: 'invalid' }

  const canonicalPath = canonicalTrailingSlash(pathname)
  const rule = rules.get(`${request.method}:${canonicalPath}`)
  if (rule) return { kind: 'protected', rule }

  if (pathname.includes('%')) {
    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(pathname)
    } catch {
      return { kind: 'invalid' }
    }
    const canonicalDecodedPath = canonicalTrailingSlash(decodedPath)
    const decodedSegments = decodedPath.split('/')
    if (
      decodedPath.includes('%')
      || decodedPath.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(decodedPath)
      || decodedSegments.some((segment) => segment === '.' || segment === '..')
      || rules.has(`${request.method}:${canonicalDecodedPath}`)
    ) return { kind: 'invalid' }
  }

  return { kind: 'public' }
}

function canonicalTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export function edgeRateLimitAdmission(request: Request): EdgeRateLimitAdmission {
  return canonicalAdmission(request)
}

export function edgeRateLimitRule(request: Request): EdgeRateLimitRule | null {
  const admission = canonicalAdmission(request)
  return admission.kind === 'protected' ? admission.rule : null
}

// At the outer Worker, only this header is set by Cloudflare. Do not treat XFF
// as an actor identity there: callers can supply it themselves.
export function edgeClientAddress(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')?.trim() || null
}

function ipv6ActorGroups(value: string): readonly number[] | null {
  if (value.length === 0 || value.length > 45 || value.includes('%')) return null

  let remainder = value.toLowerCase()
  if (remainder.includes('.')) {
    const lastColon = remainder.lastIndexOf(':')
    const ipv4 = lastColon === -1 ? '' : remainder.slice(lastColon + 1)
    const octets = ipv4.split('.')
    if (octets.length !== 4) return null
    const bytes: number[] = []
    for (const octet of octets) {
      if (!/^\d{1,3}$/.test(octet)) return null
      const byte = Number(octet)
      if (byte > 255) return null
      bytes.push(byte)
    }
    remainder = `${remainder.slice(0, lastColon)}:${(bytes[0]! << 8 | bytes[1]!).toString(16)}:${(bytes[2]! << 8 | bytes[3]!).toString(16)}`
  }

  const halves = remainder.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (left.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
    || right.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  if (halves.length === 1 && left.length !== 8) return null
  if (halves.length === 2 && left.length + right.length > 7) return null
  const missing = 8 - left.length - right.length
  const groups: string[] = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (groups.length !== 8) return null
  return groups.map((group) => Number.parseInt(group, 16) as number)
}

function actorAddressBytes(clientAddress: string): Uint8Array | null {
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(clientAddress)
  if (mappedIpv4) return actorAddressBytes(mappedIpv4[1]!)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clientAddress)) {
    const valid = clientAddress.split('.').every((octet) => {
      if (!/^\d{1,3}$/.test(octet)) return false
      const value = Number(octet)
      return value <= 255
    })
    return valid ? new TextEncoder().encode(clientAddress) : null
  }

  const groups = ipv6ActorGroups(clientAddress)
  if (!groups) return null
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 4; index += 1) {
    const group = groups[index]!
    bytes[index * 2] = group >> 8
    bytes[index * 2 + 1] = group & 0xff
  }
  return bytes
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
}): Promise<string | null> {
  const actorBytes = actorAddressBytes(clientAddress)
  if (!actorBytes) return null
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const domain = encoder.encode(`academy-actor:${operation}:`)
  const identity = new Uint8Array(domain.length + actorBytes.length)
  identity.set(domain)
  identity.set(actorBytes, domain.length)
  const signature = await crypto.subtle.sign('HMAC', key, identity)
  return `v1:${operation}:${base64Url(signature)}`
}

export async function edgeRateLimitTargetObjectName({
  operation,
  target,
  secret,
}: {
  operation: EdgeRateLimitOperation
  target: string
  secret: string
}): Promise<string | null> {
  const normalizedTarget = target.trim().toLowerCase()
  if (!normalizedTarget || normalizedTarget.length > 320) return null
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`academy-target:${operation}:${normalizedTarget}`),
  )
  return `v1:target:${operation}:${base64Url(signature)}`
}

export async function edgeRateLimitGlobalObjectName({
  operation,
  secret,
}: {
  operation: EdgeRateLimitOperation
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
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`academy-global:${operation}`),
  )
  return `v1:global:${operation}:${base64Url(signature)}`
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
