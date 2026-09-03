import type {
  ExchangeResult,
  IdentityClientAssertionProvider,
  IdentityCodeExchangePort,
} from './adapter'
import type {
  IdentityProfileActivationCommit,
  IdentityProfileActivationInput,
} from './profile-activation-store'
import type { IdentitySessionClaims } from './session-store'
import type { IdentityCodeExchangeResultVerifierPort } from './code-exchange-result-verifier-port'
import {
  completeSignedIdentityCallback,
  parseIdentityCallback,
  snapshotPendingIdentityTransaction,
  type ActiveIdentityCompletionClaim,
  type IdentityCompletionClaim,
  type IdentityCompletionFailureStage,
  type IdentityCompletionTransactionStore,
  type IdentityTransactionStore,
  type LocalIdentityClient,
} from './transaction'
import { IdentityTransactionError } from './transaction'

const OPTION_KEYS = [
  'admission',
  'transactionStore',
  'codeExchangePort',
  'codeExchangeResultVerifier',
  'profileActivationStore',
  'sessionStore',
  'client',
  'clientAssertionProvider',
] as const
const ADMISSION_KEYS = ['enabled', 'runtimeWired', 'releaseApproval'] as const
const CLIENT_KEYS = [
  'clientId',
  'redirectUri',
  'serviceId',
  'audience',
  'expectedIssuer',
  'clientAssertionAudience',
] as const
const COMPLETE_INPUT_KEYS = ['callbackUrl', 'browserBinding'] as const
const ACTIVATION_COMMIT_KEYS = [
  'accountId',
  'issuer',
  'subject',
  'verifiedEmail',
  'activation',
] as const
const ACTIVATION_KEYS = ['status', 'revision'] as const
const SESSION_RESULT_KEYS = ['id', 'claims'] as const
const SESSION_CLAIMS_KEYS = [
  'issuer',
  'subject',
  'verifiedEmail',
  'activation',
  'createdAt',
  'expiresAt',
] as const
const OPAQUE_SESSION_ID = /^[A-Za-z0-9_-]{32,160}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UNAVAILABLE_MESSAGE = 'Academy Identity runtime completion is unavailable'
const FAILURE_MESSAGE = 'Academy Identity runtime completion failed'
const RETRYABLE_FAILURES = new WeakSet<AcademyIdentityRuntimeCompletionFailure>()

export type AcademyIdentityRuntimeAdmission = {
  enabled: boolean
  runtimeWired: boolean
  releaseApproval: boolean
}

export type AcademyIdentityRuntimeCompletionResult = {
  accountId: string
  sessionId: string
  returnPath: string
}

type ProfileActivationPort = {
  commit(input: IdentityProfileActivationInput): PromiseLike<IdentityProfileActivationCommit>
}

type SessionPort = {
  create(input: IdentitySessionClaims, stableId: string): unknown | PromiseLike<unknown>
}

export class AcademyIdentityRuntimeUnavailableError extends Error {
  constructor() {
    super(UNAVAILABLE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'AcademyIdentityRuntimeUnavailableError',
      configurable: true,
    })
  }
}

export class AcademyIdentityRuntimeCompletionFailure extends Error {
  constructor(retryable = false) {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'AcademyIdentityRuntimeCompletionFailure',
      configurable: true,
    })
    if (retryable) RETRYABLE_FAILURES.add(this)
  }
}

export function isRetryableAcademyIdentityRuntimeCompletionFailure(
  value: unknown,
): value is AcademyIdentityRuntimeCompletionFailure {
  return value instanceof AcademyIdentityRuntimeCompletionFailure
    && RETRYABLE_FAILURES.has(value)
}

/**
 * Local composition boundary only. The caller must separately supply approved
 * runtime admission and every production capability; this module reads no env.
 */
