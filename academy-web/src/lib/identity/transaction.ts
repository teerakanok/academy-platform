import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import type {
  ExchangeResult,
  AuthorizationRequest,
  IdentityCodeExchangePort,
  IdentityClientAssertionProvider,
} from './adapter'
import { verifyIdentityCodeExchangeResult } from './code-exchange-result'
import { withExclusiveFileStoreLock } from './file-store-lock'

const CALLBACK_KEYS = new Set(['code', 'state'])
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{16,160}$/
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/
const LOCAL_CLIENT_KEYS = [
  'clientId',
  'redirectUri',
  'serviceId',
  'audience',
  'expectedIssuer',
  'clientAssertionAudience',
] as const
const AUTHORIZATION_REGISTRATION_KEYS = ['client', 'redirectUris'] as const
const MAX_REGISTERED_REDIRECT_URIS = 16
const TRANSACTION_INPUT_KEYS = [
  'state',
  'codeVerifier',
  'nonce',
  'browserBindingDigest',
  'client',
  'returnPath',
] as const
const PERSISTED_TRANSACTION_KEYS = [...TRANSACTION_INPUT_KEYS, 'expiresAt'] as const
const PERSISTED_FILE_KEYS = ['version', 'transactions'] as const

export interface LocalIdentityClient {
  clientId: string
  redirectUri: string
  serviceId: string
  audience: string
  expectedIssuer: string
  clientAssertionAudience: string
}

export interface LocalIdentityAuthorizationRegistration {
  readonly client: LocalIdentityClient
  readonly redirectUris: readonly string[]
}

export interface PendingIdentityTransaction {
  readonly state: string
  readonly codeVerifier: string
  readonly nonce: string
  readonly browserBindingDigest: string
  readonly client: LocalIdentityClient
  readonly returnPath: string
  readonly expiresAt: number
}

export type PendingIdentityTransactionInput = Omit<PendingIdentityTransaction, 'expiresAt'>

export interface IdentityTransactionStore {
  create(input: PendingIdentityTransactionInput): PendingIdentityTransaction | PromiseLike<PendingIdentityTransaction>
  consume(state: string, browserBinding: string): PendingIdentityTransaction | PromiseLike<PendingIdentityTransaction>
}

export interface IdentityCallback {
  code: string
  state: string
}

export class IdentityTransactionError extends Error {
  constructor(
    message: string,
    readonly reason: 'unknown_state' | 'expired_state' | 'browser_mismatch' | 'invalid_callback' | 'audience_mismatch' | 'invalid_result',
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
    const exactInput = snapshotPendingIdentityTransactionInput(input)
    const now = this.now()
    const existing = this.transactions.get(exactInput.state)
    if (existing && existing.expiresAt > now) {
      throw new IdentityTransactionStoreError('identity transaction store มี state ที่ยังใช้งานอยู่ซ้ำกัน')
    }
    this.prune(now)
    const transaction = transactionWithExpiry(exactInput, now + this.ttlMs)
    this.transactions.set(transaction.state, transaction)
    return cloneTransaction(transaction)
  }

  /** Atomically claim state before code exchange so a callback cannot replay it. */
  consume(state: string, browserBinding: string): PendingIdentityTransaction {
    const transaction = this.transactions.get(state)
    if (!transaction) throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')
    if (this.now() >= transaction.expiresAt) {
      this.transactions.delete(state)
      throw new IdentityTransactionError('state ของการเข้าสู่ระบบหมดอายุแล้ว', 'expired_state')
    }
    if (!matchesBrowserBinding(transaction.browserBindingDigest, browserBinding)) {
      throw new IdentityTransactionError('callback ไม่ได้มาจาก browser ที่เริ่มเข้าสู่ระบบ', 'browser_mismatch')
    }
    this.transactions.delete(state)
    return cloneTransaction(transaction)
  }

  private prune(now: number): void {
    for (const [state, transaction] of this.transactions) {
      if (transaction.expiresAt <= now) this.transactions.delete(state)
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
  version: 2
  transactions: PendingIdentityTransaction[]
}

function snapshotExactDataRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object') throw new Error('invalid record')
    const prototype = Reflect.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('invalid prototype')
    const ownKeys = Reflect.ownKeys(value)
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      throw new Error('invalid keys')
    }

    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('invalid descriptor')
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    throw new IdentityTransactionStoreError('identity transaction store รับข้อมูลที่มีรูปแบบไม่ถูกต้อง')
  }
}

