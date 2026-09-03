import 'server-only'

import { academyDb } from '@/lib/db/server'
import { parseStrictJsonText, readStrictJsonResponse } from '@/lib/http/strict-json-response'

import type { AuthorizationRequest, IdentityClientAssertionProvider } from './adapter'
import { createIdentityClientAssertionJtiSource } from './client-assertion-jti-source'
import { createIdentityClientAssertionProvider } from './client-assertion-provider'
import { createIdentityClientAssertionWebCryptoSigner } from './client-assertion-webcrypto-signer'
import { createIdentityCodeExchangePort } from './code-exchange-port'
import { createIdentityCodeExchangeResultVerifierPort } from './code-exchange-result-verifier-port'
import { AcademyPostgresIdentityTransactionStore } from './postgres-transaction-store'
import { AcademyIdentityProfileActivationStore } from './profile-activation-store'
import { importIdentityResultKeySet } from './result-key-set-importer'
import { createAcademyIdentityRuntimeBrowserFlow, type AcademyIdentityRuntimeBrowserFlow } from './runtime-browser-flow'
import {
  AcademyPostgresIdentitySessionStore,
  type IdentityDurableSessionPort,
} from './postgres-session-store'

const ACCOUNT_CENTER_ORIGIN = 'https://accounts.cyberskills.co.th'
const CODE_EXCHANGE_ENDPOINT = 'https://accounts.cyberskills.co.th/v1/code/exchange'
const RESULT_ISSUER = 'https://accounts.cyberskills.co.th/v1/code/results'
const PRINCIPAL_ISSUER = 'https://accounts.cyberskills.co.th/auth/v1'
const CLIENT = Object.freeze({
  clientId: 'academy-web',
  redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
  serviceId: 'academy',
  audience: 'https://academy.cyberskills.co.th',
  expectedIssuer: PRINCIPAL_ISSUER,
  clientAssertionAudience: CODE_EXCHANGE_ENDPOINT,
})
const CONFIG_KEYS = [
  'IDENTITY_RUNTIME_ENABLED',
  'IDENTITY_RUNTIME_WIRED',
  'IDENTITY_RELEASE_APPROVAL',
  'IDENTITY_CODE_EXCHANGE_TIMEOUT_MS',
  'IDENTITY_CLIENT_ASSERTION_KEY_ID',
  'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK',
  'IDENTITY_RESULT_KEY_SET_DOCUMENT',
] as const
const AUTHORIZATION_KEYS = [
  'clientId', 'redirectUri', 'stateRef', 'nonce', 'codeChallenge', 'codeChallengeMethod', 'serviceId',
] as const
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/
const OPAQUE = /^[A-Za-z0-9_-]{16,160}$/
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const COORDINATE = /^[A-Za-z0-9_-]{43}$/
const FINGERPRINT = /^[a-f0-9]{64}$/
const MAX_JWK_BYTES = 4_096
const MAX_KEY_SET_BYTES = 64 * 1024

export type AcademyIdentityProductionRuntimeConfig = Readonly<{
  timeoutMs: number
  clientAssertionKeyId: string
  clientAssertionPrivateJwk: string
  resultKeySetDocument: string
}>

type RuntimeDependencies = {
  academyDb: () => AcademyIdentityRpcClient
  fetch: typeof globalThis.fetch
  createSigner: typeof createIdentityClientAssertionWebCryptoSigner
  importKeySet: typeof importIdentityResultKeySet
  now: () => Date
}

type AcademyIdentityRpcClient = {
  rpc(functionName: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown, error: unknown }>
}

export type AcademyIdentityProductionRuntimeOptions = {
  environment?: Record<string, string | undefined>
  dependencies?: Partial<RuntimeDependencies>
}

/**
 * The only server composition allowed to enable the released Academy runtime.
 * Values must all be explicitly present; absence remains the reversible kill switch.
 */