export function createAcademyIdentityRuntimeCompletion(optionsValue: unknown): {
  complete(inputValue: unknown): Promise<AcademyIdentityRuntimeCompletionResult>
} {
  try {
    const options = snapshotExactDataRecord(optionsValue, OPTION_KEYS)
    const admission = snapshotExactDataRecord(options.admission, ADMISSION_KEYS)
    if (
      admission.enabled !== true
      || admission.runtimeWired !== true
      || admission.releaseApproval !== true
    ) {
      throw new Error(UNAVAILABLE_MESSAGE)
    }

    const client = snapshotClient(options.client)
    const claim = bindMethod<IdentityCompletionTransactionStore['claim']>(options.transactionStore, 'claim')
    const checkpoint = bindMethod<IdentityCompletionTransactionStore['checkpoint']>(
      options.transactionStore,
      'checkpoint',
    )
    const release = bindMethod<IdentityCompletionTransactionStore['release']>(options.transactionStore, 'release')
    const finalize = bindMethod<IdentityCompletionTransactionStore['finalize']>(options.transactionStore, 'finalize')
    const exchangeCode = bindMethod<IdentityCodeExchangePort['exchangeCode']>(options.codeExchangePort, 'exchangeCode')
    const verifyResult = bindMethod<IdentityCodeExchangeResultVerifierPort['verify']>(
      options.codeExchangeResultVerifier,
      'verify',
    )
    const commit = bindMethod<ProfileActivationPort['commit']>(options.profileActivationStore, 'commit')
    const createSession = bindMethod<SessionPort['create']>(options.sessionStore, 'create')
    const createClientAssertion = bindMethod<IdentityClientAssertionProvider['createClientAssertion']>(
      options.clientAssertionProvider,
      'createClientAssertion',
    )

    const codeExchangePort: IdentityCodeExchangePort = { exchangeCode }
    const resultVerifier: IdentityCodeExchangeResultVerifierPort = { verify: verifyResult }
    const clientAssertionProvider: IdentityClientAssertionProvider = { createClientAssertion }

    return Object.freeze({
      async complete(inputValue: unknown): Promise<AcademyIdentityRuntimeCompletionResult> {
        let activeClaim: ActiveIdentityCompletionClaim | null = null
        let claimAttempted = false
        let stage: IdentityCompletionFailureStage = 'client_binding'
        let finalized = false
        try {
          const input = snapshotExactDataRecord(inputValue, COMPLETE_INPUT_KEYS)
          if (!(input.callbackUrl instanceof URL) || typeof input.browserBinding !== 'string') {
            throw new Error(FAILURE_MESSAGE)
          }
          const callback = parseIdentityCallback(input.callbackUrl)
          claimAttempted = true
          const claimResult = snapshotCompletionClaim(await claim(callback.state, input.browserBinding))
          if (claimResult.status === 'completed') return claimResult.receipt
          activeClaim = claimResult
          const transactionStore: IdentityTransactionStore = {
            create() {
              throw new AcademyIdentityRuntimeCompletionFailure()
            },
            consume(callbackState: string) {
              if (callbackState !== activeClaim?.transaction.state) {
                throw new IdentityTransactionError(
                  'state ถูกออกให้กับ Academy client คนละรายการ',
                  'audience_mismatch',
                )
              }
              return activeClaim.transaction
            },
          }
          const stagedClientAssertionProvider: IdentityClientAssertionProvider = {
            createClientAssertion(input) {
              stage = 'client_assertion'
              return clientAssertionProvider.createClientAssertion(input)
            },
          }
          const stagedCodeExchangePort: IdentityCodeExchangePort = {
            exchangeCode(input) {
              stage = 'code_exchange'
              return codeExchangePort.exchangeCode(input)
            },
          }
          const stagedResultVerifier: IdentityCodeExchangeResultVerifierPort = {
            verify(value, binding) {
              stage = 'result_verification'
              return resultVerifier.verify(value, binding)
            },
          }
          let completed: {
            exchange: ReturnType<typeof snapshotCheckpointExchangeResult>
            returnPath: string
          }
          if (activeClaim.exchangeResult) {
            assertClientBinding(activeClaim.transaction, client)
            completed = {
              exchange: snapshotCheckpointExchangeResult(
                activeClaim.exchangeResult,
                activeClaim.transaction,
              ),
              returnPath: activeClaim.transaction.returnPath,
            }
          } else {
            const exchanged = await completeSignedIdentityCallback({
              adapter: stagedCodeExchangePort,
              store: transactionStore,
              client,
              callback,
              browserBinding: input.browserBinding,
              clientAssertionProvider: stagedClientAssertionProvider,
              resultVerifier: stagedResultVerifier,
            })
            completed = {
              exchange: snapshotCheckpointExchangeResult(
                exchanged.exchange,
                activeClaim.transaction,
              ),
              returnPath: exchanged.returnPath,
            }
            stage = 'result_checkpoint'
            await checkpoint(activeClaim, completed.exchange)
            activeClaim = Object.freeze({ ...activeClaim, exchangeResult: completed.exchange })
          }

          stage = 'profile_activation'
          const activationInput: IdentityProfileActivationInput = {
            issuer: completed.exchange.issuer,
            subject: completed.exchange.subject,
            verifiedEmail: completed.exchange.verifiedEmail.trim().toLowerCase(),
            activation: {
              status: completed.exchange.activation.status,
              revision: completed.exchange.activation.revision,
            },
          }
          const activationCommit = snapshotActivationCommit(
            await commit(activationInput),
            activationInput,
          )
          stage = 'session_creation'
          const sessionInput: IdentitySessionClaims = {
            issuer: activationCommit.issuer,
            subject: activationCommit.subject,
            verifiedEmail: activationCommit.verifiedEmail,
            activation: {
              status: activationCommit.activation.status,
              revision: activationCommit.activation.revision,
            },
          }
          const sessionId = snapshotSessionReceipt(
            await createSession(sessionInput, activeClaim.sessionId),
            sessionInput,
            activeClaim.sessionId,
          )
          stage = 'transaction_finalize'
          const receipt = Object.freeze({
            accountId: activationCommit.accountId,
            sessionId,
            returnPath: completed.returnPath,
          })
          await finalize(activeClaim, receipt)
          finalized = true

          return receipt
        } catch (error) {
          if (activeClaim && !finalized) {
            try {
              await release(activeClaim, stage)
            } catch {
              // The bounded database lease still permits recovery after expiry.
            }
            throw new AcademyIdentityRuntimeCompletionFailure(true)
          }
          throw new AcademyIdentityRuntimeCompletionFailure(
            claimAttempted && (
              !(error instanceof IdentityTransactionError)
              || error.reason === 'claim_in_progress'
            ),
          )
        }
      },
    })
  } catch {
    throw new AcademyIdentityRuntimeUnavailableError()
  }
}