function snapshotLocalIdentityClient(value: unknown): LocalIdentityClient {
  const candidate = snapshotExactDataRecord(value, LOCAL_CLIENT_KEYS)
  if (
    typeof candidate.clientId !== 'string' || candidate.clientId.length === 0 ||
    typeof candidate.redirectUri !== 'string' ||
    typeof candidate.serviceId !== 'string' || candidate.serviceId.length === 0 ||
    typeof candidate.audience !== 'string' || candidate.audience.length === 0 ||
    typeof candidate.expectedIssuer !== 'string' || candidate.expectedIssuer.length === 0 ||
    typeof candidate.clientAssertionAudience !== 'string' || candidate.clientAssertionAudience.length === 0
  ) {
    throw new IdentityTransactionStoreError('local identity client ต้องมีค่าที่ระบุชัดเจนครบถ้วน')
  }
  if (!isAllowedRedirectUri(candidate.redirectUri)) {
    throw new IdentityTransactionStoreError('local identity callback ต้องเป็น HTTPS หรือ loopback HTTP เท่านั้น')
  }
  return {
    clientId: candidate.clientId,
    redirectUri: candidate.redirectUri,
    serviceId: candidate.serviceId,
    audience: candidate.audience,
    expectedIssuer: candidate.expectedIssuer,
    clientAssertionAudience: candidate.clientAssertionAudience,
  }
}

function snapshotRegisteredRedirectUris(value: unknown): string[] {
  try {
    if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
      throw new Error('invalid redirect list')
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
    if (!lengthDescriptor || !('value' in lengthDescriptor)) {
      throw new Error('invalid redirect list length descriptor')
    }
    const lengthValue = lengthDescriptor.value
    if (
      !Number.isSafeInteger(lengthValue) ||
      typeof lengthValue !== 'number' ||
      lengthValue < 1 ||
      lengthValue > MAX_REGISTERED_REDIRECT_URIS
    ) {
      throw new Error('invalid redirect list length')
    }

    const length = lengthValue
    const ownKeys = Reflect.ownKeys(value)
    if (
      ownKeys.length !== length + 1 ||
      ownKeys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key)))
    ) {
      throw new Error('invalid redirect list keys')
    }

    const redirects: string[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'string') {
        throw new Error('invalid redirect entry')
      }
      if (!isCanonicalRegisteredRedirectUri(descriptor.value)) {
        throw new Error('invalid registered redirect')
      }
      redirects.push(descriptor.value)
    }
    if (new Set(redirects).size !== redirects.length) throw new Error('duplicate registered redirect')
    return redirects
  } catch {
    throw new IdentityTransactionStoreError('identity authorization registration มี redirect URI ไม่ถูกต้อง')
  }
}

function snapshotAuthorizationRegistration(value: unknown): LocalIdentityAuthorizationRegistration {
  const candidate = snapshotExactDataRecord(value, AUTHORIZATION_REGISTRATION_KEYS)
  const client = snapshotLocalIdentityClient(candidate.client)
  const redirectUris = snapshotRegisteredRedirectUris(candidate.redirectUris)
  if (!redirectUris.includes(client.redirectUri)) {
    throw new IdentityTransactionStoreError('identity authorization callback ไม่ตรงกับ registered redirect URI')
  }
  return { client, redirectUris }
}

export function snapshotPendingIdentityTransactionInput(value: unknown): PendingIdentityTransactionInput {
  const candidate = snapshotExactDataRecord(value, TRANSACTION_INPUT_KEYS)
  if (
    !isCanonicalIdentityTransactionState(candidate.state) ||
    typeof candidate.codeVerifier !== 'string' || !CODE_VERIFIER.test(candidate.codeVerifier) ||
    typeof candidate.nonce !== 'string' || !OPAQUE_VALUE.test(candidate.nonce) ||
    typeof candidate.browserBindingDigest !== 'string' ||
    decodeCanonicalSha256(candidate.browserBindingDigest) === null ||
    typeof candidate.returnPath !== 'string' || !isInternalReturnPath(candidate.returnPath)
  ) {
    throw new IdentityTransactionStoreError('identity transaction store รับข้อมูลที่มีรูปแบบไม่ถูกต้อง')
  }
  return {
    state: candidate.state,
    codeVerifier: candidate.codeVerifier,
    nonce: candidate.nonce,
    browserBindingDigest: candidate.browserBindingDigest,
    client: snapshotLocalIdentityClient(candidate.client),
    returnPath: candidate.returnPath,
  }
}