export function createAcademyIdentityProductionRuntimeBrowserFlow(
  options: AcademyIdentityProductionRuntimeOptions = {},
): AcademyIdentityRuntimeBrowserFlow | null {
  try {
    const config = projectAcademyIdentityProductionRuntimeConfig(options.environment ?? process.env)
    if (!config) return null

    const dependencies = resolveDependencies(options.dependencies)
    if (!dependencies) return null
    const db = dependencies.academyDb()
    const transactionStore = new AcademyPostgresIdentityTransactionStore(db)
    const profileActivationStore = new AcademyIdentityProfileActivationStore(db)
    const sessionStore = new AcademyPostgresIdentitySessionStore(db)

    return createAcademyIdentityRuntimeBrowserFlow({
      admission: { enabled: true, runtimeWired: true, releaseApproval: true },
      authorizationPort: createAcademyIdentityProductionAuthorizationPort(),
      client: CLIENT,
      clientAssertionProvider: createLazyClientAssertionProvider(config, dependencies),
      codeExchangePort: createIdentityCodeExchangePort({
        config: {
          enabled: true,
          releaseApproval: true,
          endpoint: CODE_EXCHANGE_ENDPOINT,
          clientAssertionAudience: CODE_EXCHANGE_ENDPOINT,
          timeoutMs: config.timeoutMs,
        },
        fetchPort: { fetch: observedCodeExchangeFetch(dependencies.fetch) },
        responseReader: {
          read(response: Response) {
            return readStrictJsonResponse(response, {
              maxBytes: 16 * 1024,
              maxDepth: 8,
              timeoutMs: config.timeoutMs,
            })
          },
        },
      }),
      codeExchangeResultVerifier: createLazyResultVerifier(config, dependencies),
      profileActivationStore,
      registration: { client: CLIENT, redirectUris: [CLIENT.redirectUri] },
      sessionStore,
      transactionStore,
    })
  } catch {
    return null
  }
}

/**
 * Read/revoke capability for the opaque Academy session created by the released
 * Identity Control flow. The same complete production admission gate applies,
 * so a partial or killed runtime never becomes an authentication path.
 */
export function createAcademyIdentityProductionSessionStore(
  options: AcademyIdentityProductionRuntimeOptions = {},
): Pick<IdentityDurableSessionPort, 'get' | 'revoke'> | null {
  try {
    if (!projectAcademyIdentityProductionRuntimeConfig(options.environment ?? process.env)) return null
    const db = (options.dependencies?.academyDb ?? academyDb)()
    return new AcademyPostgresIdentitySessionStore(db)
  } catch {
    return null
  }
}

/**
 * One sanitized line per outbound code exchange: status, cache directive, and elapsed
 * time only. Never the body, headers, assertion, or code.
 */
function observedCodeExchangeFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const startedAt = Date.now()
    try {
      const response = await fetchImpl(input, init)
      const noStore = /\bno-store\b/i.test(response.headers.get('cache-control') ?? '')
      console.warn(`[identity-code-exchange] response status=${response.status} no_store=${noStore}`
        + ` elapsed_ms=${Date.now() - startedAt}`)
      return response
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown'
      console.warn(`[identity-code-exchange] fetch_failed error=${name} elapsed_ms=${Date.now() - startedAt}`)
      throw error
    }
  }
}

/** Pure, duplicate-safe admission projection. It intentionally creates no capability. */
export function projectAcademyIdentityProductionRuntimeConfig(
  environment: Record<string, string | undefined>,
): AcademyIdentityProductionRuntimeConfig | null {
  try {
    const values = readConfiguration(environment)
    if (!values
      || values.IDENTITY_RUNTIME_ENABLED !== 'true'
      || values.IDENTITY_RUNTIME_WIRED !== 'true'
      || values.IDENTITY_RELEASE_APPROVAL !== 'true') return null

    const timeoutMs = parseCanonicalPositiveInteger(values.IDENTITY_CODE_EXCHANGE_TIMEOUT_MS)
    if (timeoutMs === null || timeoutMs > 5_000
      || !KEY_ID.test(values.IDENTITY_CLIENT_ASSERTION_KEY_ID)
      || !isCanonicalPrivateJwk(values.IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK)
      || !isAdmittedResultKeySetDocument(values.IDENTITY_RESULT_KEY_SET_DOCUMENT)) return null

    return Object.freeze({
      timeoutMs,
      clientAssertionKeyId: values.IDENTITY_CLIENT_ASSERTION_KEY_ID,
      clientAssertionPrivateJwk: values.IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK,
      resultKeySetDocument: values.IDENTITY_RESULT_KEY_SET_DOCUMENT,
    })
  } catch {
    return null
  }
}

