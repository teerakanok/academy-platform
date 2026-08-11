import {
  digestIdentityBrowserBinding,
  IdentityTransactionError,
  IdentityTransactionStoreError,
  isCanonicalIdentityTransactionState,
  snapshotPendingIdentityTransaction,
  snapshotPendingIdentityTransactionInput,
  type IdentityTransactionStore,
  type PendingIdentityTransaction,
  type PendingIdentityTransactionInput,
} from './transaction'

const DEFAULT_TTL_SECONDS = 300
const MAX_TTL_SECONDS = 600
const FAILURE_MESSAGE = 'Identity durable transaction operation failed'

const CREATE_RESPONSE_KEYS = ['expiresAt', 'status'] as const
const STATUS_RESPONSE_KEYS = ['status'] as const
const CONSUMED_RESPONSE_KEYS = ['status', 'transaction'] as const

export type IdentityPostgresTransactionRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export class IdentityPostgresTransactionStoreFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityPostgresTransactionStoreFailure',
      configurable: true,
    })
  }
}

type CreateResult =
  | { status: 'created'; expiresAt: number }
  | { status: 'duplicate' }

type ConsumeResult =
  | { status: 'consumed'; transaction: PendingIdentityTransaction }
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'browser_mismatch' }

/**
 * Durable Academy-owned authorization transaction adapter.
 *
 * The database owns time, uniqueness, one-time claim, expiry deletion, and the
 * browser-binding comparison. The adapter exposes no direct table capability.
 */
export class AcademyPostgresIdentityTransactionStore implements IdentityTransactionStore {
  private readonly invokeRpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>
  private readonly ttlSeconds: number

  constructor(
    clientValue: IdentityPostgresTransactionRpcClient,
    optionsValue: { ttlSeconds?: number } = {},
  ) {
    const ttlSeconds = snapshotTtlSeconds(optionsValue)
    if (ttlSeconds === null) throw new IdentityPostgresTransactionStoreFailure()

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
      this.ttlSeconds = ttlSeconds
    } catch {
      throw new IdentityPostgresTransactionStoreFailure()
    }
  }

  async create(inputValue: PendingIdentityTransactionInput): Promise<PendingIdentityTransaction> {
    const input = snapshotPendingIdentityTransactionInput(inputValue)
    const { data } = await this.callRpc('create_identity_authorization_transaction', {
      p_state: input.state,
      p_code_verifier: input.codeVerifier,
      p_nonce: input.nonce,
      p_browser_binding_digest: input.browserBindingDigest,
      p_client_id: input.client.clientId,
      p_redirect_uri: input.client.redirectUri,
      p_service_id: input.client.serviceId,
      p_audience: input.client.audience,
      p_expected_issuer: input.client.expectedIssuer,
      p_client_assertion_audience: input.client.clientAssertionAudience,
      p_return_path: input.returnPath,
      p_ttl_seconds: this.ttlSeconds,
    })
    const result = parseCreateResult(data)
    if (!result) throw new IdentityPostgresTransactionStoreFailure()
    if (result.status === 'duplicate') {
      throw new IdentityTransactionStoreError('identity transaction store มี state ที่ยังใช้งานอยู่ซ้ำกัน')
    }
    return snapshotPendingIdentityTransaction({
      ...input,
      client: { ...input.client },
      expiresAt: result.expiresAt,
    })
  }

  async consume(stateValue: string, browserBindingValue: string): Promise<PendingIdentityTransaction> {
    if (!isCanonicalIdentityTransactionState(stateValue)) {
      throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')
    }
    const browserBindingDigest = digestIdentityBrowserBinding(browserBindingValue)
    if (!browserBindingDigest) {
      throw new IdentityTransactionError('callback ไม่ได้มาจาก browser ที่เริ่มเข้าสู่ระบบ', 'browser_mismatch')
    }

    const { data } = await this.callRpc('consume_identity_authorization_transaction', {
      p_state: stateValue,
      p_browser_binding_digest: browserBindingDigest,
    })
    const result = parseConsumeResult(data)
    if (!result) throw new IdentityPostgresTransactionStoreFailure()
    if (result.status === 'unknown') {
      throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')
    }
    if (result.status === 'expired') {
      throw new IdentityTransactionError('state ของการเข้าสู่ระบบหมดอายุแล้ว', 'expired_state')
    }
    if (result.status === 'browser_mismatch') {
      throw new IdentityTransactionError('callback ไม่ได้มาจาก browser ที่เริ่มเข้าสู่ระบบ', 'browser_mismatch')
    }
    return snapshotPendingIdentityTransaction(result.transaction)
  }

  private async callRpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown }> {
    try {
      const response = await this.invokeRpc(functionName, parameters)
      const envelope = snapshotRequiredDataFields(response, ['data', 'error'])
      if (!envelope || envelope.error !== null) throw new Error(FAILURE_MESSAGE)
      return { data: envelope.data }
    } catch {
      throw new IdentityPostgresTransactionStoreFailure()
    }
  }
}

