import { isAbsolute, join, resolve } from 'node:path'
import {
  cancelResponseBody,
  parseStrictJsonText,
  readStrictJsonResponse,
} from '@/lib/http/strict-json-response'
import type {
  AuthorizationRequest,
  ExchangeResult,
  IdentityCodeExchangePort,
  IdentityCodeExchangeRequest,
} from './adapter'
import { projectIdentityCodeExchangeRequest } from './code-exchange-request'
import {
  createIdentityCodeExchangeResultVerifierPort,
  IdentityCodeExchangeResultVerifierFailure,
  type IdentityCodeExchangeResultBinding,
  type IdentityCodeExchangeResultVerifierPort,
} from './code-exchange-result-verifier-port'
import { createIdentityResultKeySetCache, type IdentityResultKeySetCache } from './result-key-set-cache'
import {
  FileIdentitySessionStore,
  academySessionCookie,
  expireAcademySessionCookie,
  parseAcademySessionCookie,
} from './session-store'
import {
  FileIdentityTransactionStore,
  isCanonicalIdentityTransactionState,
  type LocalIdentityAuthorizationRegistration,
} from './transaction'
import { canonicalLocalIdentityOrigin, identityControlLocalFixtureAllowedForRequest } from './local-fixture'

const LOCAL_CLIENT_ASSERTION = [
  'eyJhbGciOiJFUzI1NiIsImtpZCI6ImxvY2FsIn0',
  'eyJhdWQiOiJpZGVudGl0eS1jb250cm9sIn0',
  'c3ludGhldGljLXNpZ25hdHVyZQ',
].join('.')
const LOCAL_ASSERTION_AUDIENCE = 'https://identity-control.local/v1/code/exchange'
const LOCAL_RESULT_ENVELOPE_ISSUER = 'https://identity.local.test/v1/code/results'
const SIGNED_RESULT_RESPONSE_KEYS = ['signedResult'] as const
const BROWSER_BINDING = /^[A-Za-z0-9_-]{16,160}$/

export class IdentityLocalRuntimeError extends Error {
  constructor() {
    super('Academy local Identity Control runtime failed')
    Object.defineProperty(this, 'name', { value: 'IdentityLocalRuntimeError', configurable: true })
  }
}

export type IdentityLocalRuntime = ReturnType<typeof createIdentityLocalRuntime>

export function createIdentityLocalRuntime(request: Pick<Request, 'url'>) {
  try {
    if (!identityControlLocalFixtureAllowedForRequest(request)) throw new IdentityLocalRuntimeError()
    const appOrigin = requireLocalOrigin(process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN)
    const accountCenterOrigin = requireLocalOrigin(
      process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN ?? 'http://localhost:5173',
    )
    const apiOrigin = requireLocalOrigin(
      process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_API_ORIGIN ?? 'http://localhost:8788',
    )
    const stateDirectory = process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_STATE_DIRECTORY
      ?? resolve(process.cwd(), '.local', 'identity-control')
    if (!isAbsolute(stateDirectory) || stateDirectory !== stateDirectory.trim()) {
      throw new IdentityLocalRuntimeError()
    }
    const redirectUri = `${appOrigin}/auth/callback`
    const client = {
      clientId: 'academy-web-local',
      redirectUri,
      serviceId: 'academy',
      audience: 'https://academy.local.test',
      expectedIssuer: 'https://identity.local.test/v1',
      clientAssertionAudience: LOCAL_ASSERTION_AUDIENCE,
    }
    const registration: LocalIdentityAuthorizationRegistration = {
      client,
      redirectUris: [redirectUri],
    }
    const transactionStore = new FileIdentityTransactionStore(join(stateDirectory, 'transactions.json'))
    const sessionStore = new FileIdentitySessionStore(join(stateDirectory, 'sessions.json'), { ttlMs: 24 * 60 * 60_000 })

    return {
      accountCenterOrigin,
      registration,
      client,
      transactionStore,
      sessionStore,
      codeExchangePort: createLocalCodeExchangePort(apiOrigin),
      resultVerifier: createLocalCodeExchangeResultVerifier(
        createLocalResultKeySetCache(apiOrigin),
      ),
      clientAssertionProvider: {
        async createClientAssertion(input: { audience: string }) {
          if (input.audience !== LOCAL_ASSERTION_AUDIENCE) throw new IdentityLocalRuntimeError()
          return LOCAL_CLIENT_ASSERTION
        },
      },
    }
  } catch {
    throw new IdentityLocalRuntimeError()
  }
}

