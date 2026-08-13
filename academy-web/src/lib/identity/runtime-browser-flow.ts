import { safeNextPath } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'

import type { AuthorizationRequest } from './adapter'
import { createAcademyIdentityRuntimeCompletion } from './runtime-completion'
import { academySessionCookie } from './session-store'
import {
  beginIdentityAuthorization,
  parseIdentityCallback,
  type IdentityTransactionStore,
  type LocalIdentityAuthorizationRegistration,
} from './transaction'

const OPTION_KEYS = [
  'admission',
  'authorizationPort',
  'client',
  'clientAssertionProvider',
  'codeExchangePort',
  'profileActivationStore',
  'registration',
  'sessionStore',
  'transactionStore',
] as const
const AUTHORIZATION_RESULT_KEYS = ['authorizeUrl'] as const
const BROWSER_BINDING = /^[A-Za-z0-9_-]{16,160}$/
const OPAQUE_STATE = /^[A-Za-z0-9_-]{16,160}$/
const START_FAILURE = 'เริ่มเข้าสู่ระบบไม่ได้ในขณะนี้'
const CALLBACK_FAILURE = 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้'

type AuthorizationPort = {
  startAuthorization(request: AuthorizationRequest): unknown | PromiseLike<unknown>
}

export type AcademyIdentityRuntimeBrowserFlowResult =
  | {
      kind: 'redirect'
      status: 303
      location: string
      cookies: readonly string[]
    }
  | {
      kind: 'error'
      status: 400 | 403 | 415 | 503
      error: string
      cookies: readonly string[]
    }

export type AcademyIdentityRuntimeBrowserFlow = {
  start(request: Request): Promise<AcademyIdentityRuntimeBrowserFlowResult>
  complete(request: Request): Promise<AcademyIdentityRuntimeBrowserFlowResult>
}

export class AcademyIdentityRuntimeBrowserFlowUnavailableError extends Error {
  constructor() {
    super('Academy Identity runtime browser flow is unavailable')
    Object.defineProperty(this, 'name', {
      value: 'AcademyIdentityRuntimeBrowserFlowUnavailableError',
      configurable: true,
    })
  }
}

/**
 * Production-disabled browser orchestration. Endpoint, key, audience, durable
 * storage, and release authority all remain injected by a future composition.
 */
export function createAcademyIdentityRuntimeBrowserFlow(
  optionsValue: unknown,
): AcademyIdentityRuntimeBrowserFlow {
  try {
    const options = snapshotExactDataRecord(optionsValue, OPTION_KEYS)
    const completion = createAcademyIdentityRuntimeCompletion({
      admission: options.admission,
      transactionStore: options.transactionStore,
      codeExchangePort: options.codeExchangePort,
      profileActivationStore: options.profileActivationStore,
      sessionStore: options.sessionStore,
      client: options.client,
      clientAssertionProvider: options.clientAssertionProvider,
    })
    const createTransaction = bindMethod<IdentityTransactionStore['create']>(
      options.transactionStore,
      'create',
    )
    const startAuthorization = bindMethod<AuthorizationPort['startAuthorization']>(
      options.authorizationPort,
      'startAuthorization',
    )
    const registration = options.registration as LocalIdentityAuthorizationRegistration
    const startStore: IdentityTransactionStore = {
      create: createTransaction,
      consume() {
        throw new AcademyIdentityRuntimeBrowserFlowUnavailableError()
      },
    }

    return Object.freeze({
      async start(request: Request): Promise<AcademyIdentityRuntimeBrowserFlowResult> {
        try {
          if (!(request instanceof Request)) return errorResult(400, START_FAILURE)
          const mutation = validateMutationRequest(request)
          if (!mutation.ok) return errorResult(mutation.status, mutation.error)

          const form = await request.formData()
          if ([...form.keys()].length !== 1 || form.getAll('next').length !== 1) {
            return errorResult(400, 'คำขอเข้าสู่ระบบไม่ถูกต้อง')
          }
          const rawNext = form.get('next')
          if (typeof rawNext !== 'string') {
            return errorResult(400, 'คำขอเข้าสู่ระบบไม่ถูกต้อง')
          }

          const started = await beginIdentityAuthorization(
            startStore,
            registration,
            safeNextPath(rawNext),
          )
          const authorization = snapshotExactDataRecord(
            await startAuthorization(started.request),
            AUTHORIZATION_RESULT_KEYS,
          )
          if (!isCanonicalAuthorizationUrl(authorization.authorizeUrl)) {
            throw new Error(START_FAILURE)
          }
          return redirectResult(authorization.authorizeUrl, [
            browserBindingCookie(started.state, started.browserBinding),
          ])
        } catch {
          return errorResult(503, START_FAILURE)
        }
      },

      async complete(request: Request): Promise<AcademyIdentityRuntimeBrowserFlowResult> {
        let state: string | null = null
        try {
          if (!(request instanceof Request)) return errorResult(400, CALLBACK_FAILURE)
          const urlValue = request.url
          const headers = request.headers
          const cookieHeader = headers.get('cookie')
          const callbackUrl = new URL(urlValue)
          const callback = parseIdentityCallback(callbackUrl)
          state = callback.state
          const binding = readBrowserBindingCookie(cookieHeader, state)
          if (!binding) throw new Error(CALLBACK_FAILURE)

          const completed = await completion.complete({ callbackUrl, browserBinding: binding })
          return redirectResult(completed.returnPath, [
            academySessionCookie(completed.sessionId),
            expireBrowserBindingCookie(state),
          ])
        } catch {
          return errorResult(
            state === null ? 400 : 503,
            CALLBACK_FAILURE,
            state === null ? [] : [expireBrowserBindingCookie(state)],
          )
        }
      },
    })
  } catch {
    throw new AcademyIdentityRuntimeBrowserFlowUnavailableError()
  }
}

