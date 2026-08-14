import type {
  IdentityClientAssertionPurpose,
  IdentityEs256AssertionSigner,
} from './client-assertion-provider'

const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/
const COORDINATE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SCALAR_PATTERN = /^[A-Za-z0-9_-]{43}$/
const JWK_KEYS = ['kty', 'crv', 'x', 'y', 'd'] as const
const MAX_SIGNING_INPUT_BYTES = 4_096
const MAX_JWK_BYTES = 4_096
const COORDINATE_BYTES = 32
const SIGNATURE_BYTES = 64
const FAILURE_MESSAGE = 'Identity client assertion Web Crypto signer failed'
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)?.get

export type IdentityClientAssertionWebCryptoSignerOptions = {
  clientId: string
  purpose: IdentityClientAssertionPurpose
  keyId: string
  /**
   * The private key as JWK text, exactly as it comes from protected
   * configuration. Not a `CryptoKey`, and not an object — see the factory.
   */
  privateJwk: string
}

type IdentityClientAssertionSigningSnapshot = {
  algorithm: 'ES256'
  clientId: string
  purpose: IdentityClientAssertionPurpose
  keyId: string
  signingInput: Uint8Array<ArrayBuffer>
}

export class IdentityClientAssertionWebCryptoSignerFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityClientAssertionWebCryptoSignerFailure',
      configurable: true,
    })
  }
}

/**
 * Build a signer that owns its key instead of inspecting one it was handed.
 *
 * The earlier contract took a `CryptoKey` from the caller and validated its
 * metadata through the `CryptoKey.prototype` getters. That is the correct
 * technique on a runtime where `CryptoKey` is a WebIDL interface with a brand
 * check — and it holds on the Node version this package declares. It does not
 * hold everywhere: on Node 25 the key's state lives in own symbols, so an
 * ordinary object inheriting from a real key with `Symbol(kExtractable)`
 * shadowed reports `extractable: false` through those same getters while
 * wrapping an extractable key. Trying to detect the forgery instead — with
 * `structuredClone`, `subtle.sign`, or `Object.prototype.toString` — either
 * misses that shape or rejects genuine keys on workerd.
 *
 * So the key is not inspected: it is imported here, from JWK text, with
 * `extractable: false` and `['sign']` as the only usage. Nothing the caller can
 * pass is treated as a key, so there is nothing to forge, and the check works
 * the same on every runtime because it does not depend on how that runtime
 * represents a `CryptoKey`.
 *
 * The honest limit: a caller that holds the JWK could copy the key material
 * before handing it over. `extractable: false` after import contains mistakes
 * inside this process; it is not proof of provenance. Key material that must
 * never be exportable belongs in a KMS, an HSM, or a signing service that holds
 * it and never releases it.
 */
