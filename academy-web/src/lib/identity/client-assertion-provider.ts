const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/
const JTI_PATTERN = /^[A-Za-z0-9_-]{16,160}$/
const MIN_LIFETIME_SECONDS = 30
const MAX_LIFETIME_SECONDS = 300
const MAX_AUDIENCE_CHARACTERS = 2_048
const MAX_HEADER_BYTES = 512
const MAX_CLAIMS_BYTES = 2_048
const SIGNATURE_BYTES = 64
const FAILURE_MESSAGE = 'Identity client assertion provider failed'
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
)?.get

export type IdentityClientAssertionClock = {
  now(): Date
}

export type IdentityClientAssertionJtiSource = {
  next(): string
}

export type IdentityClientAssertionPurpose = 'code_exchange' | 'lifecycle_pull'

export type IdentityEs256AssertionSigner = {
  readonly clientId: string
  readonly purpose: IdentityClientAssertionPurpose
  readonly keyId: string
  sign(input: {
    algorithm: 'ES256'
    clientId: string
    purpose: IdentityClientAssertionPurpose
    keyId: string
    signingInput: Uint8Array
  }): Promise<Uint8Array>
}

export type IdentityClientAssertionProviderOptions = {
  clientId: string
  purpose: IdentityClientAssertionPurpose
  audience: string
  keyId: string
  lifetimeSeconds: number
  clock: IdentityClientAssertionClock
  jtiSource: IdentityClientAssertionJtiSource
  signer: IdentityEs256AssertionSigner
}

export type IdentityClientAssertionRequest = {
  audience: string
  consumerId?: string
}

// The wider request shape is structurally compatible with both Academy ports.
// Each configured instance still pins one client, audience, and purpose.
export type AcademyIdentityClientAssertionProvider = {
  createClientAssertion(input: IdentityClientAssertionRequest): Promise<string>
}

export class IdentityClientAssertionProviderFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityClientAssertionProviderFailure',
      configurable: true,
    })
  }
}

export function createIdentityClientAssertionProvider(
  input: IdentityClientAssertionProviderOptions,
): AcademyIdentityClientAssertionProvider {
  try {
    const clientId = input.clientId
    const purpose = input.purpose
    const audience = input.audience
    const keyId = input.keyId
    const lifetimeSeconds = input.lifetimeSeconds
    const clock = input.clock
    const jtiSource = input.jtiSource
    const signer = input.signer
    const now = clock?.now
    const nextJti = jtiSource?.next
    const signerClientId = signer?.clientId
    const signerPurpose = signer?.purpose
    const signerKeyId = signer?.keyId
    const sign = signer?.sign

    if (typeof clientId !== 'string'
      || !CLIENT_ID_PATTERN.test(clientId)
      || (purpose !== 'code_exchange' && purpose !== 'lifecycle_pull')
      || !isExactHttpsAudience(audience)
      || typeof keyId !== 'string'
      || !KEY_ID_PATTERN.test(keyId)
      || !Number.isSafeInteger(lifetimeSeconds)
      || lifetimeSeconds < MIN_LIFETIME_SECONDS
      || lifetimeSeconds > MAX_LIFETIME_SECONDS
      || !clock
      || typeof now !== 'function'
      || !jtiSource
      || typeof nextJti !== 'function'
      || !signer
      || signerClientId !== clientId
      || signerPurpose !== purpose
      || signerKeyId !== keyId
      || typeof sign !== 'function') {
      throw new IdentityClientAssertionProviderFailure()
    }

    return {
      async createClientAssertion(request) {
        try {
          const snapshot = snapshotRequest(request)
          if (!snapshot
            || snapshot.audience !== audience
            || (purpose === 'code_exchange' && snapshot.consumerId !== undefined)
            || (purpose === 'lifecycle_pull' && snapshot.consumerId !== clientId)) {
            throw new IdentityClientAssertionProviderFailure()
          }

          const issuedAt = readIssuedAt(now.call(clock))
          const expiresAt = issuedAt + lifetimeSeconds
          if (!Number.isSafeInteger(expiresAt)) {
            throw new IdentityClientAssertionProviderFailure()
          }
          const jti = nextJti.call(jtiSource)
          if (typeof jti !== 'string' || !JTI_PATTERN.test(jti)) {
            throw new IdentityClientAssertionProviderFailure()
          }

          const encodedHeader = encodeJson(
            { alg: 'ES256', kid: keyId, typ: 'JWT' },
            MAX_HEADER_BYTES,
          )
          const encodedClaims = encodeJson({
            aud: audience,
            exp: expiresAt,
            iat: issuedAt,
            iss: clientId,
            jti,
            sub: clientId,
          }, MAX_CLAIMS_BYTES)
          const signingInput = `${encodedHeader}.${encodedClaims}`
          const signature = await sign.call(signer, {
            algorithm: 'ES256',
            clientId,
            purpose,
            keyId,
            signingInput: new TextEncoder().encode(signingInput),
          })
          if (!(signature instanceof Uint8Array)
            || !ArrayBuffer.isView(signature)
            || !TYPED_ARRAY_BYTE_LENGTH
            || TYPED_ARRAY_BYTE_LENGTH.call(signature) !== SIGNATURE_BYTES) {
            throw new IdentityClientAssertionProviderFailure()
          }
          const signatureBytes = new Uint8Array(SIGNATURE_BYTES)
          Uint8Array.prototype.set.call(signatureBytes, signature)
          return `${signingInput}.${encodeBase64Url(signatureBytes)}`
        } catch {
          throw new IdentityClientAssertionProviderFailure()
        }
      },
    }
  } catch {
    throw new IdentityClientAssertionProviderFailure()
  }
}

