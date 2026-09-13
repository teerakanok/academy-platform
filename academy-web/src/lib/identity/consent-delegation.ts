import 'server-only'
import { z } from 'zod'
import { consentConflictSchema, consentStateSchema, consentWithdrawalSchema, type ConsentState, type ConsentWithdrawal } from '@/lib/account/consent-contract'
import { cancelResponseBody, readStrictJsonResponse } from '@/lib/http/strict-json-response'
import { projectAcademyIdentityProductionRuntimeConfig } from './production-runtime'

export const CONSENT_ORIGIN = 'https://accounts.cyberskills.co.th'
export const CONSENT_PRINCIPAL_ISSUER = 'https://supabase.cyberskills.co.th/auth/v1'
export const CONSENT_PATHS = { state: '/v1/consumer-consents/state', withdraw: '/v1/consumer-consents/withdraw' } as const
export type ConsentOperation = keyof typeof CONSENT_PATHS
const principalSchema = z.strictObject({ issuer: z.url().max(512), subject: z.uuid() })
export type ConsentPrincipal = z.infer<typeof principalSchema>
export type ConsentResult = { status: 200; state: ConsentState } | { status: 409; state: ConsentState }
  | { status: 403 | 503; error: 'consent_unavailable' }
const encoder = new TextEncoder()
function base64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
function encode(value: unknown) { return base64url(encoder.encode(JSON.stringify(value))) }
export function consentDigestInput(operation: ConsentOperation, principal: ConsentPrincipal, withdrawal?: ConsentWithdrawal): string {
  principalSchema.parse(principal)
  const input = operation === 'withdraw' ? consentWithdrawalSchema.parse(withdrawal) : null
  if (operation === 'state' && withdrawal !== undefined) throw new Error('Invalid consent request')
  return JSON.stringify([1, 'POST', CONSENT_PATHS[operation], 'academy-web', principal.issuer, principal.subject,
    input?.type ?? null, input?.operationId ?? null, input?.expectedRevision ?? null])
}
export async function signConsentAssertion(input: {
  operation: ConsentOperation; principal: ConsentPrincipal; withdrawal?: ConsentWithdrawal
  keyId: string; privateJwk: string; now?: number; jti?: string
}): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const jti = input.jti ?? base64url(crypto.getRandomValues(new Uint8Array(24)))
  if (!Number.isSafeInteger(now) || now < 0 || !/^[A-Za-z0-9_-]{16,160}$/.test(jti)
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(input.keyId)) throw new Error('Invalid consent signer')
  const tuple = consentDigestInput(input.operation, input.principal, input.withdrawal)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(tuple)))
  const requestDigest = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  const signingInput = `${encode({ alg: 'ES256', kid: input.keyId, typ: 'identity-consent-delegation-v1+jwt' })}.${encode({
    iss: 'academy-web', sub: 'academy-web', aud: CONSENT_ORIGIN + CONSENT_PATHS[input.operation],
    iat: now, exp: now + 60, jti, purpose: `consent.${input.operation}`, requestDigest,
  })}`
  const key = await crypto.subtle.importKey('jwk', JSON.parse(input.privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)))
  if (signature.length !== 64) throw new Error('Invalid consent signature')
  return `${signingInput}.${base64url(signature)}`
}

export async function delegateConsent(operation: ConsentOperation, principal: ConsentPrincipal, withdrawal?: ConsentWithdrawal, options: {
  environment?: Record<string, string | undefined>; fetch?: typeof fetch
} = {}): Promise<ConsentResult> {
  const unavailable = { status: 503, error: 'consent_unavailable' } as const
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  try {
    const config = projectAcademyIdentityProductionRuntimeConfig(options.environment ?? process.env)
    if (!config || !principalSchema.safeParse(principal).success || principal.issuer !== CONSENT_PRINCIPAL_ISSUER) return unavailable
    consentDigestInput(operation, principal, withdrawal)
    const assertion = await signConsentAssertion({ operation, principal, withdrawal,
      keyId: config.clientAssertionKeyId, privateJwk: config.clientAssertionPrivateJwk })
    const body = JSON.stringify({ version: 1, clientId: 'academy-web', principal, ...(withdrawal ?? {}) })
    if (encoder.encode(body).length > 4096) return unavailable
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Consent deadline')) }, 5000)
    })
    const transport = (options.fetch ?? fetch)(CONSENT_ORIGIN + CONSENT_PATHS[operation], {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
      body, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
    }).then(response => {
      if (controller.signal.aborted) cancelResponseBody(response)
      return response
    })
    const response = await Promise.race([transport, timeout])
    if (response.redirected || !/\bno-store\b/i.test(response.headers.get('cache-control') ?? '')
      || response.headers.has('set-cookie')) { cancelResponseBody(response); return unavailable }
    if (response.status === 403) { cancelResponseBody(response); return { status: 403, error: 'consent_unavailable' } }
    if (response.status !== 200 && response.status !== 409) { cancelResponseBody(response); return unavailable }
    const parsed = await readStrictJsonResponse(response, { maxBytes: 16384, maxDepth: 6, signal: controller.signal, timeoutMs: 5000 })
    if (!parsed.ok) return unavailable
    if (response.status === 409 && operation === 'withdraw') {
      const conflict = consentConflictSchema.safeParse(parsed.value)
      return conflict.success ? { status: 409, state: conflict.data.state } : unavailable
    }
    const state = consentStateSchema.safeParse(parsed.value)
    return state.success && response.status === 200 ? { status: 200, state: state.data } : unavailable
  } catch { return unavailable } finally { if (timer !== undefined) clearTimeout(timer) }
}