export function localAccountCenterUrl(origin: string, request: AuthorizationRequest): URL {
  const url = new URL('/sign-in', origin)
  url.searchParams.set('client_id', request.clientId)
  url.searchParams.set('redirect_uri', request.redirectUri)
  url.searchParams.set('state', request.stateRef)
  url.searchParams.set('nonce', request.nonce)
  url.searchParams.set('code_challenge', request.codeChallenge)
  url.searchParams.set('code_challenge_method', request.codeChallengeMethod)
  url.searchParams.set('service_id', request.serviceId)
  return url
}

export function localIdentityBrowserBindingCookie(state: string, binding: string): string {
  if (!isCanonicalIdentityTransactionState(state) || !BROWSER_BINDING.test(binding)) {
    throw new IdentityLocalRuntimeError()
  }
  return `${browserBindingCookieName(state)}=${binding}; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=300`
}

export function expireLocalIdentityBrowserBindingCookie(state: string): string {
  if (!isCanonicalIdentityTransactionState(state)) throw new IdentityLocalRuntimeError()
  return `${browserBindingCookieName(state)}=; Path=/auth/callback; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readLocalIdentityBrowserBinding(cookieHeader: string | null, state: string): string | null {
  if (!cookieHeader || !isCanonicalIdentityTransactionState(state)) return null
  const expectedName = browserBindingCookieName(state)
  let count = 0
  let candidate: string | null = null
  for (const part of cookieHeader.split(';')) {
    const pair = part.trim()
    const separator = pair.indexOf('=')
    if ((separator === -1 ? pair : pair.slice(0, separator)).trim() !== expectedName) continue
    count += 1
    const value = separator === -1 ? '' : pair.slice(separator + 1).trim()
    candidate = BROWSER_BINDING.test(value) ? value : null
  }
  return count === 1 ? candidate : null
}

export function createLocalAcademySession(runtime: IdentityLocalRuntime, exchange: ExchangeResult): string {
  const created = runtime.sessionStore.create({
    issuer: exchange.issuer,
    subject: exchange.subject,
    verifiedEmail: exchange.verifiedEmail,
    activation: { ...exchange.activation },
  })
  return academySessionCookie(created.id, { secure: false, maxAge: 86_400 })
}

export function readLocalAcademySession(request: Request): ReturnType<FileIdentitySessionStore['get']> {
  if (!identityControlLocalFixtureAllowedForRequest(request)) return null
  try {
    const runtime = createIdentityLocalRuntime(request)
    const sessionId = parseAcademySessionCookie(request.headers.get('cookie'))
    return sessionId ? runtime.sessionStore.get(sessionId) : null
  } catch {
    return null
  }
}

export function revokeLocalAcademySession(request: Request): string {
  const runtime = createIdentityLocalRuntime(request)
  const sessionId = parseAcademySessionCookie(request.headers.get('cookie'))
  if (sessionId) runtime.sessionStore.revoke(sessionId)
  return expireAcademySessionCookie({ secure: false })
}

function browserBindingCookieName(state: string): string {
  return `academy_identity_binding_${state.slice(0, 32)}`
}

function requireLocalOrigin(value: string | undefined): string {
  const origin = canonicalLocalIdentityOrigin(value)
  if (!origin) throw new IdentityLocalRuntimeError()
  return origin
}

function createLocalCodeExchangePort(apiOrigin: string): IdentityCodeExchangePort {
  const endpoint = `${apiOrigin}/v1/code/exchange`
  const fetchMethod = globalThis.fetch
  if (typeof fetchMethod !== 'function') throw new IdentityLocalRuntimeError()
  return {
    async exchangeCode(value: IdentityCodeExchangeRequest): Promise<unknown> {
      let response: Response | undefined
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5_000)
      try {
        const request = projectIdentityCodeExchangeRequest(value)
        if (!request) throw new IdentityLocalRuntimeError()
        response = await fetchMethod(endpoint, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(request),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        })
        if (response.status !== 200
          || !(response.headers.get('cache-control') ?? '').toLowerCase().includes('no-store')) {
          cancelResponseBody(response)
          throw new IdentityLocalRuntimeError()
        }
        const parsed = await readStrictJsonResponse(response, { maxBytes: 16 * 1024, maxDepth: 8, timeoutMs: 5_000 })
        if (!parsed.ok) throw new IdentityLocalRuntimeError()
        return await parsed.value
      } catch {
        if (response) cancelResponseBody(response)
        throw new IdentityLocalRuntimeError()
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

function createLocalResultKeySetCache(apiOrigin: string): IdentityResultKeySetCache {
  const endpoint = `${apiOrigin}/v1/code/result-keys`
  const fetchMethod = globalThis.fetch
  if (typeof fetchMethod !== 'function') throw new IdentityLocalRuntimeError()
  return createIdentityResultKeySetCache({
    async load(): Promise<string> {
      let response: Response | undefined
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5_000)
      try {
        response = await fetchMethod(endpoint, {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        })
        if (response.status !== 200
          || !(response.headers.get('cache-control') ?? '').toLowerCase().includes('no-store')) {
          cancelResponseBody(response)
          throw new IdentityLocalRuntimeError()
        }
        const parsed = await readStrictJsonResponse(response, {
          maxBytes: 64 * 1024,
          maxDepth: 5,
          timeoutMs: 5_000,
        })
        if (!parsed.ok) throw new IdentityLocalRuntimeError()
        return JSON.stringify(parsed.value)
      } catch {
        if (response) cancelResponseBody(response)
        throw new IdentityLocalRuntimeError()
      } finally {
        clearTimeout(timeout)
      }
    },
    clock: Date.now,
    cooldownMs: 1_000,
    negativeCacheMs: 5_000,
  })
}

export function createLocalCodeExchangeResultVerifier(
  keySetCache: IdentityResultKeySetCache,
): IdentityCodeExchangeResultVerifierPort {
  return Object.freeze({
    async verify(
      value: unknown,
      binding: IdentityCodeExchangeResultBinding,
    ): Promise<ExchangeResult> {
      const signedResult = readSignedResult(value)
      const keyId = readEnvelopeKeyId(signedResult)
      const key = await keySetCache.resolve(LOCAL_RESULT_ENVELOPE_ISSUER, keyId)
      const importedKeySet = keySetCache.current()
      if (!key
        || !importedKeySet
        || importedKeySet.keySet.issuer !== LOCAL_RESULT_ENVELOPE_ISSUER
        || !importedKeySet.keySet.keys.some((candidate) => candidate.keyId === key.keyId)) {
        throw new IdentityCodeExchangeResultVerifierFailure()
      }
      const verifier = createIdentityCodeExchangeResultVerifierPort({
        clock: () => new Date(),
        clockSkewSeconds: 5,
        keySet: { ...importedKeySet.keySet, keys: [...importedKeySet.keySet.keys] },
        maximumLifetimeSeconds: 120,
      })
      return verifier.verify(value, binding)
    },
  })
}

function readSignedResult(value: unknown): string {
  if (!value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== SIGNED_RESULT_RESPONSE_KEYS.length
    || Reflect.ownKeys(value)[0] !== SIGNED_RESULT_RESPONSE_KEYS[0]
    || typeof (value as { signedResult?: unknown }).signedResult !== 'string') {
    throw new IdentityCodeExchangeResultVerifierFailure()
  }
  return (value as { signedResult: string }).signedResult
}

function readEnvelopeKeyId(signedResult: string): string {
  try {
    const [headerPart] = signedResult.split('.')
    if (!headerPart || headerPart.length > 512 || !/^[A-Za-z0-9_-]+$/.test(headerPart)) {
      throw new Error()
    }
    const base64 = headerPart.replace(/-/g, '+').replace(/_/g, '/')
    const headerText = atob(base64)
    const parsed = parseStrictJsonText(headerText, 512, 2)
    if (!parsed.ok
      || !parsed.value
      || typeof parsed.value !== 'object'
      || Array.isArray(parsed.value)
      || typeof (parsed.value as { kid?: unknown }).kid !== 'string') throw new Error()
    return (parsed.value as { kid: string }).kid
  } catch {
    throw new IdentityCodeExchangeResultVerifierFailure()
  }
}
