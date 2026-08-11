import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import type {
  ExchangeResult,
  AuthorizationRequest,
  IdentityAdapter,
  IdentityClientAssertionProvider,
} from './adapter'
import { verifyIdentityCodeExchangeResult } from './code-exchange-result'
import { withExclusiveFileStoreLock } from './file-store-lock'

const CALLBACK_KEYS = new Set(['code', 'state'])
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{16,160}$/

export interface LocalIdentityClient {
  clientId: string
  redirectUri: string
  serviceId: string
  audience: string
  expectedIssuer: string
  clientAssertionAudience: string
}

export interface PendingIdentityTransaction {
  readonly state: string
  readonly codeVerifier: string
  readonly nonce: string
  readonly client: LocalIdentityClient
  readonly returnPath: string
  readonly expiresAt: number
}

export type PendingIdentityTransactionInput = Omit<PendingIdentityTransaction, 'expiresAt'>

export interface IdentityTransactionStore {
  create(input: PendingIdentityTransactionInput): PendingIdentityTransaction
  consume(state: string): PendingIdentityTransaction
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

  create(input: PendingIdentityTransactionInput): PendingIdentityTransaction {
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

export class IdentityTransactionStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdentityTransactionStoreError'
  }
}

interface PersistedTransactionFile {
  version: 1
  transactions: PendingIdentityTransaction[]
}

function isPersistedTransaction(value: unknown): value is PendingIdentityTransaction {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PendingIdentityTransaction>
  if (
    typeof candidate.state !== 'string' ||
    !OPAQUE_VALUE.test(candidate.state) ||
    typeof candidate.codeVerifier !== 'string' ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(candidate.codeVerifier) ||
    typeof candidate.nonce !== 'string' ||
    !OPAQUE_VALUE.test(candidate.nonce) ||
    typeof candidate.returnPath !== 'string' ||
    !isInternalReturnPath(candidate.returnPath) ||
    typeof candidate.expiresAt !== 'number' ||
    !Number.isSafeInteger(candidate.expiresAt) ||
    !candidate.client ||
    typeof candidate.client !== 'object'
  ) {
    return false
  }
  const client = candidate.client as Partial<LocalIdentityClient>
  return (
    typeof client.clientId === 'string' &&
    client.clientId.length > 0 &&
    typeof client.redirectUri === 'string' &&
    isAllowedRedirectUri(client.redirectUri) &&
    typeof client.serviceId === 'string' &&
    client.serviceId.length > 0 &&
    typeof client.audience === 'string' &&
    client.audience.length > 0 &&
    typeof client.expectedIssuer === 'string' &&
    client.expectedIssuer.length > 0 &&
    typeof client.clientAssertionAudience === 'string' &&
    client.clientAssertionAudience.length > 0
  )
}

/**
 * Local-only durable transaction store for restart-safe preparation.
 *
 * This is deliberately not wired into a Worker route: Cloudflare runtime state
 * must use the released Academy persistence boundary, not a local filesystem.
 */
export class FileIdentityTransactionStore implements IdentityTransactionStore {
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(
    private readonly filePath: string,
    { now = Date.now, ttlMs = 5 * 60_000 }: { now?: () => number; ttlMs?: number } = {},
  ) {
    if (!isAbsolute(filePath)) throw new IdentityTransactionStoreError('identity transaction store ต้องใช้ absolute file path')
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new IdentityTransactionStoreError('identity transaction store TTL ไม่ถูกต้อง')
    this.now = now
    this.ttlMs = ttlMs
  }

  create(input: PendingIdentityTransactionInput): PendingIdentityTransaction {
    return withExclusiveFileStoreLock(this.filePath, () => {
      const now = this.now()
      const state = this.read().filter((transaction) => transaction.expiresAt > now)
      const transaction = { ...input, expiresAt: now + this.ttlMs }
      state.push(transaction)
      this.write(state)
      return transaction
    })
  }

  consume(state: string): PendingIdentityTransaction {
    return withExclusiveFileStoreLock(this.filePath, () => {
      const transactions = this.read()
      const index = transactions.findIndex((transaction) => transaction.state === state)
      if (index === -1) throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')

      const [transaction] = transactions.splice(index, 1)
      // Persist the one-time claim before checking expiry. A failed callback can
      // never be replayed after a process restart, including at the expiry edge.
      this.write(transactions)
      if (this.now() >= transaction.expiresAt) {
        throw new IdentityTransactionError('state ของการเข้าสู่ระบบหมดอายุแล้ว', 'expired_state')
      }
      return transaction
    })
  }

