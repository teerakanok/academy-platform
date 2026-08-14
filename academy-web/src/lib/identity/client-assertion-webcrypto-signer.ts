import type {
  IdentityClientAssertionPurpose,
  IdentityEs256AssertionSigner,
} from './client-assertion-provider'

const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/
const MAX_SIGNING_INPUT_BYTES = 4_096
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
const CRYPTO_KEY_PROTOTYPE = typeof CryptoKey === 'function' ? CryptoKey.prototype : null
const CRYPTO_KEY_TYPE = CRYPTO_KEY_PROTOTYPE
  ? Object.getOwnPropertyDescriptor(CRYPTO_KEY_PROTOTYPE, 'type')?.get
  : null
const CRYPTO_KEY_EXTRACTABLE = CRYPTO_KEY_PROTOTYPE
  ? Object.getOwnPropertyDescriptor(CRYPTO_KEY_PROTOTYPE, 'extractable')?.get
  : null
const CRYPTO_KEY_ALGORITHM = CRYPTO_KEY_PROTOTYPE
  ? Object.getOwnPropertyDescriptor(CRYPTO_KEY_PROTOTYPE, 'algorithm')?.get
  : null
const CRYPTO_KEY_USAGES = CRYPTO_KEY_PROTOTYPE
  ? Object.getOwnPropertyDescriptor(CRYPTO_KEY_PROTOTYPE, 'usages')?.get
  : null

export type IdentityClientAssertionWebCryptoSignerOptions = {
  clientId: string
  purpose: IdentityClientAssertionPurpose
  keyId: string
  privateKey: CryptoKey
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
 * Prove the key is a real CryptoKey and not something wearing one as a costume.
 *
 * Reading metadata through the prototype getters is the right technique in a
 * browser, where `CryptoKey` is a WebIDL interface and calling its getter on a
 * foreign `this` fails the brand check. It is NOT sufficient under Node, where
 * the getter reaches the underlying key through a property that a Proxy simply
 * forwards — so a Proxy can report `extractable: false` while wrapping a key
 * that is extractable, and every metadata check below would agree with it.
 *
 * `structuredClone` is a brand check that holds in both: a genuine CryptoKey is
 * serializable per the HTML specification, and a Proxy around one is not
 * cloneable. A runtime that cannot clone a genuine CryptoKey would fail closed
 * here, which is why the test suite pins that a genuine key still passes.
 */
function assertGenuineCryptoKey(value: unknown): void {
  try {
    structuredClone(value)
  } catch {
    throw new IdentityClientAssertionWebCryptoSignerFailure()
  }
}

export function createIdentityClientAssertionWebCryptoSigner(
  input: IdentityClientAssertionWebCryptoSignerOptions,
): IdentityEs256AssertionSigner {
  try {
    const clientId = input.clientId
    const purpose = input.purpose
    const keyId = input.keyId
    const privateKey = input.privateKey
    const crypto = globalThis.crypto
    const subtle = crypto?.subtle
    const sign = subtle?.sign
    if (!CRYPTO_KEY_TYPE
      || !CRYPTO_KEY_EXTRACTABLE
      || !CRYPTO_KEY_ALGORITHM
      || !CRYPTO_KEY_USAGES) {
      throw new IdentityClientAssertionWebCryptoSignerFailure()
    }
    assertGenuineCryptoKey(privateKey)
    const keyType = CRYPTO_KEY_TYPE.call(privateKey)
    const extractable = CRYPTO_KEY_EXTRACTABLE.call(privateKey)
    const algorithm = CRYPTO_KEY_ALGORITHM.call(privateKey) as KeyAlgorithm
    const keyUsages = CRYPTO_KEY_USAGES.call(privateKey) as readonly KeyUsage[]
    const algorithmName = algorithm?.name
    const namedCurve = (algorithm as Partial<EcKeyAlgorithm> | undefined)?.namedCurve
    const usageLength = keyUsages?.length
    const usage = usageLength === 1 ? keyUsages[0] : null

    if (typeof clientId !== 'string'
      || !CLIENT_ID_PATTERN.test(clientId)
      || (purpose !== 'code_exchange' && purpose !== 'lifecycle_pull')
      || typeof keyId !== 'string'
      || !KEY_ID_PATTERN.test(keyId)
      || !privateKey
      || keyType !== 'private'
      || extractable !== false
      || algorithmName !== 'ECDSA'
      || namedCurve !== 'P-256'
      || usageLength !== 1
      || usage !== 'sign'
      || !crypto
      || !subtle
      || typeof sign !== 'function') {
      throw new IdentityClientAssertionWebCryptoSignerFailure()
    }

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
