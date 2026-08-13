import type { ExchangeResult } from './adapter'
import {
  verifyIdentityCodeExchangeResultEnvelope,
  type IdentityCodeExchangeResultVerificationKey,
  type IdentityCodeExchangeResultVerificationKeySet,
} from './code-exchange-result-envelope'

const OPTION_KEYS = ['clock', 'clockSkewSeconds', 'keySet', 'maximumLifetimeSeconds'] as const
const BINDING_KEYS = [
  'expectedAudience',
  'expectedClientId',
  'expectedNonce',
  'expectedPrincipalIssuer',
  'expectedServiceId',
] as const
const WIRE_KEYS = ['signedResult'] as const
const KEY_SET_KEYS = ['issuer', 'keys', 'revision'] as const
const KEY_KEYS = ['algorithm', 'keyId', 'publicJwk', 'state'] as const
const JWK_KEYS = ['crv', 'kty', 'x', 'y'] as const
const FAILURE_MESSAGE = 'Identity code exchange result verification failed'

export type IdentityCodeExchangeResultBinding = {
  expectedAudience: string
  expectedClientId: string
  expectedNonce: string
  expectedPrincipalIssuer: string
  expectedServiceId: string
}

export type IdentityCodeExchangeResultVerifierPort = {
  verify(value: unknown, binding: IdentityCodeExchangeResultBinding): Promise<ExchangeResult>
}

export class IdentityCodeExchangeResultVerifierFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangeResultVerifierFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangeResultVerifierPort(
  optionsValue: unknown,
): IdentityCodeExchangeResultVerifierPort {
  try {
    const options = snapshotExactDataRecord(optionsValue, OPTION_KEYS)
    const keySet = snapshotKeySet(options.keySet)
    const clock = bindMethod<() => unknown>(options.clock)
    if (!Number.isSafeInteger(options.clockSkewSeconds)
      || (options.clockSkewSeconds as number) < 0
      || (options.clockSkewSeconds as number) > 60
      || !Number.isSafeInteger(options.maximumLifetimeSeconds)
      || (options.maximumLifetimeSeconds as number) < 30
      || (options.maximumLifetimeSeconds as number) > 120) {
      throw new Error(FAILURE_MESSAGE)
    }

    return Object.freeze({
      async verify(value: unknown, bindingValue: IdentityCodeExchangeResultBinding): Promise<ExchangeResult> {
        try {
          const wire = snapshotExactDataRecord(value, WIRE_KEYS)
          const binding = snapshotExactDataRecord(bindingValue, BINDING_KEYS)
          if (typeof wire.signedResult !== 'string') throw new Error(FAILURE_MESSAGE)
          for (const key of BINDING_KEYS) {
            if (typeof binding[key] !== 'string') throw new Error(FAILURE_MESSAGE)
          }
          const verificationTimeValue = await clock()
          if (!(verificationTimeValue instanceof Date)) throw new Error(FAILURE_MESSAGE)
          const verificationTimeMs = Reflect.apply(
            Date.prototype.getTime,
            verificationTimeValue,
            [],
          ) as number
          if (!Number.isFinite(verificationTimeMs)) throw new Error(FAILURE_MESSAGE)

          const result = await verifyIdentityCodeExchangeResultEnvelope(
            wire.signedResult,
            keySet,
            {
              expectedIssuer: keySet.issuer,
              expectedAudience: binding.expectedAudience as string,
              expectedClientId: binding.expectedClientId as string,
              expectedNonce: binding.expectedNonce as string,
              expectedPrincipalIssuer: binding.expectedPrincipalIssuer as string,
              expectedServiceId: binding.expectedServiceId as string,
              verificationTime: new Date(verificationTimeMs),
              clockSkewSeconds: options.clockSkewSeconds as number,
              maximumLifetimeSeconds: options.maximumLifetimeSeconds as number,
            },
          )
          if (!result) throw new Error(FAILURE_MESSAGE)
          return result
        } catch {
          throw new IdentityCodeExchangeResultVerifierFailure()
        }
      },
    })
  } catch {
    throw new IdentityCodeExchangeResultVerifierFailure()
  }
}

function snapshotKeySet(value: unknown): IdentityCodeExchangeResultVerificationKeySet {
  const record = snapshotExactDataRecord(value, KEY_SET_KEYS)
  const values = snapshotDenseArray(record.keys, 3)
  if (typeof record.issuer !== 'string'
    || !Number.isSafeInteger(record.revision)
    || (record.revision as number) < 1
    || values.length < 1) throw new Error(FAILURE_MESSAGE)
  const keys = values.map(snapshotKey)
  if (new Set(keys.map((key) => key.keyId)).size !== keys.length
    || keys.filter((key) => key.state === 'active').length !== 1) {
    throw new Error(FAILURE_MESSAGE)
  }
  return {
    issuer: record.issuer,
    revision: record.revision as number,
    keys,
  }
}

function snapshotKey(value: unknown): IdentityCodeExchangeResultVerificationKey {
  const record = snapshotExactDataRecord(value, KEY_KEYS)
  const jwk = snapshotExactDataRecord(record.publicJwk, JWK_KEYS)
  if (record.algorithm !== 'ES256'
    || typeof record.keyId !== 'string'
    || (record.state !== 'active' && record.state !== 'overlap' && record.state !== 'retired')
    || jwk.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || typeof jwk.x !== 'string'
    || typeof jwk.y !== 'string') throw new Error(FAILURE_MESSAGE)
  return Object.freeze({
    algorithm: 'ES256',
    keyId: record.keyId,
    state: record.state,
    publicJwk: Object.freeze({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }),
  })
}

function snapshotDenseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(FAILURE_MESSAGE)
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
  const length = lengthDescriptor && 'value' in lengthDescriptor
    ? lengthDescriptor.value
    : undefined
  if (!lengthDescriptor || !('value' in lengthDescriptor)
    || typeof length !== 'number'
    || !Number.isSafeInteger(length)
    || length < 0
    || length > maximum) throw new Error(FAILURE_MESSAGE)
  const expected = Array.from({ length }, (_, index) => String(index))
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length + 1
    || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) {
    throw new Error(FAILURE_MESSAGE)
  }
  return expected.map((index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, index)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(FAILURE_MESSAGE)
    }
    return descriptor.value
  })
}

function snapshotExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys,
): Record<Keys[number], unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error(FAILURE_MESSAGE)
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key as Keys[number]))) {
    throw new Error(FAILURE_MESSAGE)
  }
  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(FAILURE_MESSAGE)
    }
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true })
  }
  return snapshot
}

function bindMethod<T extends (...args: never[]) => unknown>(owner: unknown): T {
  if (typeof owner !== 'function') throw new Error(FAILURE_MESSAGE)
  return owner.bind(undefined) as T
}