function resolveDependencies(overrides: Partial<RuntimeDependencies> | undefined): RuntimeDependencies | null {
  const resolved: RuntimeDependencies = {
    academyDb: overrides?.academyDb ?? academyDb,
    fetch: overrides?.fetch ?? globalThis.fetch,
    createSigner: overrides?.createSigner ?? createIdentityClientAssertionWebCryptoSigner,
    importKeySet: overrides?.importKeySet ?? importIdentityResultKeySet,
    now: overrides?.now ?? (() => new Date()),
  }
  return typeof resolved.academyDb === 'function'
    && typeof resolved.fetch === 'function'
    && typeof resolved.createSigner === 'function'
    && typeof resolved.importKeySet === 'function'
    && typeof resolved.now === 'function'
    ? resolved
    : null
}

export function createAcademyIdentityProductionAuthorizationPort(): {
  startAuthorization(request: AuthorizationRequest): { authorizeUrl: string }
} {
  return Object.freeze({
    startAuthorization(requestValue: AuthorizationRequest) {
      const request = snapshotAuthorizationRequest(requestValue)
      const url = new URL('/sign-in', ACCOUNT_CENTER_ORIGIN)
      url.searchParams.set('client_id', request.clientId)
      url.searchParams.set('redirect_uri', request.redirectUri)
      url.searchParams.set('state', request.stateRef)
      url.searchParams.set('nonce', request.nonce)
      url.searchParams.set('code_challenge', request.codeChallenge)
      url.searchParams.set('code_challenge_method', request.codeChallengeMethod)
      url.searchParams.set('service_id', request.serviceId)
      return Object.freeze({ authorizeUrl: url.toString() })
    },
  })
}

function createLazyClientAssertionProvider(
  config: AcademyIdentityProductionRuntimeConfig,
  dependencies: RuntimeDependencies,
): IdentityClientAssertionProvider {
  let provider: Promise<IdentityClientAssertionProvider> | undefined
  return Object.freeze({
    async createClientAssertion(input: { audience: string }): Promise<string> {
      provider ??= dependencies.createSigner({
        clientId: CLIENT.clientId,
        purpose: 'code_exchange',
        keyId: config.clientAssertionKeyId,
        privateJwk: config.clientAssertionPrivateJwk,
      }).then((signer) => createIdentityClientAssertionProvider({
        clientId: CLIENT.clientId,
        purpose: 'code_exchange',
        audience: CODE_EXCHANGE_ENDPOINT,
        keyId: config.clientAssertionKeyId,
        lifetimeSeconds: 120,
        clock: { now: dependencies.now },
        jtiSource: createIdentityClientAssertionJtiSource(),
        signer,
      }))
      return provider.then((value) => value.createClientAssertion(input))
    },
  })
}

function createLazyResultVerifier(
  config: AcademyIdentityProductionRuntimeConfig,
  dependencies: RuntimeDependencies,
) {
  let verifier: ReturnType<typeof createIdentityCodeExchangeResultVerifierPort> | undefined
  let loading: Promise<ReturnType<typeof createIdentityCodeExchangeResultVerifierPort>> | undefined
  return Object.freeze({
    async verify(value: unknown, binding: Parameters<ReturnType<typeof createIdentityCodeExchangeResultVerifierPort>['verify']>[1]) {
      loading ??= dependencies.importKeySet(config.resultKeySetDocument).then((imported) => {
        if (imported.keySet.issuer !== RESULT_ISSUER) throw new Error('invalid key set')
        verifier = createIdentityCodeExchangeResultVerifierPort({
          clock: dependencies.now,
          clockSkewSeconds: 30,
          keySet: imported.keySet,
          maximumLifetimeSeconds: 120,
        })
        return verifier
      })
      return (await loading).verify(value, binding)
    },
  })
}

function readConfiguration(environment: Record<string, string | undefined>): Record<(typeof CONFIG_KEYS)[number], string> | null {
  const values = Object.create(null) as Record<(typeof CONFIG_KEYS)[number], string>
  for (const key of CONFIG_KEYS) {
    const value = environment[key]
    if (typeof value !== 'string' || value.length === 0) return null
    values[key] = value
  }
  return values
}

