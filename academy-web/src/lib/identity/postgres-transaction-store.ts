import { createHash, randomBytes } from 'node:crypto'
import type { ExchangeResult } from './adapter'
import { isWellFormedIdentityLifecycleSubject } from './lifecycle-principal'
import {
  digestIdentityBrowserBinding,
  IDENTITY_COMPLETION_FAILURE_STAGES,
  IdentityTransactionError,
  IdentityTransactionStoreError,
  isCanonicalIdentityTransactionState,
  snapshotPendingIdentityTransaction,
  snapshotPendingIdentityTransactionInput,
  type ActiveIdentityCompletionClaim,
  type IdentityCompletionClaim,
  type IdentityCompletionFailureStage,
  type IdentityCompletionReceipt,
  type IdentityTransactionStore,
  type PendingIdentityTransaction,
  type PendingIdentityTransactionInput,
} from './transaction'

const DEFAULT_TTL_SECONDS = 300
const MAX_TTL_SECONDS = 600
const CLAIM_LEASE_SECONDS = 30
const FAILURE_MESSAGE = 'Identity durable transaction operation failed'

const CREATE_RESPONSE_KEYS = ['expiresAt', 'status'] as const
const STATUS_RESPONSE_KEYS = ['status'] as const
const CONSUMED_RESPONSE_KEYS = ['status', 'transaction'] as const
const ACTIVE_CLAIM_RESPONSE_KEYS = [
  'exchangeResult', 'sessionId', 'status', 'transaction',
] as const
const COMPLETED_RESPONSE_KEYS = ['receipt', 'status'] as const
const ACTIVE_CLAIM_KEYS = [
  'claimToken', 'exchangeResult', 'sessionId', 'status', 'transaction',
] as const
const RECEIPT_KEYS = ['accountId', 'returnPath', 'sessionId'] as const
const EXCHANGE_RESULT_KEYS = [
  'activation', 'audience', 'issuer', 'nonce', 'serviceId', 'subject', 'verifiedEmail',
] as const
const ACTIVATION_KEYS = ['revision', 'status'] as const
const OPAQUE_SESSION_ID = /^[A-Za-z0-9_-]{43}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

