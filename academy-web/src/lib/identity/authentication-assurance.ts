/** Explicit v2/v3 claims; OTP never satisfies sensitive WebAuthn assurance. No local clock or transport iat may replace auth_time. */
export type IdentityAuthentication = { method: 'webauthn_uv' | 'email_otp'; auth_time: number }
export type IdentitySessionAssurance = IdentityAuthentication | { method: 'legacy_unknown' }
export const IDENTITY_AUTHENTICATION_RECEIPT_MAX_AGE_SECONDS = 330
export const IDENTITY_AUTHENTICATION_FUTURE_SKEW_SECONDS = 30
export const IDENTITY_SENSITIVE_AUTHENTICATION_MAX_AGE_SECONDS = 300
export const IDENTITY_SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
export const IDENTITY_SESSION_IDLE_SECONDS = 30 * 60

export function snapshotIdentityAuthentication(value: unknown): IdentityAuthentication | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype) return null
    const keys = Reflect.ownKeys(value)
    if (keys.length !== 2 || !keys.includes('method') || !keys.includes('auth_time')) return null
    const method = Reflect.getOwnPropertyDescriptor(value, 'method')
    const time = Reflect.getOwnPropertyDescriptor(value, 'auth_time')
    if (!method?.enumerable || !time?.enumerable || !('value' in method) || !('value' in time)
      || !['webauthn_uv', 'email_otp'].includes(method.value) || typeof time.value !== 'number'
      || !Number.isSafeInteger(time.value) || time.value < 0) return null
    return Object.freeze({ method: method.value as IdentityAuthentication['method'], auth_time: time.value })
  } catch { return null }
}

export function snapshotIdentitySessionAssurance(value: unknown): IdentitySessionAssurance | null {
  const verified = snapshotIdentityAuthentication(value)
  if (verified) return verified
  try {
    if (!value || typeof value !== 'object' || Reflect.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== 1) return null
    const method = Reflect.getOwnPropertyDescriptor(value, 'method')
    return method?.enumerable && 'value' in method && method.value === 'legacy_unknown'
      ? Object.freeze({ method: 'legacy_unknown' }) : null
  } catch { return null }
}

export function isAcceptableIdentityAuthenticationReceipt(value: unknown, nowSeconds: number): boolean {
  const authentication = snapshotIdentityAuthentication(value)
  return !!authentication && Number.isSafeInteger(nowSeconds) && nowSeconds >= 0
    && authentication.auth_time <= nowSeconds + IDENTITY_AUTHENTICATION_FUTURE_SKEW_SECONDS
    && nowSeconds - authentication.auth_time <= IDENTITY_AUTHENTICATION_RECEIPT_MAX_AGE_SECONDS
}

export function isFreshIdentityAssurance(value: unknown, nowSeconds: number): boolean {
  const authentication = snapshotIdentityAuthentication(value)
  return !!authentication && authentication.method === 'webauthn_uv' && Number.isSafeInteger(nowSeconds) && nowSeconds >= 0
    && nowSeconds - authentication.auth_time >= 0
    && nowSeconds - authentication.auth_time < IDENTITY_SENSITIVE_AUTHENTICATION_MAX_AGE_SECONDS
}



export class AcademyIdentityReauthenticationRequired extends Error {
  constructor() { super('Fresh authentication is required'); this.name = 'AcademyIdentityReauthenticationRequired' }
}

export function snapshotVersionedIdentityAuthentication(version: unknown, value: unknown): IdentityAuthentication | null {
  const authentication = snapshotIdentityAuthentication(value)
  return authentication && (version === 3 || (version === 2 && authentication.method === 'webauthn_uv')) ? authentication : null
}
