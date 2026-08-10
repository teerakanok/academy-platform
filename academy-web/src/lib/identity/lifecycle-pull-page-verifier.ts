import {
  verifyIdentityLifecycleEnvelope,
  type IdentityLifecycleEnvelopeVerificationPolicy,
  type IdentityLifecycleEvent,
} from './lifecycle-envelope-verifier'
import type { VerifiedIdentityLifecyclePage } from './lifecycle-page-store'

const PAGE_KEYS = ['configRevision', 'envelopes', 'nextCursor'] as const
const OPTIONS_KEYS = [
  'envelopePolicy',
  'requestedCursor',
  'requestedLimit',
  'verificationTime',
] as const
const POLICY_KEYS = [
  'clockSkewSeconds',
  'expectedAudience',
  'expectedIssuer',
  'key',
  'maximumLifetimeSeconds',
] as const
const KEY_KEYS = ['algorithm', 'keyId', 'publicJwk'] as const
const CURSOR_KEYS = ['sequence'] as const
const PUBLIC_JWK_KEYS = ['crv', 'key_ops', 'kty', 'use', 'x', 'y'] as const
const PUBLIC_JWK_REQUIRED_KEYS = ['crv', 'kty', 'x', 'y'] as const
const MAX_PAGE_ENVELOPES = 100
const MAX_CURSOR = BigInt('9223372036854775807')
const COMPACT_JWS_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export type IdentityLifecyclePullPageEnvelopePolicy = Omit<
  IdentityLifecycleEnvelopeVerificationPolicy,
  'verificationTime'
>

export type IdentityLifecyclePullPageVerificationOptions = {
  requestedCursor: string | null
  requestedLimit: number
  verificationTime: Date
  envelopePolicy: IdentityLifecyclePullPageEnvelopePolicy
}

export async function verifyIdentityLifecyclePullPage(
  pageValue: unknown,
  optionsValue: IdentityLifecyclePullPageVerificationOptions,
): Promise<VerifiedIdentityLifecyclePage | null> {
  try {
    const page = snapshotExactDataProperties(pageValue, PAGE_KEYS)
    const options = snapshotExactDataProperties(optionsValue, OPTIONS_KEYS)
    if (!page || !options) return null

    const requestedCursor = parseNullableCursor(options.requestedCursor)
    if (requestedCursor === undefined
      || !Number.isSafeInteger(options.requestedLimit)
      || (options.requestedLimit as number) < 1
      || (options.requestedLimit as number) > MAX_PAGE_ENVELOPES) {
      return null
    }

    const verificationTime = cloneValidDate(options.verificationTime)
    if (!verificationTime) return null
    const envelopePolicy = parseEnvelopePolicy(options.envelopePolicy, verificationTime)
    if (!envelopePolicy) return null

    const envelopes = snapshotDenseArray(page.envelopes, MAX_PAGE_ENVELOPES)
    if (!envelopes || envelopes.length > (options.requestedLimit as number)) return null
    if (!Number.isSafeInteger(page.configRevision) || (page.configRevision as number) < 1) {
      return null
    }

    const nextCursor = parseWireCursor(page.nextCursor)
    if (nextCursor === undefined) return null
    const expectedCursor = expectedNextCursor(requestedCursor, envelopes.length)
    if (expectedCursor === undefined || nextCursor !== expectedCursor) return null

    const events: IdentityLifecycleEvent[] = []
    for (const envelope of envelopes) {
      if (!isCompactJws(envelope)) return null
      const event = await verifyIdentityLifecycleEnvelope(envelope, envelopePolicy)
      if (!event) return null
      events.push(event)
    }

    return {
      nextCursor,
      configRevision: page.configRevision as number,
      events,
    }
  } catch {
    return null
  }
}

