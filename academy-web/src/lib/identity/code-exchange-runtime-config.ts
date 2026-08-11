import {
  isCanonicalIdentityCodeExchangeEndpoint,
  isValidIdentityCodeExchangeFetchTimeout,
} from './code-exchange-runtime-values'

const CONFIG_KEYS = [
  'enabled',
  'releaseApproval',
  'endpoint',
  'clientAssertionAudience',
  'timeoutMs',
] as const

export type IdentityCodeExchangeRuntimeConfigInput = {
  enabled: boolean
  releaseApproval: boolean
  endpoint: string | null
  clientAssertionAudience: string | null
  timeoutMs: number | null
}

export type IdentityCodeExchangeRuntimeConfig =
  | {
    status: 'blocked'
    enabled: boolean
    releaseApproval: boolean
    configuration: 'absent' | 'valid'
  }
  | {
    status: 'admitted'
    endpoint: string
    clientAssertionAudience: string
    timeoutMs: number
  }

export function projectIdentityCodeExchangeRuntimeConfig(
  input: unknown,
): IdentityCodeExchangeRuntimeConfig | null {
  const snapshot = snapshotRuntimeConfig(input)
  if (!snapshot) return null

  const { enabled, releaseApproval, endpoint, clientAssertionAudience, timeoutMs } = snapshot
  if (typeof enabled !== 'boolean' || typeof releaseApproval !== 'boolean') return null

  const configurationAbsent = endpoint === null
    && clientAssertionAudience === null
    && timeoutMs === null
  const configurationValid = isCanonicalIdentityCodeExchangeEndpoint(endpoint)
    && clientAssertionAudience === endpoint
    && isValidIdentityCodeExchangeFetchTimeout(timeoutMs)
  if (!configurationAbsent && !configurationValid) return null

  if (!enabled || !releaseApproval) {
    return {
      status: 'blocked',
      enabled,
      releaseApproval,
      configuration: configurationAbsent ? 'absent' : 'valid',
    }
  }
  if (!configurationValid) return null

  return {
    status: 'admitted',
    endpoint,
    clientAssertionAudience,
    timeoutMs,
  }
}

function snapshotRuntimeConfig(
  value: unknown,
): Record<(typeof CONFIG_KEYS)[number], unknown> | null {
  try {
    if (!value
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      return null
    }
    const keys = Reflect.ownKeys(value)
    if (keys.length !== CONFIG_KEYS.length
      || keys.some((key) => typeof key !== 'string'
        || !CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number]))) {
      return null
    }

    const snapshot = Object.create(null) as Record<(typeof CONFIG_KEYS)[number], unknown>
    for (const key of CONFIG_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return null
  }
}
