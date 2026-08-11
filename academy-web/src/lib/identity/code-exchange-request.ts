import type { IdentityCodeExchangeRequest as IdentityCodeExchangeRequestContract } from './adapter'

const REQUEST_KEYS = [
  'clientId',
  'clientAssertion',
  'redirectUri',
  'code',
  'codeVerifier',
] as const
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{16,160}$/
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

export type IdentityCodeExchangeRequest = IdentityCodeExchangeRequestContract

export function projectIdentityCodeExchangeRequest(
  value: unknown,
): IdentityCodeExchangeRequest | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      return null
    }
    const keys = Reflect.ownKeys(value)
    if (keys.length !== REQUEST_KEYS.length
      || keys.some((key) => typeof key !== 'string'
        || !REQUEST_KEYS.includes(key as (typeof REQUEST_KEYS)[number]))) {
      return null
    }

    const snapshot = Object.create(null) as Record<(typeof REQUEST_KEYS)[number], unknown>
    for (const key of REQUEST_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
      snapshot[key] = descriptor.value
    }

    if (typeof snapshot.clientId !== 'string'
      || snapshot.clientId.length < 1
      || snapshot.clientId.length > 80
      || typeof snapshot.clientAssertion !== 'string'
      || snapshot.clientAssertion.length < 32
      || snapshot.clientAssertion.length > 4096
      || !COMPACT_JWS.test(snapshot.clientAssertion)
      || typeof snapshot.redirectUri !== 'string'
      || !isAllowedRedirectUri(snapshot.redirectUri)
      || typeof snapshot.code !== 'string'
      || !OPAQUE_VALUE.test(snapshot.code)
      || typeof snapshot.codeVerifier !== 'string'
      || !CODE_VERIFIER.test(snapshot.codeVerifier)) {
      return null
    }

    return {
      clientId: snapshot.clientId,
      clientAssertion: snapshot.clientAssertion,
      redirectUri: snapshot.redirectUri,
      code: snapshot.code,
      codeVerifier: snapshot.codeVerifier,
    }
  } catch {
    return null
  }
}

function isAllowedRedirectUri(value: string): boolean {
  try {
    const redirect = new URL(value)
    return redirect.protocol === 'https:'
      || (redirect.protocol === 'http:' && redirect.hostname === 'localhost')
  } catch {
    return false
  }
}
