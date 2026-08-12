import {
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from './lifecycle-principal'

const HEADER_KEYS = ['alg', 'kid', 'typ']
const CLAIM_KEYS = ['aud', 'event', 'exp', 'iat', 'iss', 'jti']
const EVENT_KEYS = ['eventId', 'issuer', 'kind', 'occurredAt', 'reason', 'revision', 'state', 'subject']
const PUBLISHED_REASON_CODES = ['account_active', 'account_deleted', 'account_disabled']

export type IdentityLifecycleEvent = {
  eventId: string
  kind: 'account.lifecycle.changed'
  issuer: string
  subject: string
  state: 'active' | 'disabled' | 'deleted'
  revision: number
  occurredAt: string
  reason: 'account_active' | 'account_deleted' | 'account_disabled'
}

export type IdentityLifecycleEnvelopeVerificationPolicy = {
  expectedIssuer: string
  expectedAudience: string
  verificationTime: Date
  clockSkewSeconds: number
  maximumLifetimeSeconds: number
  key: {
    keyId: string
    algorithm: string
    publicJwk: JsonWebKey
  }
}

type ParsedEnvelope = {
  event: IdentityLifecycleEvent
  signingInput: Uint8Array
  signature: Uint8Array
}

export async function verifyIdentityLifecycleEnvelope(
  envelope: string,
  policy: IdentityLifecycleEnvelopeVerificationPolicy,
): Promise<IdentityLifecycleEvent | null> {
  try {
    if (!isVerificationPolicy(policy)) return null
    const parsed = parseEnvelope(envelope, policy)
    if (!parsed) return null

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      policy.key.publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      toArrayBuffer(parsed.signature),
      toArrayBuffer(parsed.signingInput),
    )
    return verified ? structuredClone(parsed.event) : null
  } catch {
    return null
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function parseEnvelope(
  envelope: string,
  policy: IdentityLifecycleEnvelopeVerificationPolicy,
): ParsedEnvelope | null {
  if (typeof envelope !== 'string' || envelope.length < 1 || envelope.length > 32_768) return null
  const parts = envelope.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string]
  const header = decodeJsonObject(encodedHeader, 512)
  const claims = decodeJsonObject(encodedClaims, 16_384)
  const signature = decodeBase64Url(encodedSignature, 96)
  if (!header || !claims || !signature) return null

  if (!hasExactKeys(header, HEADER_KEYS)
    || !hasExactKeys(claims, CLAIM_KEYS)
    || header.alg !== 'ES256'
    || header.typ !== 'identity-event+jwt'
    || header.kid !== policy.key.keyId
    || claims.iss !== policy.expectedIssuer
    || claims.aud !== policy.expectedAudience
    || typeof claims.jti !== 'string'
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp)
    || !isIdentityLifecycleEvent(claims.event)
    || claims.jti !== claims.event.eventId
    || signature.byteLength !== 64) {
    return null
  }

  const issuedAt = claims.iat as number
  const expiresAt = claims.exp as number
  const now = Math.floor(policy.verificationTime.getTime() / 1_000)
  if (expiresAt <= now
    || issuedAt > now + policy.clockSkewSeconds
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > policy.maximumLifetimeSeconds) {
    return null
  }

  return {
    event: claims.event,
    signingInput: new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    signature,
  }
}

function isVerificationPolicy(policy: IdentityLifecycleEnvelopeVerificationPolicy): boolean {
  return isExactHttpsUrl(policy.expectedIssuer)
    && isExactHttpsUrl(policy.expectedAudience)
    && policy.verificationTime instanceof Date
    && Number.isFinite(policy.verificationTime.getTime())
    && Number.isSafeInteger(policy.clockSkewSeconds)
    && policy.clockSkewSeconds >= 0
    && policy.clockSkewSeconds <= 120
    && Number.isSafeInteger(policy.maximumLifetimeSeconds)
    && policy.maximumLifetimeSeconds >= 30
    && policy.maximumLifetimeSeconds <= 300
    && isKeyId(policy.key.keyId)
    && policy.key.algorithm === 'ES256'
    && isP256PublicJwk(policy.key.publicJwk)
}

function isIdentityLifecycleEvent(value: unknown): value is IdentityLifecycleEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Record<string, unknown>
  return hasExactKeys(event, EVENT_KEYS)
    && typeof event.eventId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId)
    && event.kind === 'account.lifecycle.changed'
    && typeof event.issuer === 'string'
    && isCanonicalIdentityLifecyclePrincipalIssuer(event.issuer)
    && isWellFormedIdentityLifecycleSubject(event.subject)
    && ['active', 'disabled', 'deleted'].includes(event.state as string)
    && Number.isSafeInteger(event.revision)
    && (event.revision as number) >= 1
    && typeof event.occurredAt === 'string'
    && isExactTimestamp(event.occurredAt)
    && typeof event.reason === 'string'
    && PUBLISHED_REASON_CODES.includes(event.reason)
}

function isP256PublicJwk(value: JsonWebKey): boolean {
  const allowedKeys = ['crv', 'key_ops', 'kty', 'use', 'x', 'y']
  return Object.keys(value).every((key) => allowedKeys.includes(key))
    && value.kty === 'EC'
    && value.crv === 'P-256'
    && typeof value.x === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(value.x)
    && typeof value.y === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(value.y)
    && value.d === undefined
    && (value.use === undefined || value.use === 'sig')
    && (value.key_ops === undefined
      || (Array.isArray(value.key_ops) && value.key_ops.length === 1 && value.key_ops[0] === 'verify'))
}

function decodeJsonObject(encoded: string, maxBytes: number): Record<string, unknown> | null {
  try {
    const decoded = decodeBase64Url(encoded, maxBytes)
    if (!decoded) return null
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function decodeBase64Url(encoded: string, maxBytes: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(`${base64}${padding}`)
    if (binary.length < 1 || binary.length > maxBytes) return null
    const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return encodeBase64Url(decoded) === encoded ? decoded : null
  } catch {
    return null
  }
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function isExactTimestamp(value: string): boolean {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function isKeyId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(value)
}

function isExactHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.toString() === value
  } catch {
    return false
  }
}
