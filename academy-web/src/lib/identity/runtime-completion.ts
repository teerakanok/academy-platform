import type {
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
  type IdentityTransactionStore,
  type LocalIdentityClient,
} from './transaction'

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
const UNAVAILABLE_MESSAGE = 'Academy Identity runtime completion is unavailable'
const FAILURE_MESSAGE = 'Academy Identity runtime completion failed'

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
  create(input: IdentitySessionClaims): unknown | PromiseLike<unknown>
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
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'AcademyIdentityRuntimeCompletionFailure',
      configurable: true,
    })
  }
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
    const consume = bindMethod<IdentityTransactionStore['consume']>(options.transactionStore, 'consume')
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

    const transactionStore: IdentityTransactionStore = {
      create() {
        throw new AcademyIdentityRuntimeCompletionFailure()
      },
      consume,
    }
    const codeExchangePort: IdentityCodeExchangePort = { exchangeCode }
    const resultVerifier: IdentityCodeExchangeResultVerifierPort = { verify: verifyResult }
    const clientAssertionProvider: IdentityClientAssertionProvider = { createClientAssertion }

    return Object.freeze({
      async complete(inputValue: unknown): Promise<AcademyIdentityRuntimeCompletionResult> {
        try {
          const input = snapshotExactDataRecord(inputValue, COMPLETE_INPUT_KEYS)
          if (!(input.callbackUrl instanceof URL) || typeof input.browserBinding !== 'string') {
            throw new Error(FAILURE_MESSAGE)
          }
          const callback = parseIdentityCallback(input.callbackUrl)
          const completed = await completeSignedIdentityCallback({
            adapter: codeExchangePort,
            store: transactionStore,
            client,
            callback,
            browserBinding: input.browserBinding,
            clientAssertionProvider,
            resultVerifier,
          })

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
          const sessionInput: IdentitySessionClaims = {
            issuer: activationCommit.issuer,
            subject: activationCommit.subject,
            verifiedEmail: activationCommit.verifiedEmail,
            activation: {
              status: activationCommit.activation.status,
              revision: activationCommit.activation.revision,
            },
          }
          const sessionId = snapshotSessionReceipt(await createSession(sessionInput), sessionInput)

          return Object.freeze({
            accountId: activationCommit.accountId,
            sessionId,
            returnPath: completed.returnPath,
          })
        } catch {
          throw new AcademyIdentityRuntimeCompletionFailure()
        }
      },
    })
  } catch {
    throw new AcademyIdentityRuntimeUnavailableError()
  }
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

function snapshotSessionReceipt(value: unknown, expected: IdentitySessionClaims): string {
  const session = snapshotExactDataRecord(value, SESSION_RESULT_KEYS)
  const claims = snapshotExactDataRecord(session.claims, SESSION_CLAIMS_KEYS)
  const activation = snapshotExactDataRecord(claims.activation, ACTIVATION_KEYS)
  if (
    typeof session.id !== 'string'
    || !OPAQUE_SESSION_ID.test(session.id)
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