export function snapshotPendingIdentityTransaction(value: unknown): PendingIdentityTransaction {
  const candidate = snapshotExactDataRecord(value, PERSISTED_TRANSACTION_KEYS)
  const input = snapshotPendingIdentityTransactionInput({
    state: candidate.state,
    codeVerifier: candidate.codeVerifier,
    nonce: candidate.nonce,
    browserBindingDigest: candidate.browserBindingDigest,
    client: candidate.client,
    returnPath: candidate.returnPath,
  })
  if (typeof candidate.expiresAt !== 'number' || !Number.isSafeInteger(candidate.expiresAt)) {
    throw new IdentityTransactionStoreError('identity transaction store มีรูปแบบไม่ถูกต้อง')
  }
  return transactionWithExpiry(input, candidate.expiresAt)
}

function transactionWithExpiry(
  input: PendingIdentityTransactionInput,
  expiresAt: number,
): PendingIdentityTransaction {
  return {
    state: input.state,
    codeVerifier: input.codeVerifier,
    nonce: input.nonce,
    browserBindingDigest: input.browserBindingDigest,
    client: cloneLocalIdentityClient(input.client),
    returnPath: input.returnPath,
    expiresAt,
  }
}

function cloneLocalIdentityClient(client: LocalIdentityClient): LocalIdentityClient {
  return {
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    serviceId: client.serviceId,
    audience: client.audience,
    expectedIssuer: client.expectedIssuer,
    clientAssertionAudience: client.clientAssertionAudience,
  }
}