function snapshotCompletionClaim(value: unknown): IdentityCompletionClaim {
  const candidate = snapshotExactDataRecord(
    value,
    value && typeof value === 'object' && (value as { status?: unknown }).status === 'completed'
      ? ['receipt', 'status'] as const
      : ['claimToken', 'exchangeResult', 'sessionId', 'status', 'transaction'] as const,
  )
  if (candidate.status === 'completed') {
    return Object.freeze({
      status: 'completed',
      receipt: snapshotCompletionReceipt(candidate.receipt),
    })
  }
  if (candidate.status !== 'claimed'
    || typeof candidate.claimToken !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(candidate.claimToken)
    || typeof candidate.sessionId !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(candidate.sessionId)) throw new Error(FAILURE_MESSAGE)
  const transaction = snapshotPendingIdentityTransaction(candidate.transaction)
  return Object.freeze({
    status: 'claimed',
    claimToken: candidate.claimToken,
    sessionId: candidate.sessionId,
    transaction,
    exchangeResult: candidate.exchangeResult === null
      ? null
      : snapshotCheckpointExchangeResult(candidate.exchangeResult),
  })
}

function snapshotClient(value: unknown): LocalIdentityClient {
  const candidate = snapshotExactDataRecord(value, CLIENT_KEYS)
  for (const key of CLIENT_KEYS) {
    if (typeof candidate[key] !== 'string' || candidate[key].length === 0) {
      throw new Error(UNAVAILABLE_MESSAGE)
    }
  }
  return Object.freeze({
    clientId: candidate.clientId as string,
    redirectUri: candidate.redirectUri as string,
    serviceId: candidate.serviceId as string,
    audience: candidate.audience as string,
    expectedIssuer: candidate.expectedIssuer as string,
    clientAssertionAudience: candidate.clientAssertionAudience as string,
  })
}

