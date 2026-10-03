import { createPublicKey, verify, type webcrypto } from 'node:crypto'
import type { TrustedClientAuthenticator } from './index.js'

const HEADER_KEYS = ['alg', 'kid', 'typ']
const CLAIM_KEYS = ['aud', 'exp', 'iat', 'iss', 'jti', 'sub']

export interface ResolvedClientVerificationKey {
  keyId: string
  algorithm: 'ES256'
  publicJwk: webcrypto.JsonWebKey
}

export interface ClientVerificationKeyResolver {
  resolve(clientId: string, keyId: string): Promise<ResolvedClientVerificationKey | null>
}

export interface ClientAssertionReplayStore {
  reserve(clientId: string, jtiDigest: string, expiresAt: Date): Promise<boolean>
}

export interface Es256ClientAssertionAuthenticatorOptions {
  audience: string
  keyResolver: ClientVerificationKeyResolver
  replayStore: ClientAssertionReplayStore
  now: () => Date
  sha256: (value: string) => string
  clockSkewSeconds: number
  maxLifetimeSeconds: number
}

export class Es256ClientAssertionAuthenticator implements TrustedClientAuthenticator {
  constructor(private readonly options: Es256ClientAssertionAuthenticatorOptions) {
    if (!isExactHttpsUrl(options.audience)) throw new Error('client assertion audience is invalid')
    if (!Number.isInteger(options.clockSkewSeconds) || options.clockSkewSeconds < 0 || options.clockSkewSeconds > 120) {
      throw new Error('client assertion clock skew is invalid')
    }
    if (!Number.isInteger(options.maxLifetimeSeconds)
      || options.maxLifetimeSeconds < 30
      || options.maxLifetimeSeconds > 300) {
      throw new Error('client assertion maximum lifetime is invalid')
    }
  }

  async authenticate(clientId: string, assertion: string): Promise<boolean> {
    const parsed = parseAssertion(assertion, clientId, this.options)
    if (!parsed) return false
    const key = await this.options.keyResolver.resolve(clientId, parsed.keyId)
    if (!key || key.keyId !== parsed.keyId || key.algorithm !== 'ES256' || !isP256PublicJwk(key.publicJwk)) return false

    let signatureValid = false
    try {
      const publicKey = createPublicKey({ key: key.publicJwk, format: 'jwk' })
      signatureValid = verify('sha256', Buffer.from(parsed.signingInput), {
        key: publicKey,
        dsaEncoding: 'ieee-p1363',
      }, parsed.signature)
    } catch {
      return false
    }
    if (!signatureValid) return false

    return this.options.replayStore.reserve(
      clientId,
      this.options.sha256(`client-assertion:${clientId}:${parsed.jti}`),
      parsed.expiresAt,
    )
  }
}

function parseAssertion(
  assertion: string,
  clientId: string,
  options: Pick<Es256ClientAssertionAuthenticatorOptions, 'audience' | 'now' | 'clockSkewSeconds' | 'maxLifetimeSeconds'>,
): { keyId: string; jti: string; expiresAt: Date; signingInput: string; signature: Buffer } | null {
  try {
    const parts = assertion.split('.')
    if (parts.length !== 3) return null
    const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string]
    const header = decodeJsonObject(encodedHeader, 512)
    const claims = decodeJsonObject(encodedClaims, 2_048)
    const signature = decodeBase64Url(encodedSignature, 96)
    if (!hasExactKeys(header, HEADER_KEYS) || !hasExactKeys(claims, CLAIM_KEYS)) return null
    if (header.alg !== 'ES256' || header.typ !== 'JWT'
      || typeof header.kid !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(header.kid)) return null
    if (claims.iss !== clientId || claims.sub !== clientId || claims.aud !== options.audience) return null
    if (typeof claims.jti !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(claims.jti)) return null
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null
    const issuedAt = claims.iat as number
    const expiresAt = claims.exp as number
    const now = Math.floor(options.now().getTime() / 1_000)
    if (expiresAt <= now
      || issuedAt > now + options.clockSkewSeconds
      || expiresAt <= issuedAt
      || expiresAt - issuedAt > options.maxLifetimeSeconds) return null
    if (signature.byteLength !== 64) return null
    return {
      keyId: header.kid,
      jti: claims.jti,
      expiresAt: new Date(expiresAt * 1_000),
      signingInput: `${encodedHeader}.${encodedClaims}`,
      signature,
    }
  } catch {
    return null
  }
}

function decodeJsonObject(encoded: string, maxBytes: number): Record<string, unknown> {
  const decoded = decodeBase64Url(encoded, maxBytes)
  const parsed: unknown = JSON.parse(decoded.toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid JSON object')
  return parsed as Record<string, unknown>
}

function decodeBase64Url(encoded: string, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('invalid base64url')
  const decoded = Buffer.from(encoded, 'base64url')
  if (decoded.byteLength < 1 || decoded.byteLength > maxBytes || decoded.toString('base64url') !== encoded) {
    throw new Error('non-canonical base64url')
  }
  return decoded
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isP256PublicJwk(value: webcrypto.JsonWebKey): boolean {
  return value.kty === 'EC'
    && value.crv === 'P-256'
    && typeof value.x === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(value.x)
    && typeof value.y === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(value.y)
    && value.d === undefined
    && (value.use === undefined || value.use === 'sig')
    && (value.key_ops === undefined || (value.key_ops.length === 1 && value.key_ops[0] === 'verify'))
}

function isExactHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.toString() === value
  } catch {
    return false
  }
}
