import 'server-only'

import { academyDb } from '@/lib/db/server'
import { parseStrictJsonText, readStrictJsonResponse } from '@/lib/http/strict-json-response'
import { createIdentityClientAssertionJtiSource } from './client-assertion-jti-source'
import { createIdentityClientAssertionProvider } from './client-assertion-provider'
import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from './consumer-policy'
import {
  createIdentityClientAssertionWebCryptoSigner,
} from './client-assertion-webcrypto-signer'
import { AcademyIdentityLifecyclePageStore } from './lifecycle-page-store'
import { createIdentityLifecyclePullResponseTransport } from './lifecycle-pull-response-transport'
import {
  runIdentityLifecyclePullCycle,
  type IdentityLifecyclePullCycleResult,
} from './lifecycle-pull-cycle'
import { createIdentityLifecyclePullTransport } from './lifecycle-pull-transport'
import {
  IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
  IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
} from './lifecycle-pull-lease'

const PRINCIPAL_ISSUER = 'https://supabase.cyberskills.co.th/auth/v1'
const CONSUMER_ID = 'academy-web'
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/
const COORDINATE = /^[A-Za-z0-9_-]{43}$/
const FINGERPRINT = /^[a-f0-9]{64}$/
const MAX_KEY_SET_CHARACTERS = 64 * 1024
const MAX_JWK_CHARACTERS = 4_096

export type AcademyIdentityLifecycleProductionConfig = Readonly<{
  approvedConfigRevision: number
  endpoint: string
  clientAssertionAudience: string
  envelopePolicy: {
    expectedIssuer: string
    expectedAudience: string
    clockSkewSeconds: number
    maximumLifetimeSeconds: number
    key: {
      keyId: string
      algorithm: 'ES256'
      publicJwk: JsonWebKey
    }
  }
  clientAssertionKeyId: string
  clientAssertionPrivateJwk: string
  requestedLimit: number
  leaseDurationMs: number
  workerId: string
  timeoutMs: number
}>

type RuntimeDependencies = {
  academyDb: () => IdentityLifecycleRpcClient
  fetch: typeof globalThis.fetch
  createSigner: typeof createIdentityClientAssertionWebCryptoSigner
  now: () => Date
}

type IdentityLifecycleRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown, error: unknown }>
}

export type AcademyIdentityLifecycleProductionRuntimeOptions = {
  environment?: Record<string, string | undefined>
  dependencies?: Partial<RuntimeDependencies>
}

export function projectAcademyIdentityLifecycleProductionConfig(
  environmentValue: Record<string, string | undefined>,
): AcademyIdentityLifecycleProductionConfig | null {
  try {
    const enabled = environmentValue.IDENTITY_LIFECYCLE_ENABLED
    const endpoint = environmentValue.IDENTITY_LIFECYCLE_PUBLISHER_ENDPOINT
    const clientAssertionAudience = environmentValue.IDENTITY_LIFECYCLE_CLIENT_ASSERTION_AUDIENCE
    const eventAudience = environmentValue.IDENTITY_LIFECYCLE_EVENT_AUDIENCE
    const clientAssertionKeyId = environmentValue.IDENTITY_LIFECYCLE_CLIENT_ASSERTION_KEY_ID
    const privateJwk = environmentValue.IDENTITY_LIFECYCLE_CLIENT_ASSERTION_PRIVATE_JWK
    const keySetDocument = environmentValue.IDENTITY_LIFECYCLE_VERIFICATION_KEY_SET_DOCUMENT
    const workerId = environmentValue.IDENTITY_LIFECYCLE_WORKER_ID
    if (typeof clientAssertionKeyId !== 'string' || typeof workerId !== 'string') return null
    if (enabled !== 'true'
      || !isExactHttpsUrl(endpoint)
      || !isExactHttpsUrl(clientAssertionAudience)
      || !isExactHttpsUrl(eventAudience)
      || !KEY_ID.test(clientAssertionKeyId ?? '')
      || !WORKER_ID.test(workerId ?? '')
      || !isCanonicalPrivateJwk(privateJwk)) return null

    const requestedLimit = parseBoundedInteger(
      environmentValue.IDENTITY_LIFECYCLE_REQUEST_LIMIT ?? '50',
      1,
      100,
    )
    const leaseDurationMs = parseBoundedInteger(
      environmentValue.IDENTITY_LIFECYCLE_LEASE_DURATION_MS ?? '30000',
      IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
      IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
    )
    const timeoutMs = parseBoundedInteger(
      environmentValue.IDENTITY_LIFECYCLE_TIMEOUT_MS ?? '1000',
      100,
      5_000,
    )
    const key = parseActiveLifecycleKey(keySetDocument)
    if (!requestedLimit || !leaseDurationMs || !timeoutMs || !key) return null

    return Object.freeze({
      approvedConfigRevision: APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.client.configRevision,
      endpoint,
      clientAssertionAudience,
      envelopePolicy: Object.freeze({
        expectedIssuer: PRINCIPAL_ISSUER,
        expectedAudience: eventAudience,
        clockSkewSeconds: 30,
        maximumLifetimeSeconds: 120,
        key,
      }),
      clientAssertionKeyId,
      clientAssertionPrivateJwk: privateJwk,
      requestedLimit,
      leaseDurationMs,
      workerId,
      timeoutMs,
    })
  } catch {
    return null
  }
}

