import { randomBytes } from 'node:crypto'
import type { ActivationStatus } from './adapter'
import {
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from './lifecycle-principal'
import type { IdentitySessionClaims } from './session-store'

const FAILURE_MESSAGE = 'Identity durable session operation failed'
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INPUT_KEYS = ['activation', 'issuer', 'subject', 'verifiedEmail'] as const
const ACTIVATION_KEYS = ['revision', 'status'] as const
const SESSION_KEYS = ['claims', 'id'] as const
const WIRE_STORED_CLAIM_KEYS = [
  'activation', 'createdAt', 'expiresAt', 'issuer', 'subjectKey', 'verifiedEmail',
] as const
const CREATE_KEYS = ['session', 'status'] as const
const STATUS_KEYS = ['status'] as const
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_TTL_SECONDS = 24 * 60 * 60
const MAX_CREATE_ATTEMPTS = 2
const ACTIVATION_STATUSES = new Set<ActivationStatus>([
  'pending', 'active', 'suspended', 'deactivated',
])

export type IdentitySessionReceipt = {
  id: string
  claims: IdentitySessionClaims & { createdAt: number; expiresAt: number }
}

export interface IdentityDurableSessionPort {
  create(input: IdentitySessionClaims): Promise<IdentitySessionReceipt>
  get(id: string): Promise<IdentitySessionReceipt['claims'] | null>
  revoke(id: string): Promise<void>
}

export type IdentityPostgresSessionRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export class IdentityPostgresSessionStoreFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityPostgresSessionStoreFailure',
      configurable: true,
    })
  }
}

/**
 * Least-capability durable session adapter. The database capability is limited
 * to three reviewed RPCs; it exposes no table, entitlement, or role operation.
 */
export class AcademyPostgresIdentitySessionStore implements IdentityDurableSessionPort {
  private readonly invokeRpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>
  private readonly ttlSeconds: number

  constructor(
    clientValue: IdentityPostgresSessionRpcClient,
    optionsValue: { ttlSeconds?: number } = {},
  ) {
    try {
      const ttlSeconds = snapshotTtlSeconds(optionsValue)
      if (ttlSeconds === null
        || !clientValue
        || (typeof clientValue !== 'object' && typeof clientValue !== 'function')) {
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
      throw new IdentityPostgresSessionStoreFailure()
    }
  }

  async create(inputValue: IdentitySessionClaims): Promise<IdentitySessionReceipt> {
    const input = snapshotInput(inputValue)
    if (!input) throw new IdentityPostgresSessionStoreFailure()

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
      const sessionId = randomBytes(32).toString('base64url')
      const data = await this.callRpc('create_identity_session', {
        p_session_id: sessionId,
        p_issuer: input.issuer,
        p_subject_key: encodeSubjectKey(input.subject),
        p_verified_email: input.verifiedEmail,
        p_activation_status: input.activation.status,
        p_activation_revision: input.activation.revision,
        p_ttl_seconds: this.ttlSeconds,
      })
      const duplicate = snapshotExactDataRecord(data, STATUS_KEYS)
      if (duplicate?.status === 'duplicate') continue
      const result = snapshotExactDataRecord(data, CREATE_KEYS)
      if (!result || result.status !== 'created') {
        throw new IdentityPostgresSessionStoreFailure()
      }
      const receipt = snapshotSession(result.session)
      if (!receipt || receipt.id !== sessionId || !samePrincipal(receipt.claims, input)) {
        throw new IdentityPostgresSessionStoreFailure()
      }
      return receipt
    }
    throw new IdentityPostgresSessionStoreFailure()
  }

  async get(id: string): Promise<IdentitySessionReceipt['claims'] | null> {
    if (!SESSION_ID.test(id)) return null
    const data = await this.callRpc('read_identity_session', { p_session_id: id })
    const status = snapshotExactDataRecord(data, STATUS_KEYS)
    if (status?.status === 'unknown' || status?.status === 'expired') return null
    const result = snapshotExactDataRecord(data, CREATE_KEYS)
    if (!result || result.status !== 'active') throw new IdentityPostgresSessionStoreFailure()
    const receipt = snapshotSession(result.session)
    if (!receipt || receipt.id !== id) throw new IdentityPostgresSessionStoreFailure()
    return receipt.claims
  }

  async revoke(id: string): Promise<void> {
    if (!SESSION_ID.test(id)) return
    const data = await this.callRpc('revoke_identity_session', { p_session_id: id })
    const result = snapshotExactDataRecord(data, STATUS_KEYS)
    if (!result || (result.status !== 'revoked' && result.status !== 'absent')) {
      throw new IdentityPostgresSessionStoreFailure()
    }
  }