function snapshotTtlSeconds(value: unknown): number | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => key !== 'ttlSeconds') || ownKeys.length > 1) return null
    if (ownKeys.length === 0) return DEFAULT_TTL_SECONDS
    const descriptor = Reflect.getOwnPropertyDescriptor(value, 'ttlSeconds')
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    const ttlSeconds = descriptor.value
    return typeof ttlSeconds === 'number'
      && Number.isSafeInteger(ttlSeconds)
      && ttlSeconds >= 1
      && ttlSeconds <= MAX_TTL_SECONDS
      ? ttlSeconds
      : null
  } catch {
    return null
  }
}

function snapshotRequiredDataFields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Reflect.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      result[key] = descriptor.value
    }
    return result
  } catch {
    return null
  }
}

function snapshotBoundedDataRecord(value: unknown, maximumKeys: number): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const prototype = Reflect.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.length > maximumKeys) return null
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of ownKeys) {
      if (typeof key !== 'string') return null
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      result[key] = descriptor.value
    }
    return result
  } catch {
    return null
  }
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expectedKeys.length && keys.every((key) => expectedKeys.includes(key))
}

function parseCreateResult(value: unknown): CreateResult | null {
  const response = snapshotBoundedDataRecord(value, CREATE_RESPONSE_KEYS.length)
  if (!response) return null
  if (hasExactKeys(response, STATUS_RESPONSE_KEYS) && response.status === 'duplicate') {
    return { status: 'duplicate' }
  }
  if (!hasExactKeys(response, CREATE_RESPONSE_KEYS) || response.status !== 'created') return null
  const expiresAt = parseCanonicalInstant(response.expiresAt)
  return expiresAt === null ? null : { status: 'created', expiresAt }
}

function parseConsumeResult(value: unknown): ConsumeResult | null {
  const response = snapshotBoundedDataRecord(value, CONSUMED_RESPONSE_KEYS.length)
  if (!response) return null
  if (
    hasExactKeys(response, STATUS_RESPONSE_KEYS)
    && (response.status === 'unknown'
      || response.status === 'expired'
      || response.status === 'browser_mismatch')
  ) {
    return { status: response.status }
  }
  if (!hasExactKeys(response, CONSUMED_RESPONSE_KEYS) || response.status !== 'consumed') return null
  const transaction = snapshotRemoteTransaction(response.transaction)
  return transaction ? { status: 'consumed', transaction } : null
}

function snapshotRemoteTransaction(value: unknown): PendingIdentityTransaction | null {
  try {
    const expectedKeys = [
      'state',
      'codeVerifier',
      'nonce',
      'browserBindingDigest',
      'client',
      'returnPath',
      'expiresAt',
    ] as const
    const candidate = snapshotBoundedDataRecord(value, expectedKeys.length)
    if (!candidate || !hasExactKeys(candidate, expectedKeys)) return null
    const expiresAt = parseCanonicalInstant(candidate.expiresAt)
    if (expiresAt === null) return null
    return snapshotPendingIdentityTransaction({
      state: candidate.state,
      codeVerifier: candidate.codeVerifier,
      nonce: candidate.nonce,
      browserBindingDigest: candidate.browserBindingDigest,
      client: candidate.client,
      returnPath: candidate.returnPath,
      expiresAt,
    })
  } catch {
    return null
  }
}

function parseCanonicalInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  if (!Number.isSafeInteger(parsed)) return null
  try {
    return new Date(parsed).toISOString() === value ? parsed : null
  } catch {
    return null
  }
}