export async function createIdentityClientAssertionWebCryptoSigner(
  input: IdentityClientAssertionWebCryptoSignerOptions,
): Promise<IdentityEs256AssertionSigner> {
  try {
    const clientId = input.clientId
    const purpose = input.purpose
    const keyId = input.keyId
    const crypto = globalThis.crypto
    const subtle = crypto?.subtle
    const sign = subtle?.sign
    const importKey = subtle?.importKey

    if (typeof clientId !== 'string'
      || !CLIENT_ID_PATTERN.test(clientId)
      || (purpose !== 'code_exchange' && purpose !== 'lifecycle_pull')
      || typeof keyId !== 'string'
      || !KEY_ID_PATTERN.test(keyId)
      || !crypto
      || !subtle
      || typeof sign !== 'function'
      || typeof importKey !== 'function') {
      throw new IdentityClientAssertionWebCryptoSignerFailure()
    }

    const jwk = parsePrivateJwk(input.privateJwk)
    // The captured reference is called explicitly against `subtle` so a later
    // reassignment of `crypto.subtle.importKey` cannot redirect this import.
    const importJwk = importKey as (
      format: 'jwk',
      keyData: JsonWebKey,
      algorithm: EcKeyImportParams,
      extractable: boolean,
      keyUsages: readonly KeyUsage[],
    ) => Promise<CryptoKey>
    const privateKey = await importJwk.call(
      subtle,
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )

    return {
      clientId,
      purpose,
      keyId,
      async sign(runtimeInput) {
        try {
          const snapshot = snapshotSigningInput(runtimeInput)
          if (!snapshot
            || snapshot.algorithm !== 'ES256'
            || snapshot.clientId !== clientId
            || snapshot.purpose !== purpose
            || snapshot.keyId !== keyId) {
            throw new IdentityClientAssertionWebCryptoSignerFailure()
          }

          const signature = await sign.call(
            subtle,
            { name: 'ECDSA', hash: 'SHA-256' },
            privateKey,
            snapshot.signingInput,
          )
          if (!ARRAY_BUFFER_BYTE_LENGTH
            || ARRAY_BUFFER_BYTE_LENGTH.call(signature) !== SIGNATURE_BYTES) {
            throw new IdentityClientAssertionWebCryptoSignerFailure()
          }
          const output = new Uint8Array(SIGNATURE_BYTES)
          Uint8Array.prototype.set.call(output, new Uint8Array(signature))
          return output
        } catch {
          throw new IdentityClientAssertionWebCryptoSignerFailure()
        }
      },
    }
  } catch {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
}

/**
 * JWK text only, in exactly one spelling.
 *
 * Parsing here means the value below is plain data: a Proxy, an accessor, or an
 * inherited property cannot come out of `JSON.parse`, so there is no hostile
 * object graph to defend against.
 *
 * But parsing alone is not enough, because `JSON.parse` is lossy in ways that
 * matter for a private key. It collapses duplicate members last-wins, so
 * `{"kty":"RSA",…,"kty":"EC"}` reaches this code looking like a clean five-member
 * document while a reviewer, a linter, or any first-wins parser reading the same
 * bytes sees a different key. It also resolves `\u006bty` to `kty`, and base64url
 * leaves the last character's unused bits free, so the same key has several
 * spellings that all decode identically.
 *
 * None of that is exploitable on its own — the key that gets used is still the
 * key the runtime imports. It is a provenance problem: the file a person audited
 * and the key the process signs with must be the same object, and "same" has to
 * mean byte-for-byte or it means nothing.
 *
 * So the text must be the canonical spelling of the key it denotes:
 *
 *     {"kty":"EC","crv":"P-256","x":"…","y":"…","d":"…"}
 *
 * exactly those members, exactly that order, no insignificant whitespace, no
 * escapes, each value the canonical base64url encoding of its 32 bytes, with at
 * most one trailing newline. One key, one file, one reading.
 */
function parsePrivateJwk(text: unknown): JsonWebKey {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_JWK_BYTES) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  const actual = Object.keys(parsed as object)
  if (actual.length !== JWK_KEYS.length
    || actual.some((key) => !JWK_KEYS.includes(key as (typeof JWK_KEYS)[number]))) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  const record = parsed as Record<(typeof JWK_KEYS)[number], unknown>
  if (record.kty !== 'EC'
    || record.crv !== 'P-256'
    || typeof record.x !== 'string' || !COORDINATE_PATTERN.test(record.x)
    || typeof record.y !== 'string' || !COORDINATE_PATTERN.test(record.y)
    || typeof record.d !== 'string' || !SCALAR_PATTERN.test(record.d)) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  if (!isCanonicalBase64Url(record.x)
    || !isCanonicalBase64Url(record.y)
    || !isCanonicalBase64Url(record.d)) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }

  const jwk = { kty: 'EC', crv: 'P-256', x: record.x, y: record.y, d: record.d } as const
  // Built from the parsed values and compared against the original bytes, so the
  // member order is the canonical one by construction rather than by assertion.
  const canonical = JSON.stringify(jwk)
  if (text !== canonical && text !== `${canonical}\n`) {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
  return { ...jwk }
}

/**
 * One 32-byte value, one spelling. base64url leaves the final character's unused
 * bits free, so several strings decode to the same key; re-encoding the decoded
 * bytes is what decides which one this file is allowed to contain.
 */
function isCanonicalBase64Url(value: string): boolean {
  let binary: string
  try {
    binary = atob(`${value.replaceAll('-', '+').replaceAll('_', '/')}=`)
  } catch {
    return false
  }
  if (binary.length !== COORDINATE_BYTES) return false
  const bytes = new Uint8Array(COORDINATE_BYTES)
  for (let index = 0; index < COORDINATE_BYTES; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  let reencoded = ''
  for (const byte of bytes) reencoded += String.fromCharCode(byte)
  return btoa(reencoded).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') === value
}

function snapshotSigningInput(
  value: unknown,
): IdentityClientAssertionSigningSnapshot | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const algorithm = readDataProperty(value, 'algorithm')
    const clientId = readDataProperty(value, 'clientId')
    const purpose = readDataProperty(value, 'purpose')
    const keyId = readDataProperty(value, 'keyId')
    const signingInput = readDataProperty(value, 'signingInput')
    if (!algorithm.found
      || !clientId.found
      || !purpose.found
      || !keyId.found
      || !signingInput.found
      || algorithm.value !== 'ES256'
      || typeof clientId.value !== 'string'
      || (purpose.value !== 'code_exchange' && purpose.value !== 'lifecycle_pull')
      || typeof keyId.value !== 'string'
      || !(signingInput.value instanceof Uint8Array)
      || !TYPED_ARRAY_BYTE_LENGTH
      || !TYPED_ARRAY_BUFFER) {
      return null
    }
    const byteLength = TYPED_ARRAY_BYTE_LENGTH.call(signingInput.value)
    const buffer = TYPED_ARRAY_BUFFER.call(signingInput.value)
    if (!Number.isSafeInteger(byteLength)
      || byteLength < 1
      || byteLength > MAX_SIGNING_INPUT_BYTES
      || !(buffer instanceof ArrayBuffer)) {
      return null
    }
    const inputBytes = new Uint8Array(byteLength)
    Uint8Array.prototype.set.call(inputBytes, signingInput.value)
    return {
      algorithm: 'ES256',
      clientId: clientId.value,
      purpose: purpose.value,
      keyId: keyId.value,
      signingInput: inputBytes,
    }
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