  private read(): PendingIdentityTransaction[] {
    if (!existsSync(this.filePath)) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      throw new IdentityTransactionStoreError('identity transaction store อ่านข้อมูลไม่ได้')
    }
    if (!parsed || typeof parsed !== 'object') throw new IdentityTransactionStoreError('identity transaction store มีรูปแบบไม่ถูกต้อง')
    const file = parsed as Partial<PersistedTransactionFile>
    if (file.version !== 1 || !Array.isArray(file.transactions) || !file.transactions.every(isPersistedTransaction)) {
      throw new IdentityTransactionStoreError('identity transaction store มีรูปแบบไม่ถูกต้อง')
    }
    return file.transactions.map((transaction) => ({
      ...transaction,
      client: { ...transaction.client },
    }))
  }

  private write(transactions: PendingIdentityTransaction[]): void {
    const directory = dirname(this.filePath)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
    try {
      writeFileSync(
        temporaryPath,
        JSON.stringify({ version: 1, transactions } satisfies PersistedTransactionFile),
        { encoding: 'utf8', mode: 0o600 },
      )
      chmodSync(temporaryPath, 0o600)
      renameSync(temporaryPath, this.filePath)
      chmodSync(this.filePath, 0o600)
    } catch {
      try {
        unlinkSync(temporaryPath)
      } catch {
        // Best-effort cleanup; the original durable file remains untouched.
      }
      throw new IdentityTransactionStoreError('identity transaction store เขียนข้อมูลไม่ได้')
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
  if (!client.clientId || !client.serviceId || !client.audience || !client.expectedIssuer || !client.clientAssertionAudience) {
    throw new Error('local identity client ต้องมี clientId, serviceId, audience, expected issuer และ client assertion audience ที่ระบุชัดเจน')
  }
  if (!isAllowedRedirectUri(client.redirectUri)) {
    throw new Error('local identity callback ต้องเป็น HTTPS หรือ loopback HTTP เท่านั้น')
  }
}

function requireInternalReturnPath(returnPath: string): void {
  if (!isInternalReturnPath(returnPath)) {
    throw new Error('identity transaction รับ return path ภายใน Academy เท่านั้น')
  }
}

function isInternalReturnPath(returnPath: string): boolean {
  return returnPath.startsWith('/') && !returnPath.startsWith('//') && !returnPath.startsWith('/\\')
}

function isAllowedRedirectUri(value: string): boolean {
  try {
    const redirect = new URL(value)
    return redirect.protocol === 'https:' || (redirect.protocol === 'http:' && redirect.hostname === 'localhost')
  } catch {
    return false
  }
}

/** Starts an authorization request without exposing the verifier or nonce to the browser. */
export function beginIdentityAuthorization(
  store: IdentityTransactionStore,
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

export async function completeIdentityCallback({
  adapter,
  store,
  client,
  callback,
  clientAssertionProvider,
}: {
  adapter: IdentityAdapter
  store: IdentityTransactionStore
  client: LocalIdentityClient
  callback: IdentityCallback
  clientAssertionProvider: IdentityClientAssertionProvider
}): Promise<{ exchange: ExchangeResult; returnPath: string }> {
  const transaction = store.consume(callback.state)
  if (
    transaction.client.clientId !== client.clientId ||
    transaction.client.redirectUri !== client.redirectUri ||
    transaction.client.serviceId !== client.serviceId ||
    transaction.client.audience !== client.audience ||
    transaction.client.expectedIssuer !== client.expectedIssuer ||
    transaction.client.clientAssertionAudience !== client.clientAssertionAudience
  ) {
    throw new IdentityTransactionError('state ถูกออกให้กับ Academy client คนละรายการ', 'audience_mismatch')
  }

  const clientAssertion = await clientAssertionProvider.createClientAssertion({ audience: transaction.client.clientAssertionAudience })
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clientAssertion) || clientAssertion.length < 32 || clientAssertion.length > 4096) {
    throw new IdentityTransactionError('client assertion สำหรับการแลก code ไม่ตรง contract', 'invalid_result')
  }

  const exchangeValue = await adapter.exchangeCode({
    clientId: transaction.client.clientId,
    clientAssertion,
    redirectUri: transaction.client.redirectUri,
    code: callback.code,
    codeVerifier: transaction.codeVerifier,
  })
  const verified = verifyIdentityCodeExchangeResult(exchangeValue, {
    audience: transaction.client.audience,
    expectedIssuer: transaction.client.expectedIssuer,
    nonce: transaction.nonce,
    serviceId: transaction.client.serviceId,
  })
  if (!verified.ok) {
    if (verified.reason === 'audience_mismatch') {
      throw new IdentityTransactionError('ผลการแลก code ไม่ได้ผูกกับ Academy client ที่เริ่ม transaction', 'audience_mismatch')
    }
    throw new IdentityTransactionError('ผลการแลก code ไม่ตรงกับ contract', 'invalid_result')
  }
  return { exchange: verified.result, returnPath: transaction.returnPath }
}