function snapshotCompletionReceipt(value: unknown): AcademyIdentityRuntimeCompletionResult {
  const candidate = snapshotExactDataRecord(value, ['accountId', 'returnPath', 'sessionId'] as const)
  if (typeof candidate.accountId !== 'string'
    || !UUID.test(candidate.accountId)
    || typeof candidate.sessionId !== 'string'
    || !OPAQUE_SESSION_ID.test(candidate.sessionId)
    || typeof candidate.returnPath !== 'string'
    || candidate.returnPath.length < 1
    || candidate.returnPath.length > 2_048
    || !candidate.returnPath.startsWith('/')
    || candidate.returnPath.startsWith('//')
    || candidate.returnPath.startsWith('/\\')) throw new Error(FAILURE_MESSAGE)
  return Object.freeze({
    accountId: candidate.accountId,
    sessionId: candidate.sessionId,
    returnPath: candidate.returnPath,
  })
}

function snapshotCheckpointExchangeResult(
  value: unknown,
  transaction?: ReturnType<typeof snapshotPendingIdentityTransaction>,
): ExchangeResult {
  const candidate = snapshotExactDataRecord(
    value,
    ['activation', 'audience', 'issuer', 'nonce', 'serviceId', 'subject', 'verifiedEmail'] as const,
  )
  const activation = snapshotExactDataRecord(candidate.activation, ACTIVATION_KEYS)
  if (typeof candidate.issuer !== 'string' || candidate.issuer.length < 1
    || typeof candidate.subject !== 'string' || candidate.subject.length < 1
    || candidate.subject.length > 512 || candidate.subject.includes('\0')
    || typeof candidate.verifiedEmail !== 'string'
    || typeof candidate.audience !== 'string' || candidate.audience.length < 1
    || typeof candidate.serviceId !== 'string' || candidate.serviceId.length < 1
    || typeof candidate.nonce !== 'string' || candidate.nonce.length < 1
    || (transaction !== undefined && (
      candidate.issuer !== transaction.client.expectedIssuer
      || candidate.audience !== transaction.client.audience
      || candidate.serviceId !== transaction.client.serviceId
      || candidate.nonce !== transaction.nonce
    ))
    || typeof activation.status !== 'string'
    || !['pending', 'active', 'suspended', 'deactivated'].includes(activation.status)
    || typeof activation.revision !== 'number'
    || !Number.isSafeInteger(activation.revision)
    || activation.revision < 1) throw new Error(FAILURE_MESSAGE)
  const verifiedEmail = candidate.verifiedEmail.trim().toLowerCase()
  if (verifiedEmail.length > 320 || !EMAIL.test(verifiedEmail)) throw new Error(FAILURE_MESSAGE)
  return Object.freeze({
    issuer: candidate.issuer,
    subject: candidate.subject,
    verifiedEmail,
    audience: candidate.audience,
    serviceId: candidate.serviceId,
    nonce: candidate.nonce,
    activation: Object.freeze({
      status: activation.status as ExchangeResult['activation']['status'],
      revision: activation.revision,
    }),
  })
}