function browserBindingCookie(state: string, binding: string): string {
  if (!OPAQUE_STATE.test(state) || !BROWSER_BINDING.test(binding)) {
    throw new Error(START_FAILURE)
  }
  return [
    `${browserBindingCookieName(state)}=${binding}`,
    'Path=/auth/callback',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=300',
  ].join('; ')
}

function expireBrowserBindingCookie(state: string): string {
  if (!OPAQUE_STATE.test(state)) throw new Error(CALLBACK_FAILURE)
  return [
    `${browserBindingCookieName(state)}=`,
    'Path=/auth/callback',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ')
}

function readBrowserBindingCookie(cookieHeader: string | null, state: string): string | null {
  if (!cookieHeader || !OPAQUE_STATE.test(state)) return null
  const expectedName = browserBindingCookieName(state)
  let count = 0
  let binding: string | null = null
  for (const rawPair of cookieHeader.split(';')) {
    const pair = rawPair.trim()
    const separator = pair.indexOf('=')
    const name = (separator === -1 ? pair : pair.slice(0, separator)).trim()
    if (name !== expectedName) continue
    count += 1
    const value = separator === -1 ? '' : pair.slice(separator + 1).trim()
    binding = BROWSER_BINDING.test(value) ? value : null
  }
  return count === 1 ? binding : null
}

function browserBindingCookieName(state: string): string {
  return `academy_identity_binding_${state.slice(0, 32)}`
}

function isCanonicalAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.href === value
      && url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.hash === ''
  } catch {
    return false
  }
}

function redirectResult(
  location: string,
  cookies: readonly string[],
): AcademyIdentityRuntimeBrowserFlowResult {
  return Object.freeze({
    kind: 'redirect' as const,
    status: 303 as const,
    location,
    cookies: Object.freeze([...cookies]),
  })
}

function errorResult(
  status: 400 | 403 | 415 | 503,
  error: string,
  cookies: readonly string[] = [],
): AcademyIdentityRuntimeBrowserFlowResult {
  return Object.freeze({
    kind: 'error' as const,
    status,
    error,
    cookies: Object.freeze([...cookies]),
  })
}

function bindMethod<T extends (...args: never[]) => unknown>(
  owner: unknown,
  key: string,
): T {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) {
    throw new Error('invalid capability')
  }
  const method = Reflect.get(owner, key, owner)
  if (typeof method !== 'function') throw new Error('invalid capability')
  return ((...args: never[]) => Reflect.apply(method, owner, args)) as T
}

function snapshotExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('invalid record')
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error('invalid record')
  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    throw new Error('invalid record')
  }
  const snapshot = Object.create(null) as Record<string, unknown>
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('invalid record')
    }
    snapshot[key] = descriptor.value
  }
  return snapshot
}