function snapshotRequest(value: unknown): IdentityClientAssertionRequest | null {
  try {
    if (!value
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      return null
    }
    const keys = Reflect.ownKeys(value)
    const hasConsumerId = keys.length === 2 && keys.includes('consumerId')
    if (!(keys.length === 1 || hasConsumerId)
      || !keys.includes('audience')
      || keys.some((key) => typeof key !== 'string'
        || (key !== 'audience' && key !== 'consumerId'))) {
      return null
    }
    const audience = readDataProperty(value, 'audience')
    if (!audience.found || typeof audience.value !== 'string') return null
    if (!hasConsumerId) return { audience: audience.value }
    const consumerId = readDataProperty(value, 'consumerId')
    if (!consumerId.found || typeof consumerId.value !== 'string') return null
    return { audience: audience.value, consumerId: consumerId.value }
  } catch {
    return null
  }
}

function readDataProperty(
  value: object,
  key: string,
): { found: true; value: unknown } | { found: false } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    return { found: false }
  }
  return { found: true, value: descriptor.value }
}

function readIssuedAt(value: unknown): number {
  if (!(value instanceof Date)) throw new IdentityClientAssertionProviderFailure()
  const milliseconds = Date.prototype.getTime.call(value)
  const issuedAt = Math.floor(milliseconds / 1_000)
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    throw new IdentityClientAssertionProviderFailure()
  }
  return issuedAt
}

function isExactHttpsAudience(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_AUDIENCE_CHARACTERS) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.hash === ''
      && url.toString() === value
  } catch {
    return false
  }
}

function encodeJson(value: Record<string, unknown>, maxBytes: number): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) {
    throw new IdentityClientAssertionProviderFailure()
  }
  return encodeBase64Url(bytes)
}

function encodeBase64Url(value: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let encoded = ''
  for (let offset = 0; offset < value.byteLength; offset += 3) {
    const first = value[offset] ?? 0
    const hasSecond = offset + 1 < value.byteLength
    const hasThird = offset + 2 < value.byteLength
    const second = hasSecond ? value[offset + 1] ?? 0 : 0
    const third = hasThird ? value[offset + 2] ?? 0 : 0
    encoded += alphabet[first >>> 2]
    encoded += alphabet[((first & 0x03) << 4) | (second >>> 4)]
    if (hasSecond) encoded += alphabet[((second & 0x0f) << 2) | (third >>> 6)]
    if (hasThird) encoded += alphabet[third & 0x3f]
  }
  return encoded
}