export async function createAcademyIdentityLifecyclePullCycleRuntime(
  options: AcademyIdentityLifecycleProductionRuntimeOptions = {},
): Promise<(() => Promise<IdentityLifecyclePullCycleResult>) | null> {
  const environment = options.environment ?? process.env
  if (environment.IDENTITY_LIFECYCLE_ENABLED !== 'true') return null
  const config = projectAcademyIdentityLifecycleProductionConfig(environment)
  if (!config) {
    throw new Error('Identity lifecycle production configuration is incomplete')
  }
  try {
    const dependencies = resolveDependencies(options.dependencies)
    if (!dependencies) throw new Error('invalid runtime dependencies')

    const signer = await dependencies.createSigner({
      clientId: CONSUMER_ID,
      purpose: 'lifecycle_pull',
      keyId: config.clientAssertionKeyId,
      privateJwk: config.clientAssertionPrivateJwk,
    })
    const responseTransport = createIdentityLifecyclePullResponseTransport({
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs,
      fetchPort: { fetch: dependencies.fetch },
    })
    const transport = createIdentityLifecyclePullTransport({
      consumerId: CONSUMER_ID,
      clientAssertionAudience: config.clientAssertionAudience,
      requestedLimit: config.requestedLimit,
      clientAssertionProvider: createIdentityClientAssertionProvider({
        clientId: CONSUMER_ID,
        purpose: 'lifecycle_pull',
        audience: config.clientAssertionAudience,
        keyId: config.clientAssertionKeyId,
        lifetimeSeconds: 120,
        clock: { now: dependencies.now },
        jtiSource: createIdentityClientAssertionJtiSource(),
        signer,
      }),
      responseTransport,
      responseReader: {
        read(response: Response) {
          return readStrictJsonResponse(response, {
            maxBytes: 512 * 1024,
            maxDepth: 8,
            timeoutMs: config.timeoutMs,
          })
        },
      },
      envelopePolicy: config.envelopePolicy,
    })
    const store = new AcademyIdentityLifecyclePageStore(dependencies.academyDb())
    return async () => {
      await store.reconcileApprovedConfigurationRevision(config.approvedConfigRevision)
      return runIdentityLifecyclePullCycle({
        store,
        transport,
        clock: { now: dependencies.now },
        approvedConfigRevision: config.approvedConfigRevision,
        workerId: config.workerId,
        leaseDurationMs: config.leaseDurationMs,
      })
    }
  } catch {
    throw new Error('Identity lifecycle runtime initialization failed')
  }
}

export async function runAcademyIdentityLifecyclePull(
  environment: Record<string, string | undefined>,
): Promise<IdentityLifecyclePullCycleResult | { outcome: 'disabled' }> {
  const pull = await createAcademyIdentityLifecyclePullCycleRuntime({ environment })
  if (!pull) return { outcome: 'disabled' }
  return pull()
}