function parseCanonicalPositiveInteger(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isCanonicalPrivateJwk(text: string): boolean {
  const parsed = parseStrictJsonText(text, MAX_JWK_BYTES, 2)
  if (!parsed.ok || !isExactRecord(parsed.value, ['kty', 'crv', 'x', 'y', 'd'])) return false
  const value = parsed.value as Record<string, unknown>
  if (value.kty !== 'EC' || value.crv !== 'P-256'
    || !isCanonicalCoordinate(value.x) || !isCanonicalCoordinate(value.y) || !isCanonicalCoordinate(value.d)) return false
  return text === JSON.stringify({ kty: 'EC', crv: 'P-256', x: value.x, y: value.y, d: value.d })
}

function isAdmittedResultKeySetDocument(text: string): boolean {
  const parsed = parseStrictJsonText(text, MAX_KEY_SET_BYTES, 5)
  if (!parsed.ok || !isExactRecord(parsed.value, ['issuer', 'revision', 'keys', 'retiredKeyFingerprints', 'retiredKeyIds'])) return false
  const document = parsed.value as Record<string, unknown>
  if (document.issuer !== RESULT_ISSUER || !Number.isSafeInteger(document.revision)
    || (document.revision as number) < 1 || !Array.isArray(document.keys)
    || document.keys.length < 1 || document.keys.length > 3
    || !isSortedUnique(document.retiredKeyFingerprints, FINGERPRINT, 64)
    || !isSortedUnique(document.retiredKeyIds, KEY_ID, 64)) return false

  const keyIds = new Set<string>()
  let active = 0
  for (const entry of document.keys) {
    if (!isExactRecord(entry, ['keyId', 'algorithm', 'publicJwk', 'state'])) return false
    const key = entry as Record<string, unknown>
    if (key.algorithm !== 'ES256' || typeof key.keyId !== 'string' || !KEY_ID.test(key.keyId)
      || keyIds.has(key.keyId) || !['active', 'overlap', 'retired'].includes(key.state as string)
      || !isExactRecord(key.publicJwk, ['kty', 'crv', 'x', 'y'])) return false
    const publicJwk = key.publicJwk as Record<string, unknown>
    if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256'
      || !isCanonicalCoordinate(publicJwk.x) || !isCanonicalCoordinate(publicJwk.y)) return false
    keyIds.add(key.keyId)
    if (key.state === 'active') active += 1
  }
  return active === 1
}

function snapshotAuthorizationRequest(value: unknown): AuthorizationRequest {
  if (!isExactRecord(value, AUTHORIZATION_KEYS)) throw new Error('invalid authorization request')
  const request = value as Record<string, unknown>
  if (request.clientId !== CLIENT.clientId
    || request.redirectUri !== CLIENT.redirectUri
    || request.serviceId !== CLIENT.serviceId
    || request.codeChallengeMethod !== 'S256'
    || !isOpaque(request.stateRef)
    || !isOpaque(request.nonce)
    || !isCodeChallenge(request.codeChallenge)) throw new Error('invalid authorization request')
  return {
    clientId: request.clientId as string,
    redirectUri: request.redirectUri as string,
    stateRef: request.stateRef as string,
    nonce: request.nonce as string,
    codeChallenge: request.codeChallenge as string,
    codeChallengeMethod: 'S256',
    serviceId: request.serviceId as string,
  }
}

function isExactRecord(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  const actual = Reflect.ownKeys(value)
  return actual.length === keys.length
    && actual.every((key) => typeof key === 'string' && keys.includes(key))
    && keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    })
}

function isCanonicalCoordinate(value: unknown): value is string {
  if (typeof value !== 'string' || !COORDINATE.test(value)) return false
  try {
    const decoded = atob(`${value.replaceAll('-', '+').replaceAll('_', '/')}=`)
    return decoded.length === 32
      && btoa(decoded).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') === value
  } catch {
    return false
  }
}

function isOpaque(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE.test(value)
}

function isCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && CODE_CHALLENGE.test(value)
}

function isSortedUnique(value: unknown, pattern: RegExp, maximum: number): boolean {
  if (!Array.isArray(value) || value.length > maximum) return false
  return value.every((entry, index) => (
    typeof entry === 'string'
    && pattern.test(entry)
    && (index === 0 || value[index - 1] < entry)
  ))
}