function assertClientBinding(
  transaction: ReturnType<typeof snapshotPendingIdentityTransaction>,
  client: LocalIdentityClient,
): void {
  if (transaction.client.clientId !== client.clientId
    || transaction.client.redirectUri !== client.redirectUri
    || transaction.client.serviceId !== client.serviceId
    || transaction.client.audience !== client.audience
    || transaction.client.expectedIssuer !== client.expectedIssuer
    || transaction.client.clientAssertionAudience !== client.clientAssertionAudience) {
    throw new IdentityTransactionError(
      'state ถูกออกให้กับ Academy client คนละรายการ',
      'audience_mismatch',
    )
  }
}

function snapshotActivationCommit(
  value: unknown,
  expected: IdentityProfileActivationInput,
): IdentityProfileActivationCommit {
  const candidate = snapshotExactDataRecord(value, ACTIVATION_COMMIT_KEYS)
  const activation = snapshotExactDataRecord(candidate.activation, ACTIVATION_KEYS)
  if (
    typeof candidate.accountId !== 'string'
    || !UUID.test(candidate.accountId)
    || typeof candidate.issuer !== 'string'
    || typeof candidate.subject !== 'string'
    || typeof candidate.verifiedEmail !== 'string'
    || typeof activation.status !== 'string'
    || !['pending', 'active', 'suspended', 'deactivated'].includes(activation.status)
    || typeof activation.revision !== 'number'
    || !Number.isSafeInteger(activation.revision)
    || activation.revision < 1
    || candidate.issuer !== expected.issuer
    || candidate.subject !== expected.subject
    || candidate.verifiedEmail !== expected.verifiedEmail
    || activation.status !== expected.activation.status
    || activation.revision !== expected.activation.revision
  ) {
    throw new Error(FAILURE_MESSAGE)
  }
  return {
    accountId: candidate.accountId,
    issuer: candidate.issuer,
    subject: candidate.subject,
    verifiedEmail: candidate.verifiedEmail,
    activation: {
      status: activation.status as IdentityProfileActivationCommit['activation']['status'],
      revision: activation.revision,
    },
  }
}

function snapshotSessionReceipt(
  value: unknown,
  expected: IdentitySessionClaims,
  expectedId: string,
): string {
  const session = snapshotExactDataRecord(value, SESSION_RESULT_KEYS)
  const claims = snapshotExactDataRecord(session.claims, SESSION_CLAIMS_KEYS)
  const activation = snapshotExactDataRecord(claims.activation, ACTIVATION_KEYS)
  if (
    typeof session.id !== 'string'
    || !OPAQUE_SESSION_ID.test(session.id)
    || session.id !== expectedId
    || claims.issuer !== expected.issuer
    || claims.subject !== expected.subject
    || claims.verifiedEmail !== expected.verifiedEmail
    || activation.status !== expected.activation.status
    || activation.revision !== expected.activation.revision
    || typeof claims.createdAt !== 'number'
    || !Number.isSafeInteger(claims.createdAt)
    || typeof claims.expiresAt !== 'number'
    || !Number.isSafeInteger(claims.expiresAt)
    || claims.expiresAt <= claims.createdAt
  ) {
    throw new Error(FAILURE_MESSAGE)
  }
  return session.id
}

function bindMethod<Method extends (...args: never[]) => unknown>(value: unknown, name: string): Method {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new Error(UNAVAILABLE_MESSAGE)
  }
  const method = Reflect.get(value, name, value)
  if (typeof method !== 'function') throw new Error(UNAVAILABLE_MESSAGE)
  return ((...args: Parameters<Method>) => Reflect.apply(method, value, args)) as Method
}

function snapshotExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(FAILURE_MESSAGE)
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(FAILURE_MESSAGE)
  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key as Keys[number]))
  ) {
    throw new Error(FAILURE_MESSAGE)
  }
  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(FAILURE_MESSAGE)
    }
    snapshot[key as Keys[number]] = descriptor.value
  }
  return snapshot
}