function resolveDependencies(
  overrides: Partial<RuntimeDependencies> | undefined,
): RuntimeDependencies | null {
  const dependencies: RuntimeDependencies = {
    academyDb: overrides?.academyDb ?? academyDb,
    fetch: overrides?.fetch ?? globalThis.fetch,
    createSigner: overrides?.createSigner ?? createIdentityClientAssertionWebCryptoSigner,
    now: overrides?.now ?? (() => new Date()),
  }
  return typeof dependencies.academyDb === 'function'
    && typeof dependencies.fetch === 'function'
    && typeof dependencies.createSigner === 'function'
    && typeof dependencies.now === 'function'
    ? dependencies
    : null
}

function parseActiveLifecycleKey(
  documentValue: string | undefined,
): AcademyIdentityLifecycleProductionConfig['envelopePolicy']['key'] | null {
  const parsed = parseStrictJsonText(documentValue ?? '', MAX_KEY_SET_CHARACTERS, 8)
  if (!parsed.ok) return null
  const document = exactRecord(parsed.value, [
    'issuer', 'keys', 'retiredKeyFingerprints', 'retiredKeyIds', 'revision',
  ])
  if (!document
    || document.issuer !== PRINCIPAL_ISSUER
    || !Number.isSafeInteger(document.revision as unknown)
    || (document.revision as unknown as number) < 1
    || !Array.isArray(document.keys)
    || document.keys.length < 1
    || document.keys.length > 3
    || !isSortedUniqueStringList(document.retiredKeyFingerprints, FINGERPRINT, 64)) return null
  const retiredKeyIds = document.retiredKeyIds
  if (!isSortedUniqueStringList(retiredKeyIds, KEY_ID, 64)) return null

  const active = document.keys.filter((entry) => exactRecord(entry, [
    'algorithm', 'keyId', 'publicJwk', 'state',
  ]))
  const activeKeys = active.filter((entry) => {
    const record = entry as Record<string, unknown>
    return record.algorithm === 'ES256' && record.state === 'active'
  })
  if (active.length !== document.keys.length || activeKeys.length !== 1) return null
  const entry = activeKeys[0] as Record<string, unknown>
  if (typeof entry.keyId !== 'string'
    || !KEY_ID.test(entry.keyId)
    || ((entry.state === 'retired') !== retiredKeyIds.includes(entry.keyId))) return null
  const jwk = exactRecord(entry.publicJwk, ['crv', 'kty', 'x', 'y'])
  if (!jwk
    || jwk.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || typeof jwk.x !== 'string'
    || !COORDINATE.test(jwk.x)
    || typeof jwk.y !== 'string'
    || !COORDINATE.test(jwk.y)) return null
  return {
    keyId: entry.keyId as string,
    algorithm: 'ES256',
    publicJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: jwk.x,
      y: jwk.y,
    },
  }
}

function isCanonicalPrivateJwk(value: string | undefined): value is string {
  if (!value || value.length > MAX_JWK_CHARACTERS) return false
  const parsed = parseStrictJsonText(value, MAX_JWK_CHARACTERS, 3)
  if (!parsed.ok) return false
  const jwk = exactRecord(parsed.value, ['crv', 'd', 'kty', 'x', 'y'])
  return !!jwk
    && jwk.kty === 'EC'
    && jwk.crv === 'P-256'
    && typeof jwk.x === 'string'
    && COORDINATE.test(jwk.x)
    && typeof jwk.y === 'string'
    && COORDINATE.test(jwk.y)
    && typeof jwk.d === 'string'
    && COORDINATE.test(jwk.d)
}

function parseBoundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): number | null {
  if (!value || !/^(?:0|[1-9][0-9]{0,8})$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null
  const actual = Reflect.ownKeys(value)
  if (actual.length !== keys.length
    || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) return null
  const record = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    record[key] = descriptor.value
  }
  return record
}

function isSortedUniqueStringList(
  value: unknown,
  pattern: RegExp,
  maximum: number,
): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every((entry, index) => (
      typeof entry === 'string'
      && pattern.test(entry)
      && (index === 0 || value[index - 1] < entry)
    ))
}

function isExactHttpsUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && url.toString() === value
  } catch {
    return false
  }
}
