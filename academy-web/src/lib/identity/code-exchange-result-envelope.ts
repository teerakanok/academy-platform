import { parseStrictJsonText } from '../http/strict-json-response'
import type { ExchangeResult } from './adapter'
import { verifyIdentityCodeExchangeResult } from './code-exchange-result'
import {
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from './lifecycle-principal'

const HEADER_KEYS = ['alg', 'kid', 'typ'] as const
const CLAIM_KEYS = ['aud', 'clientId', 'exp', 'iat', 'iss', 'result'] as const
const KEY_SET_KEYS = ['issuer', 'keys', 'revision'] as const
const KEY_KEYS = ['algorithm', 'keyId', 'publicJwk', 'state'] as const
const JWK_KEYS = ['crv', 'kty', 'x', 'y'] as const
const POLICY_KEYS = [
  'clockSkewSeconds',
  'expectedAudience',
  'expectedClientId',
  'expectedIssuer',
  'expectedNonce',
  'expectedPrincipalIssuer',
  'expectedServiceId',
  'maximumLifetimeSeconds',
  'verificationTime',
] as const
const RESULT_KEY_ID = /^identity-result-[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/
const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
const OPAQUE = /^[A-Za-z0-9_-]{16,160}$/

export type IdentityCodeExchangeResultVerificationKey = {
  keyId: string
  algorithm: 'ES256'
  state: 'active' | 'overlap' | 'retired'
  publicJwk: JsonWebKey
}

export type IdentityCodeExchangeResultVerificationKeySet = {
  issuer: string
  revision: number
  keys: IdentityCodeExchangeResultVerificationKey[]
}

export type IdentityCodeExchangeResultEnvelopePolicy = {
  expectedIssuer: string
  expectedAudience: string
  expectedClientId: string
  expectedNonce: string
  expectedPrincipalIssuer: string
  expectedServiceId: string
  verificationTime: Date
  clockSkewSeconds: number
  maximumLifetimeSeconds: number
}

type VerificationPlan = {
  expectedIssuer: string
  expectedAudience: string
  expectedClientId: string
  expectedNonce: string
  expectedPrincipalIssuer: string
  expectedServiceId: string
  verificationTimeMs: number
  clockSkewSeconds: number
  maximumLifetimeSeconds: number
}

type ParsedEnvelope = {
  keyId: string
  result: ExchangeResult
  signature: Uint8Array
  signingInput: Uint8Array
}

export async function verifyIdentityCodeExchangeResultEnvelope(
  envelopeValue: unknown,
  keySetValue: unknown,
  policyValue: IdentityCodeExchangeResultEnvelopePolicy,
): Promise<ExchangeResult | null> {
  try {
    const policy = parsePolicy(policyValue)
    const keySet = parseKeySet(keySetValue)
    if (!policy || !keySet || keySet.issuer !== policy.expectedIssuer) return null
    const parsed = parseEnvelope(envelopeValue, policy)
    if (!parsed) return null
    const key = keySet.keys.find((candidate) => candidate.keyId === parsed.keyId)
    if (!key || (key.state !== 'active' && key.state !== 'overlap')) return null

    const subtle = crypto.subtle
    const importKey = subtle.importKey
    const verify = subtle.verify
    const publicKey = await Reflect.apply(importKey, subtle, [
      'jwk', key.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    ]) as CryptoKey
    const valid = await Reflect.apply(verify, subtle, [
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      toArrayBuffer(parsed.signature),
      toArrayBuffer(parsed.signingInput),
    ]) as boolean
    return valid ? structuredClone(parsed.result) : null
  } catch {
    return null
  }
}

function parseEnvelope(value: unknown, policy: VerificationPlan): ParsedEnvelope | null {
  if (typeof value !== 'string' || value.length < 32 || value.length > 16_384) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [headerPart, claimsPart, signaturePart] = parts as [string, string, string]
  const header = decodeJsonObject(headerPart, 512, 2)
  const claims = decodeJsonObject(claimsPart, 12_288, 4)
  const signature = decodeBase64Url(signaturePart, 96)
  if (!header || !claims || !signature
    || !hasExactKeys(header, HEADER_KEYS)
    || !hasExactKeys(claims, CLAIM_KEYS)
    || header.alg !== 'ES256'
    || header.typ !== 'identity-code-exchange-result+jwt'
    || typeof header.kid !== 'string'
    || !RESULT_KEY_ID.test(header.kid)
    || claims.iss !== policy.expectedIssuer
    || claims.aud !== policy.expectedAudience
    || claims.clientId !== policy.expectedClientId
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp)
    || signature.byteLength !== 64) return null

  const verifiedResult = verifyIdentityCodeExchangeResult(claims.result, {
    audience: policy.expectedAudience,
    expectedIssuer: policy.expectedPrincipalIssuer,
    nonce: policy.expectedNonce,
    serviceId: policy.expectedServiceId,
  })
  if (!verifiedResult.ok
    || !isCanonicalIdentityLifecyclePrincipalIssuer(verifiedResult.result.issuer)
    || !isWellFormedIdentityLifecycleSubject(verifiedResult.result.subject)) return null

  const now = Math.floor(policy.verificationTimeMs / 1_000)
  const issuedAt = claims.iat as number
  const expiresAt = claims.exp as number
  if (expiresAt <= now
    || issuedAt > now + policy.clockSkewSeconds
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > policy.maximumLifetimeSeconds) return null

  return {
    keyId: header.kid,
    result: verifiedResult.result,
    signature,
    signingInput: new TextEncoder().encode(`${headerPart}.${claimsPart}`),
  }
}

function parsePolicy(value: unknown): VerificationPlan | null {
  const record = snapshotExactRecord(value, POLICY_KEYS)
  if (!record
    || typeof record.expectedIssuer !== 'string' || !isExactHttpsUrl(record.expectedIssuer)
    || typeof record.expectedAudience !== 'string' || !isExactHttpsUrl(record.expectedAudience)
    || typeof record.expectedClientId !== 'string' || !CLIENT_ID.test(record.expectedClientId)
    || typeof record.expectedNonce !== 'string' || !OPAQUE.test(record.expectedNonce)
    || typeof record.expectedPrincipalIssuer !== 'string'
    || !isCanonicalIdentityLifecyclePrincipalIssuer(record.expectedPrincipalIssuer)
    || typeof record.expectedServiceId !== 'string' || !CLIENT_ID.test(record.expectedServiceId)
    || !(record.verificationTime instanceof Date)
    || !Number.isSafeInteger(record.clockSkewSeconds)
    || (record.clockSkewSeconds as number) < 0 || (record.clockSkewSeconds as number) > 60
    || !Number.isSafeInteger(record.maximumLifetimeSeconds)
    || (record.maximumLifetimeSeconds as number) < 30 || (record.maximumLifetimeSeconds as number) > 120) return null
  const verificationTimeMs = Reflect.apply(Date.prototype.getTime, record.verificationTime, []) as number
  if (!Number.isFinite(verificationTimeMs)) return null
  return {
    expectedIssuer: record.expectedIssuer,
    expectedAudience: record.expectedAudience,
    expectedClientId: record.expectedClientId,
    expectedNonce: record.expectedNonce,
    expectedPrincipalIssuer: record.expectedPrincipalIssuer,
    expectedServiceId: record.expectedServiceId,
    verificationTimeMs,
    clockSkewSeconds: record.clockSkewSeconds as number,
    maximumLifetimeSeconds: record.maximumLifetimeSeconds as number,
  }
}

function parseKeySet(value: unknown): IdentityCodeExchangeResultVerificationKeySet | null {
  const record = snapshotExactRecord(value, KEY_SET_KEYS)
  if (!record
    || typeof record.issuer !== 'string' || !isExactHttpsUrl(record.issuer)
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1) return null
  const values = snapshotDenseArray(record.keys, 3)
  if (!values || values.length < 1) return null
  const keys: IdentityCodeExchangeResultVerificationKey[] = []
  const ids = new Set<string>()
  for (const value of values) {
    const key = parseKey(value)
    if (!key || ids.has(key.keyId)) return null
    ids.add(key.keyId)
    keys.push(key)
  }
  if (keys.filter((key) => key.state === 'active').length !== 1) return null
  return { issuer: record.issuer, revision: record.revision as number, keys }
}

function parseKey(value: unknown): IdentityCodeExchangeResultVerificationKey | null {
  const record = snapshotExactRecord(value, KEY_KEYS)
  if (!record
    || typeof record.keyId !== 'string' || !RESULT_KEY_ID.test(record.keyId)
    || record.algorithm !== 'ES256'
    || (record.state !== 'active' && record.state !== 'overlap' && record.state !== 'retired')) return null
  const jwk = snapshotExactRecord(record.publicJwk, JWK_KEYS)
  if (!jwk
    || jwk.kty !== 'EC' || jwk.crv !== 'P-256'
    || typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)
    || typeof jwk.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y)) return null
  return {
    keyId: record.keyId,
    algorithm: 'ES256',
    state: record.state,
    publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
  }
}

