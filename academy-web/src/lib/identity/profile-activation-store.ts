import type { ActivationStatus } from './adapter'

const INPUT_KEYS = ['activation', 'issuer', 'subject', 'verifiedEmail'] as const
const ACTIVATION_KEYS = ['revision', 'status'] as const
const ACTIVATION_STATUSES = new Set<ActivationStatus>([
  'pending',
  'active',
  'suspended',
  'deactivated',
])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FAILURE_MESSAGE = 'Identity profile activation commit failed'

export type IdentityProfileActivationInput = {
  issuer: string
  subject: string
  verifiedEmail: string
  activation: {
    status: ActivationStatus
    revision: number
  }
}

export type IdentityProfileActivationCommit = IdentityProfileActivationInput & {
  accountId: string
}

export type IdentityProfileActivationRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export class IdentityProfileActivationStoreFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityProfileActivationStoreFailure',
      configurable: true,
    })
  }
}

/**
 * Commits only Academy's local profile and the Identity Control activation
 * projection. Course entitlement, staff role, session, and resource access are
 * deliberately absent from this capability.
 */
export class AcademyIdentityProfileActivationStore {
  private readonly invokeRpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>

  constructor(clientValue: IdentityProfileActivationRpcClient) {
    try {
      if (!clientValue || (typeof clientValue !== 'object' && typeof clientValue !== 'function')) {
        throw new Error(FAILURE_MESSAGE)
      }
      const rpc = clientValue.rpc
      if (typeof rpc !== 'function') throw new Error(FAILURE_MESSAGE)
      this.invokeRpc = (functionName, parameters) => Reflect.apply(
        rpc,
        clientValue,
        [functionName, parameters],
      )
    } catch {
      throw new IdentityProfileActivationStoreFailure()
    }
  }

  async commit(inputValue: unknown): Promise<IdentityProfileActivationCommit> {
    try {
      const input = parseInput(inputValue)
      if (!input) throw new Error(FAILURE_MESSAGE)

      const response = await this.invokeRpc('commit_identity_profile_activation', {
        p_issuer: input.issuer,
        p_subject: input.subject,
        p_verified_email: input.verifiedEmail,
        p_status: input.activation.status,
        p_revision: input.activation.revision,
      })
      if (!response || typeof response !== 'object') throw new Error(FAILURE_MESSAGE)
      const error = response.error
      const accountId = response.data
      if (error !== null || typeof accountId !== 'string' || !UUID.test(accountId)) {
        throw new Error(FAILURE_MESSAGE)
      }

      return {
        accountId,
        issuer: input.issuer,
        subject: input.subject,
        verifiedEmail: input.verifiedEmail,
        activation: {
          status: input.activation.status,
          revision: input.activation.revision,
        },
      }
    } catch {
      throw new IdentityProfileActivationStoreFailure()
    }
  }
}

function parseInput(value: unknown): IdentityProfileActivationInput | null {
  const input = snapshotExactDataRecord(value, INPUT_KEYS)
  if (!input) return null
  const activation = snapshotExactDataRecord(input.activation, ACTIVATION_KEYS)
  if (!activation
    || typeof input.issuer !== 'string' || input.issuer.trim().length === 0
    || typeof input.subject !== 'string' || input.subject.trim().length === 0
    || typeof input.verifiedEmail !== 'string'
    || typeof activation.status !== 'string'
    || !ACTIVATION_STATUSES.has(activation.status as ActivationStatus)
    || typeof activation.revision !== 'number'
    || !Number.isSafeInteger(activation.revision)
    || activation.revision < 1) {
    return null
  }

  const verifiedEmail = input.verifiedEmail.trim().toLowerCase()
  if (!EMAIL.test(verifiedEmail) || verifiedEmail.length > 320) return null
  return {
    issuer: input.issuer,
    subject: input.subject,
    verifiedEmail,
    activation: {
      status: activation.status as ActivationStatus,
      revision: activation.revision,
    },
  }
}

function snapshotExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype) return null
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== 'string'
      || !expectedKeys.includes(key as Keys[number]))) {
    return null
  }

  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    snapshot[key as Keys[number]] = descriptor.value
  }
  return snapshot
}