function cloneTransaction(transaction: PendingIdentityTransaction): PendingIdentityTransaction {
  return transactionWithExpiry({
    state: transaction.state,
    codeVerifier: transaction.codeVerifier,
    nonce: transaction.nonce,
    browserBindingDigest: transaction.browserBindingDigest,
    client: transaction.client,
    returnPath: transaction.returnPath,
  }, transaction.expiresAt)
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
    const exactInput = snapshotPendingIdentityTransactionInput(input)
    return withExclusiveFileStoreLock(this.filePath, () => {
      const now = this.now()
      const state = this.read().filter((transaction) => transaction.expiresAt > now)
      if (state.some((transaction) => transaction.state === exactInput.state)) {
        throw new IdentityTransactionStoreError('identity transaction store มี state ที่ยังใช้งานอยู่ซ้ำกัน')
      }
      const transaction = transactionWithExpiry(exactInput, now + this.ttlMs)
      state.push(transaction)
      this.write(state)
      return cloneTransaction(transaction)
    })
  }

  consume(state: string, browserBinding: string): PendingIdentityTransaction {
    return withExclusiveFileStoreLock(this.filePath, () => {
      const transactions = this.read()
      const index = transactions.findIndex((transaction) => transaction.state === state)
      if (index === -1) throw new IdentityTransactionError('ไม่พบ state หรือ state ถูกใช้ไปแล้ว', 'unknown_state')

      const transaction = transactions[index]
      if (this.now() >= transaction.expiresAt) {
        transactions.splice(index, 1)
        this.write(transactions)
        throw new IdentityTransactionError('state ของการเข้าสู่ระบบหมดอายุแล้ว', 'expired_state')
      }
      if (!matchesBrowserBinding(transaction.browserBindingDigest, browserBinding)) {
        throw new IdentityTransactionError('callback ไม่ได้มาจาก browser ที่เริ่มเข้าสู่ระบบ', 'browser_mismatch')
      }
      // Persist the one-time claim while the same lock still holds the verified
      // browser binding, so a mismatch cannot consume a legitimate callback.
      transactions.splice(index, 1)
      this.write(transactions)
      return cloneTransaction(transaction)
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
    try {
      const file = snapshotExactDataRecord(parsed, PERSISTED_FILE_KEYS)
      if (file.version !== 2 || !Array.isArray(file.transactions)) {
        throw new IdentityTransactionStoreError('identity transaction store มีรูปแบบไม่ถูกต้อง')
      }
      const transactions = file.transactions.map(snapshotPendingIdentityTransaction)
      if (new Set(transactions.map((transaction) => transaction.state)).size !== transactions.length) {
        throw new IdentityTransactionStoreError('identity transaction store มี state ซ้ำกัน')
      }
      return transactions
    } catch {
      throw new IdentityTransactionStoreError('identity transaction store มีรูปแบบไม่ถูกต้อง')
    }
  }

  private write(transactions: PendingIdentityTransaction[]): void {
    const directory = dirname(this.filePath)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
    try {
      writeFileSync(
        temporaryPath,
        JSON.stringify({
          version: 2,
          transactions: transactions.map(cloneTransaction),
        } satisfies PersistedTransactionFile),
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

function decodeCanonicalSha256(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !SHA256_BASE64URL.test(value)) return null
  const decoded = Buffer.from(value, 'base64url')
  return decoded.length === 32 && decoded.toString('base64url') === value ? decoded : null
}

export function isCanonicalIdentityTransactionState(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_VALUE.test(value)
}

export function digestIdentityBrowserBinding(browserBinding: unknown): string | null {
  if (typeof browserBinding !== 'string' || !OPAQUE_VALUE.test(browserBinding)) return null
  return createHash('sha256').update(browserBinding).digest('base64url')
}

function matchesBrowserBinding(expectedDigest: string, browserBinding: unknown): boolean {
  const expected = decodeCanonicalSha256(expectedDigest)
  const actualDigest = digestIdentityBrowserBinding(browserBinding)
  if (!expected || !actualDigest) return false
  const actual = Buffer.from(actualDigest, 'base64url')
  return timingSafeEqual(expected, actual)
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

function isCanonicalRegisteredRedirectUri(value: string): boolean {
  try {
    const redirect = new URL(value)
    return (
      redirect.href === value &&
      redirect.username === '' &&
      redirect.password === '' &&
      !value.includes('?') &&
      !value.includes('#') &&
      redirect.search === '' &&
      redirect.hash === '' &&
      (redirect.protocol === 'https:' || (redirect.protocol === 'http:' && redirect.hostname === 'localhost'))
    )
  } catch {
    return false
  }
}

/** Starts authorization and returns a separate raw binding for a future HttpOnly cookie setter. */
export async function beginIdentityAuthorization(
  store: IdentityTransactionStore,
  registration: LocalIdentityAuthorizationRegistration,
  returnPath: string,
  newVerifier: () => string = () => opaque(48),
): Promise<{ state: string; browserBinding: string; codeVerifier: string; request: AuthorizationRequest }> {
  const exactClient = snapshotAuthorizationRegistration(registration).client
  requireInternalReturnPath(returnPath)
  const state = opaque()
  const nonce = opaque()
  const browserBinding = opaque()
  const codeVerifier = newVerifier()
  if (!CODE_VERIFIER.test(codeVerifier)) {
    throw new Error('PKCE verifier สำหรับ local transaction ไม่อยู่ในรูปแบบที่ contract อนุญาต')
  }

  const request: AuthorizationRequest = {
    clientId: exactClient.clientId,
    redirectUri: exactClient.redirectUri,
    stateRef: state,
    nonce,
    codeChallenge: s256(codeVerifier),
    codeChallengeMethod: 'S256',
    serviceId: exactClient.serviceId,
  }
  await store.create({
    state,
    codeVerifier,
    nonce,
    browserBindingDigest: s256(browserBinding),
    client: cloneLocalIdentityClient(exactClient),
    returnPath,
  })
  return { state, browserBinding, codeVerifier, request }
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
  browserBinding,
  clientAssertionProvider,
}: {
  adapter: IdentityCodeExchangePort
  store: IdentityTransactionStore
  client: LocalIdentityClient
  callback: IdentityCallback
  browserBinding: string
  clientAssertionProvider: IdentityClientAssertionProvider
}): Promise<{ exchange: ExchangeResult; returnPath: string }> {
  const transaction = await store.consume(callback.state, browserBinding)
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