function snapshotDenseArray(value: unknown, maximum: number): unknown[] | null {
  if (!Array.isArray(value)) return null
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor)
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0 || lengthDescriptor.value > maximum) return null
  const expected = Array.from({ length: lengthDescriptor.value as number }, (_, index) => String(index))
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length + 1
    || !keys.every((key) => key === 'length' || (typeof key === 'string' && expected.includes(key)))) return null
  const values: unknown[] = []
  for (const index of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    values.push(descriptor.value)
  }
  return values
}

function snapshotExactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys,
): Record<Keys[number], unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key as Keys[number]))) return null
  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true })
  }
  return snapshot
}

function decodeJsonObject(encoded: string, maximumBytes: number, maximumDepth: number): Record<string, unknown> | null {
  const bytes = decodeBase64Url(encoded, maximumBytes)
  if (!bytes) return null
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  const parsed = parseStrictJsonText(text, maximumBytes, maximumDepth)
  return parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? parsed.value as Record<string, unknown>
    : null
}

function decodeBase64Url(encoded: string, maximumBytes: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(`${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`)
  if (binary.length < 1 || binary.length > maximumBytes) return null
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return encodeBase64Url(bytes) === encoded ? bytes : null
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value)
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key))
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function isExactHttpsUrl(value: string): boolean {
  try {
    if (value.length < 1 || value.length > 512) return false
    const url = new URL(value)
    const canonical = url.pathname === '/' ? url.origin : url.toString()
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      && url.search === '' && url.hash === '' && canonical === value
  } catch {
    return false
  }
}