  private async callRpc(functionName: string, parameters: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.invokeRpc(functionName, parameters)
      const envelope = snapshotExactDataRecord(response, ['data', 'error'] as const)
      if (!envelope || envelope.error !== null) throw new Error(FAILURE_MESSAGE)
      return envelope.data
    } catch {
      throw new IdentityPostgresSessionStoreFailure()
    }
  }
}

function snapshotTtlSeconds(value: unknown): number | null {
  const options = snapshotOptionalExactDataRecord(value, ['ttlSeconds'] as const)
  if (!options) return null
  if (!Object.hasOwn(options, 'ttlSeconds')) return DEFAULT_TTL_SECONDS
  const ttlSeconds = options.ttlSeconds
  return typeof ttlSeconds === 'number'
    && Number.isSafeInteger(ttlSeconds)
    && ttlSeconds >= 1
    && ttlSeconds <= MAX_TTL_SECONDS
    ? ttlSeconds
    : null
}

function snapshotInput(value: unknown): IdentitySessionClaims | null {
  const input = snapshotExactDataRecord(value, INPUT_KEYS)
  if (!input) return null
  const activation = snapshotExactDataRecord(input.activation, ACTIVATION_KEYS)
  if (!activation
    || !isCanonicalIdentityLifecyclePrincipalIssuer(input.issuer)
    || !isWellFormedIdentityLifecycleSubject(input.subject)
    || typeof input.verifiedEmail !== 'string'
    || input.verifiedEmail.length > 320
    || input.verifiedEmail !== input.verifiedEmail.trim().toLowerCase()
    || !EMAIL.test(input.verifiedEmail)
    || typeof activation.status !== 'string'
    || !ACTIVATION_STATUSES.has(activation.status as ActivationStatus)
    || typeof activation.revision !== 'number'
    || !Number.isSafeInteger(activation.revision)
    || activation.revision < 1) {
    return null
  }
  return Object.freeze({
    issuer: input.issuer,
    subject: input.subject,
    verifiedEmail: input.verifiedEmail,
    activation: Object.freeze({
      status: activation.status as ActivationStatus,
      revision: activation.revision,
    }),
  })
}

function encodeSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function decodeSubjectKey(value: unknown): string | null {
  if (typeof value !== 'string'
    || value.length < 4
    || value.length > 2048
    || value.length % 4 !== 0
    || !/^[0-9a-f]+$/.test(value)) return null
  let subject = ''
  for (let offset = 0; offset < value.length; offset += 4) {
    subject += String.fromCharCode(Number.parseInt(value.slice(offset, offset + 4), 16))
  }
  return isWellFormedIdentityLifecycleSubject(subject) ? subject : null
}

function snapshotSession(value: unknown): IdentitySessionReceipt | null {
  const session = snapshotExactDataRecord(value, SESSION_KEYS)
  if (!session || typeof session.id !== 'string' || !SESSION_ID.test(session.id)) return null
  const claims = snapshotExactDataRecord(session.claims, WIRE_STORED_CLAIM_KEYS)
  if (!claims) return null
  const subject = decodeSubjectKey(claims.subjectKey)
  if (subject === null) return null
  const input = snapshotInput({
    issuer: claims.issuer,
    subject,
    verifiedEmail: claims.verifiedEmail,
    activation: claims.activation,
  })
  const createdAt = parseCanonicalInstant(claims.createdAt)
  const expiresAt = parseCanonicalInstant(claims.expiresAt)
  if (!input || createdAt === null || expiresAt === null || expiresAt <= createdAt) return null
  return Object.freeze({
    id: session.id,
    claims: Object.freeze({ ...input, createdAt, expiresAt }),
  })
}

function samePrincipal(
  actual: IdentitySessionReceipt['claims'],
  expected: IdentitySessionClaims,
): boolean {
  return actual.issuer === expected.issuer
    && actual.subject === expected.subject
    && actual.verifiedEmail === expected.verifiedEmail
    && actual.activation.status === expected.activation.status
    && actual.activation.revision === expected.activation.revision
}

function parseCanonicalInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value ? parsed : null
}

function snapshotOptionalExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  allowedKeys: Keys,
): Partial<Record<Keys[number], unknown>> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype) return null
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key as Keys[number]))) return null
    const snapshot = Object.create(null) as Partial<Record<Keys[number], unknown>>
    for (const key of ownKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      snapshot[key as Keys[number]] = descriptor.value
    }
    return snapshot
  } catch {
    return null
  }
}

function snapshotExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  const snapshot = snapshotOptionalExactDataRecord(value, expectedKeys)
  if (!snapshot || Reflect.ownKeys(snapshot).length !== expectedKeys.length) return null
  return snapshot as Record<Keys[number], unknown>
}