type ClaimResult =
  | {
      status: 'claimed'
      transaction: PendingIdentityTransaction
      sessionId: string
      exchangeResult: ExchangeResult | null
    }
  | { status: 'completed'; receipt: IdentityCompletionReceipt }
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'browser_mismatch' }
  | { status: 'in_progress' }
  | { status: 'exhausted' }

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

  async claim(stateValue: string, browserBindingValue: string): Promise<IdentityCompletionClaim> {
    if (!isCanonicalIdentityTransactionState(stateValue)) {
      throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')
    }
    const browserBindingDigest = digestIdentityBrowserBinding(browserBindingValue)
    if (!browserBindingDigest) {
      throw new IdentityTransactionError('callback ไม่ได้มาจาก browser ที่เริ่มเข้าสู่ระบบ', 'browser_mismatch')
    }
    const claimToken = randomBytes(32).toString('base64url')
    const sessionId = randomBytes(32).toString('base64url')
    const claimDigest = digestClaimToken(claimToken)
    const { data } = await this.callRpc('claim_identity_authorization_transaction', {
      p_state: stateValue,
      p_browser_binding_digest: browserBindingDigest,
      p_claim_digest: claimDigest,
      p_session_id: sessionId,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    })
    const result = parseClaimResult(data)
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
    if (result.status === 'in_progress') {
      throw new IdentityTransactionError('callback กำลังดำเนินการอยู่', 'claim_in_progress')
    }
    if (result.status === 'exhausted') {
      throw new IdentityTransactionError('callback ใช้จำนวนครั้งครบแล้ว', 'claim_exhausted')
    }
    if (result.status === 'completed') {
      return Object.freeze({ status: 'completed', receipt: result.receipt })
    }
    return Object.freeze({
      status: 'claimed',
      claimToken,
      sessionId: result.sessionId,
      transaction: snapshotPendingIdentityTransaction(result.transaction),
      exchangeResult: result.exchangeResult,
    })
  }

  async checkpoint(
    claimValue: ActiveIdentityCompletionClaim,
    resultValue: ExchangeResult,
  ): Promise<void> {
    const claim = snapshotActiveCompletionClaim(claimValue)
    const result = snapshotCheckpointedExchangeResult(resultValue, claim.transaction)
    if (!result) throw new IdentityPostgresTransactionStoreFailure()
    const parameters = {
      p_state: claim.transaction.state,
      p_claim_digest: digestClaimToken(claim.claimToken),
      p_issuer: result.issuer,
      p_subject: result.subject,
      p_verified_email: result.verifiedEmail,
      p_activation_status: result.activation.status,
      p_activation_revision: result.activation.revision,
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data } = await this.callRpc(
          'checkpoint_identity_authorization_exchange',
          parameters,
        )
        const response = snapshotBoundedDataRecord(data, STATUS_RESPONSE_KEYS.length)
        if (response && hasExactKeys(response, STATUS_RESPONSE_KEYS)
          && response.status === 'checkpointed') return
      } catch {
        continue
      }
    }
    throw new IdentityPostgresTransactionStoreFailure()
  }

  async release(
    claimValue: ActiveIdentityCompletionClaim,
    stageValue: IdentityCompletionFailureStage,
  ): Promise<void> {
    const claim = snapshotActiveCompletionClaim(claimValue)
    if (!IDENTITY_COMPLETION_FAILURE_STAGES.includes(stageValue)) {
      throw new IdentityPostgresTransactionStoreFailure()
    }
    const { data } = await this.callRpc('release_identity_authorization_transaction_claim', {
      p_state: claim.transaction.state,
      p_claim_digest: digestClaimToken(claim.claimToken),
      p_failure_stage: stageValue,
    })
    const result = snapshotBoundedDataRecord(data, STATUS_RESPONSE_KEYS.length)
    if (!result || !hasExactKeys(result, STATUS_RESPONSE_KEYS) || result.status !== 'released') {
      throw new IdentityPostgresTransactionStoreFailure()
    }
  }

  async finalize(
    claimValue: ActiveIdentityCompletionClaim,
    receiptValue: IdentityCompletionReceipt,
  ): Promise<void> {
    const claim = snapshotActiveCompletionClaim(claimValue)
    const receipt = snapshotCompletionReceipt(receiptValue)
    if (!receipt
      || !claim.exchangeResult
      || receipt.sessionId !== claim.sessionId
      || receipt.returnPath !== claim.transaction.returnPath) {
      throw new IdentityPostgresTransactionStoreFailure()
    }
    const { data } = await this.callRpc('finalize_identity_authorization_transaction', {
      p_state: claim.transaction.state,
      p_claim_digest: digestClaimToken(claim.claimToken),
      p_account_id: receipt.accountId,
      p_session_id: receipt.sessionId,
      p_subject_key: encodeSubjectKey(claim.exchangeResult.subject),
    })
    const result = snapshotBoundedDataRecord(data, STATUS_RESPONSE_KEYS.length)
    if (!result || !hasExactKeys(result, STATUS_RESPONSE_KEYS) || result.status !== 'completed') {
      throw new IdentityPostgresTransactionStoreFailure()
    }
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

function parseClaimResult(value: unknown): ClaimResult | null {
  const response = snapshotBoundedDataRecord(value, ACTIVE_CLAIM_RESPONSE_KEYS.length)
  if (!response) return null
  if (
    hasExactKeys(response, STATUS_RESPONSE_KEYS)
    && (response.status === 'unknown'
      || response.status === 'expired'
      || response.status === 'browser_mismatch'
      || response.status === 'in_progress'
      || response.status === 'exhausted')
  ) {
    return { status: response.status }
  }
  if (hasExactKeys(response, COMPLETED_RESPONSE_KEYS) && response.status === 'completed') {
    const receipt = snapshotCompletionReceipt(response.receipt)
    return receipt ? { status: 'completed', receipt } : null
  }
  if (!hasExactKeys(response, ACTIVE_CLAIM_RESPONSE_KEYS)
    || response.status !== 'claimed'
    || typeof response.sessionId !== 'string'
    || !OPAQUE_SESSION_ID.test(response.sessionId)) return null
  const transaction = snapshotRemoteTransaction(response.transaction)
  if (!transaction) return null
  const exchangeResult = response.exchangeResult === null
    ? null
    : snapshotCheckpointedExchangeResult(response.exchangeResult, transaction)
  if (response.exchangeResult !== null && !exchangeResult) return null
  return {
    status: 'claimed',
    transaction,
    sessionId: response.sessionId,
    exchangeResult,
  }
}

function snapshotActiveCompletionClaim(value: unknown): ActiveIdentityCompletionClaim {
  try {
    const candidate = snapshotBoundedDataRecord(value, ACTIVE_CLAIM_KEYS.length)
    if (!candidate || !hasExactKeys(candidate, ACTIVE_CLAIM_KEYS)
      || candidate.status !== 'claimed'
      || typeof candidate.claimToken !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(candidate.claimToken)
      || typeof candidate.sessionId !== 'string'
      || !OPAQUE_SESSION_ID.test(candidate.sessionId)) {
      throw new Error(FAILURE_MESSAGE)
    }
    const transaction = snapshotPendingIdentityTransaction(candidate.transaction)
    const exchangeResult = candidate.exchangeResult === null
      ? null
      : snapshotCheckpointedExchangeResult(candidate.exchangeResult, transaction)
    if (candidate.exchangeResult !== null && !exchangeResult) {
      throw new Error(FAILURE_MESSAGE)
    }
    return Object.freeze({
      status: 'claimed',
      claimToken: candidate.claimToken,
      sessionId: candidate.sessionId,
      transaction,
      exchangeResult,
    })
  } catch {
    throw new IdentityPostgresTransactionStoreFailure()
  }
}

function snapshotCompletionReceipt(value: unknown): IdentityCompletionReceipt | null {
  const candidate = snapshotBoundedDataRecord(value, RECEIPT_KEYS.length)
  if (!candidate || !hasExactKeys(candidate, RECEIPT_KEYS)
    || typeof candidate.accountId !== 'string'
    || !UUID.test(candidate.accountId)
    || typeof candidate.sessionId !== 'string'
    || !OPAQUE_SESSION_ID.test(candidate.sessionId)
    || typeof candidate.returnPath !== 'string'
    || candidate.returnPath.length < 1
    || candidate.returnPath.length > 2_048
    || !candidate.returnPath.startsWith('/')
    || candidate.returnPath.startsWith('//')
    || candidate.returnPath.startsWith('/\\')) return null
  return Object.freeze({
    accountId: candidate.accountId,
    sessionId: candidate.sessionId,
    returnPath: candidate.returnPath,
  })
}

function snapshotCheckpointedExchangeResult(
  value: unknown,
  transaction: PendingIdentityTransaction,
): ExchangeResult | null {
  const candidate = snapshotBoundedDataRecord(value, EXCHANGE_RESULT_KEYS.length)
  if (!candidate || !hasExactKeys(candidate, EXCHANGE_RESULT_KEYS)) return null
  const activation = snapshotBoundedDataRecord(candidate.activation, ACTIVATION_KEYS.length)
  if (!activation || !hasExactKeys(activation, ACTIVATION_KEYS)
    || candidate.issuer !== transaction.client.expectedIssuer
    || candidate.audience !== transaction.client.audience
    || candidate.serviceId !== transaction.client.serviceId
    || candidate.nonce !== transaction.nonce
    || !isWellFormedIdentityLifecycleSubject(candidate.subject)
    || typeof candidate.verifiedEmail !== 'string'
    || candidate.verifiedEmail.length > 320
    || candidate.verifiedEmail !== candidate.verifiedEmail.trim().toLowerCase()
    || !EMAIL.test(candidate.verifiedEmail)
    || typeof activation.status !== 'string'
    || !['pending', 'active', 'suspended', 'deactivated'].includes(activation.status)
    || typeof activation.revision !== 'number'
    || !Number.isSafeInteger(activation.revision)
    || activation.revision < 1) return null
  return Object.freeze({
    issuer: candidate.issuer,
    subject: candidate.subject,
    verifiedEmail: candidate.verifiedEmail,
    audience: candidate.audience,
    serviceId: candidate.serviceId,
    nonce: candidate.nonce,
    activation: Object.freeze({
      status: activation.status as ExchangeResult['activation']['status'],
      revision: activation.revision,
    }),
  })
}

function digestClaimToken(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function encodeSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
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