function parseEnvelopePolicy(
  value: unknown,
  verificationTime: Date,
): IdentityLifecycleEnvelopeVerificationPolicy | null {
  const policy = snapshotExactDataProperties(value, POLICY_KEYS)
  if (!policy
    || typeof policy.expectedIssuer !== 'string'
    || !isExactHttpsUrl(policy.expectedIssuer)
    || typeof policy.expectedAudience !== 'string'
    || !isExactHttpsUrl(policy.expectedAudience)
    || !Number.isSafeInteger(policy.clockSkewSeconds)
    || (policy.clockSkewSeconds as number) < 0
    || (policy.clockSkewSeconds as number) > 120
    || !Number.isSafeInteger(policy.maximumLifetimeSeconds)
    || (policy.maximumLifetimeSeconds as number) < 30
    || (policy.maximumLifetimeSeconds as number) > 300) {
    return null
  }

  const key = snapshotExactDataProperties(policy.key, KEY_KEYS)
  if (!key
    || typeof key.keyId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(key.keyId)
    || key.algorithm !== 'ES256') {
    return null
  }
  const publicJwk = parsePublicJwk(key.publicJwk)
  if (!publicJwk) return null

  return {
    expectedIssuer: policy.expectedIssuer,
    expectedAudience: policy.expectedAudience,
    verificationTime,
    clockSkewSeconds: policy.clockSkewSeconds as number,
    maximumLifetimeSeconds: policy.maximumLifetimeSeconds as number,
    key: {
      keyId: key.keyId,
      algorithm: key.algorithm,
      publicJwk,
    },
  }
}

function parsePublicJwk(value: unknown): JsonWebKey | null {
  const jwk = snapshotAllowedDataProperties(
    value,
    PUBLIC_JWK_KEYS,
    PUBLIC_JWK_REQUIRED_KEYS,
  )
  if (!jwk
    || jwk.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || typeof jwk.x !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)
    || typeof jwk.y !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y)
    || (jwk.use !== undefined && jwk.use !== 'sig')) {
    return null
  }

  let keyOps: string[] | undefined
  if (jwk.key_ops !== undefined) {
    const values = snapshotDenseArray(jwk.key_ops, 1)
    if (!values || values.length !== 1 || values[0] !== 'verify') return null
    keyOps = ['verify']
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
    ...(jwk.use === undefined ? {} : { use: 'sig' }),
    ...(keyOps === undefined ? {} : { key_ops: keyOps }),
  }
}

function expectedNextCursor(
  requestedCursor: string | null,
  envelopeCount: number,
): string | null | undefined {
  if (envelopeCount === 0) return requestedCursor
  const next = BigInt(requestedCursor ?? '0') + BigInt(envelopeCount)
  return next > MAX_CURSOR ? undefined : next.toString()
}

function parseWireCursor(value: unknown): string | null | undefined {
  if (value === null) return null
  const cursor = snapshotExactDataProperties(value, CURSOR_KEYS)
  return cursor ? parseNullableCursor(cursor.sequence) : undefined
}

function parseNullableCursor(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string'
    || !/^(?:0|[1-9][0-9]{0,18})$/.test(value)
    || BigInt(value) > MAX_CURSOR) {
    return undefined
  }
  return value
}

function isCompactJws(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 32
    && value.length <= 4_096
    && COMPACT_JWS_PATTERN.test(value)
}

function cloneValidDate(value: unknown): Date | null {
  if (!(value instanceof Date)) return null
  try {
    const milliseconds = Date.prototype.getTime.call(value)
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null
  } catch {
    return null
  }
}

function snapshotDenseArray(value: unknown, maximum: number): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor
    || !('value' in lengthDescriptor)
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum) {
    return null
  }

  const keys = Reflect.ownKeys(value)
  if (keys.length !== lengthDescriptor.value + 1 || !keys.includes('length')) return null

  const result: unknown[] = []
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const key = String(index)
    if (!keys.includes(key)) return null
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    result.push(descriptor.value)
  }
  return result
}

function snapshotExactDataProperties<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== 'string'
      || !expectedKeys.includes(key as Keys[number]))) {
    return null
  }

  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true })
  }
  return snapshot
}

function snapshotAllowedDataProperties(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))
    || requiredKeys.some((key) => !keys.includes(key))) {
    return null
  }

  const snapshot = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true })
  }
  return snapshot
}

function isExactHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.toString() === value
  } catch {
    return false
  }
}
