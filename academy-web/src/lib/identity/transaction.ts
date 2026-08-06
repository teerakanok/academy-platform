import { createHash, randomBytes } from 'node:crypto'
import type {
  ExchangeResult,
  AuthorizationRequest,
  IdentityAdapter,
  IdentityClientAssertionProvider,
} from './adapter'

const CALLBACK_KEYS = new Set(['code', 'state'])
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{16,160}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACTIVATION_STATUSES = new Set(['pending', 'active', 'suspended', 'deactivated'])

export interface LocalIdentityClient {
  clientId: string
  redirectUri: string
  serviceId: string
  audience: string
}

interface PendingIdentityTransaction {
  readonly state: string
  readonly codeVerifier: string
  readonly nonce: string
  readonly client: LocalIdentityClient
  readonly returnPath: string
  readonly expiresAt: number
}

export interface IdentityCallback {
  code: string
  state: string
}

export class IdentityTransactionError extends Error {
  constructor(
    message: string,
    readonly reason: 'unknown_state' | 'expired_state' | 'invalid_callback' | 'audience_mismatch' | 'invalid_result',
  ) {
    super(message)
    this.name = 'IdentityTransactionError'
  }
}

/**
 * Local-only transaction store for the fake adapter contract.
 *
 * Production needs a durable store supplied with the registered Identity Control
 * client. This deliberately receives every client value from its caller: Academy
 * must not invent a production client ID, callback, audience, or issuer.
 */
export class InMemoryIdentityTransactionStore {
  private readonly transactions = new Map<string, PendingIdentityTransaction>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor({ now = Date.now, ttlMs = 5 * 60_000 }: { now?: () => number; ttlMs?: number } = {}) {
    this.now = now
    this.ttlMs = ttlMs
  }

  create(input: Omit<PendingIdentityTransaction, 'expiresAt'>): PendingIdentityTransaction {
    const now = this.now()
    this.prune(now)
    const transaction = { ...input, expiresAt: now + this.ttlMs }
    this.transactions.set(transaction.state, transaction)
    return transaction
  }

  /** Atomically claim state before code exchange so a callback cannot replay it. */
  consume(state: string): PendingIdentityTransaction {
    const transaction = this.transactions.get(state)
    if (!transaction) throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')
    this.transactions.delete(state)
    if (this.now() >= transaction.expiresAt) {
      throw new IdentityTransactionError('state ของการเข้าสู่ระบบหมดอายุแล้ว', 'expired_state')
    }
    return transaction
  }

  private prune(now: number): void {
    for (const [state, transaction] of this.transactions) {
      if (transaction.expiresAt < now) this.transactions.delete(state)
    }
  }
}

function opaque(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function s256(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function requireLocalClient(client: LocalIdentityClient): void {
  if (!client.clientId || !client.serviceId || !client.audience) {
    throw new Error('local identity client ต้องมี clientId, serviceId และ audience ที่ระบุชัดเจน')
  }
  const redirect = new URL(client.redirectUri)
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && redirect.hostname === 'localhost')) {
    throw new Error('local identity callback ต้องเป็น HTTPS หรือ loopback HTTP เท่านั้น')
  }
}

function requireInternalReturnPath(returnPath: string): void {
  if (!returnPath.startsWith('/') || returnPath.startsWith('//') || returnPath.startsWith('/\\')) {
    throw new Error('identity transaction รับ return path ภายใน Academy เท่านั้น')
  }
}

/** Starts an authorization request without exposing the verifier or nonce to the browser. */
export function beginIdentityAuthorization(
  store: InMemoryIdentityTransactionStore,
  client: LocalIdentityClient,
  returnPath: string,
  newVerifier: () => string = () => opaque(48),
): { state: string; codeVerifier: string; request: AuthorizationRequest } {
  requireLocalClient(client)
  requireInternalReturnPath(returnPath)
  const state = opaque()
  const nonce = opaque()
  const codeVerifier = newVerifier()
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    throw new Error('PKCE verifier สำหรับ local transaction ไม่อยู่ในรูปแบบที่ contract อนุญาต')
  }

  const request: AuthorizationRequest = {
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    stateRef: state,
    nonce,
    codeChallenge: s256(codeVerifier),
    codeChallengeMethod: 'S256',
    serviceId: client.serviceId,
  }
  store.create({ state, codeVerifier, nonce, client: { ...client }, returnPath })
  return { state, codeVerifier, request }
}

/** Enforces the Account Center callback contract before any adapter call or log. */
export function parseIdentityCallback(url: URL): IdentityCallback {
  for (const key of url.searchParams.keys()) {
    if (!CALLBACK_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new IdentityTransactionError('callback ต้องมีเฉพาะ code และ state อย่างละหนึ่งค่า', 'invalid_callback')
    }
  }
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state || !OPAQUE_VALUE.test(code) || !OPAQUE_VALUE.test(state)) {
    throw new IdentityTransactionError('callback ต้องมี code และ state แบบ opaque ที่ถูกต้อง', 'invalid_callback')
  }
  return { code, state }
}

function validateExchangeResult(result: ExchangeResult, transaction: PendingIdentityTransaction): void {
  if (result.audience !== transaction.client.audience || result.serviceId !== transaction.client.serviceId) {
    throw new IdentityTransactionError('ผลการแลก code ไม่ได้ผูกกับ Academy client ที่เริ่ม transaction', 'audience_mismatch')
  }
  if (result.nonce !== transaction.nonce) {
    throw new IdentityTransactionError('nonce จากผลการแลก code ไม่ตรงกับ transaction', 'invalid_result')
  }
  if (!result.issuer || !result.subject || !EMAIL.test(result.verifiedEmail)) {
    throw new IdentityTransactionError('ผลการแลก code ไม่มี canonical principal หรือ verified email ที่ใช้ได้', 'invalid_result')
  }
  if (!ACTIVATION_STATUSES.has(result.activation.status) || !Number.isSafeInteger(result.activation.revision) || result.activation.revision < 1) {
    throw new IdentityTransactionError('ผลการแลก code มี activation state ที่ผิด contract', 'invalid_result')
  }
}

export async function completeIdentityCallback({
  adapter,
  store,
  client,
  callback,
  clientAssertionProvider,
}: {
  adapter: IdentityAdapter
  store: InMemoryIdentityTransactionStore
  client: LocalIdentityClient
  callback: IdentityCallback
  clientAssertionProvider: IdentityClientAssertionProvider
}): Promise<{ exchange: ExchangeResult; returnPath: string }> {
  const clientAssertion = await clientAssertionProvider.createClientAssertion()
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clientAssertion) || clientAssertion.length < 32 || clientAssertion.length > 4096) {
    throw new IdentityTransactionError('client assertion สำหรับการแลก code ไม่ตรง contract', 'invalid_result')
  }
  const transaction = store.consume(callback.state)
  if (
    transaction.client.clientId !== client.clientId ||
    transaction.client.redirectUri !== client.redirectUri ||
    transaction.client.serviceId !== client.serviceId ||
    transaction.client.audience !== client.audience
  ) {
    throw new IdentityTransactionError('state ถูกออกให้กับ Academy client คนละรายการ', 'audience_mismatch')
  }

  const exchange = await adapter.exchangeCode({
    clientId: transaction.client.clientId,
    clientAssertion,
    redirectUri: transaction.client.redirectUri,
    code: callback.code,
    codeVerifier: transaction.codeVerifier,
  })
  validateExchangeResult(exchange, transaction)
  return { exchange, returnPath: transaction.returnPath }
}
