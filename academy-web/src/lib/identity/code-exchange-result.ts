import type { ExchangeResult } from './adapter'

const RESULT_KEYS = [
  'activation',
  'audience',
  'issuer',
  'nonce',
  'serviceId',
  'subject',
  'verifiedEmail',
] as const
const ACTIVATION_KEYS = ['revision', 'status'] as const
const EXPECTATION_KEYS = ['audience', 'expectedIssuer', 'nonce', 'serviceId'] as const
const ACTIVATION_STATUSES = new Set(['pending', 'active', 'suspended', 'deactivated'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface IdentityCodeExchangeResultExpectations {
  audience: string
  expectedIssuer: string
  nonce: string
  serviceId: string
}

export type IdentityCodeExchangeResultVerification =
  | { ok: true; result: ExchangeResult }
  | { ok: false; reason: 'audience_mismatch' | 'invalid_result' }

/**
 * Snapshots the untrusted code-exchange result before the callback can use it.
 * The producer owns identity and activation policy; Academy only enforces the
 * exact released projection and the bindings held in its server transaction.
 */
export function verifyIdentityCodeExchangeResult(
  resultValue: unknown,
  expectationsValue: IdentityCodeExchangeResultExpectations,
): IdentityCodeExchangeResultVerification {
  try {
    const expectations = snapshotExactDataProperties(expectationsValue, EXPECTATION_KEYS)
    if (!expectations
      || !isNonEmptyString(expectations.audience)
      || !isNonEmptyString(expectations.expectedIssuer)
      || !isNonEmptyString(expectations.nonce)
      || !isNonEmptyString(expectations.serviceId)) {
      return invalidResult()
    }

    const result = snapshotExactDataProperties(resultValue, RESULT_KEYS)
    if (!result) return invalidResult()
    const activation = snapshotExactDataProperties(result.activation, ACTIVATION_KEYS)
    if (!activation) return invalidResult()

    if (!isNonEmptyString(result.audience)
      || !isNonEmptyString(result.serviceId)
      || !isNonEmptyString(result.nonce)
      || !isNonEmptyString(result.issuer)
      || !isNonEmptyString(result.subject)
      || typeof result.verifiedEmail !== 'string'
      || !EMAIL.test(result.verifiedEmail)
      || typeof activation.status !== 'string'
      || !ACTIVATION_STATUSES.has(activation.status)
      || !Number.isSafeInteger(activation.revision)
      || (activation.revision as number) < 1) {
      return invalidResult()
    }
    if (result.audience !== expectations.audience || result.serviceId !== expectations.serviceId) {
      return { ok: false, reason: 'audience_mismatch' }
    }
    if (result.nonce !== expectations.nonce || result.issuer !== expectations.expectedIssuer) {
      return invalidResult()
    }

    return {
      ok: true,
      result: {
        issuer: result.issuer,
        subject: result.subject,
        verifiedEmail: result.verifiedEmail,
        audience: result.audience,
        serviceId: result.serviceId,
        nonce: result.nonce,
        activation: {
          status: activation.status as ExchangeResult['activation']['status'],
          revision: activation.revision as number,
        },
      },
    }
  } catch {
    return invalidResult()
  }
}

function invalidResult(): IdentityCodeExchangeResultVerification {
  return { ok: false, reason: 'invalid_result' }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
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
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
    })
  }
  return snapshot
}
