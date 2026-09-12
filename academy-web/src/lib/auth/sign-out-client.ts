import { readSignOutResponse } from './account-response-client'
import { ACADEMY_SSO_SIGNOUT_URL } from './sso-signout-policy'
import { clearLocalLearnerState, notifySiblingTabsOfLocalLearnerClear } from '../privacy/local-learner-state'
import { cancelResponseBody, readStrictJsonResponse } from '../http/strict-json-response'

const SIGNOUT_TIMEOUT_MS = 5_000

/** Only confirms the current browser's Identity SSO session, never other products. */
export async function signOutIdentityBrowser(url: string): Promise<boolean> {
  if (url !== ACADEMY_SSO_SIGNOUT_URL) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SIGNOUT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
      mode: 'cors',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok || response.redirected || response.type === 'opaque') {
      cancelResponseBody(response)
      return false
    }
    const result = await readStrictJsonResponse(response, {
      maxBytes: 1024,
      maxDepth: 1,
      signal: controller.signal,
    })
    if (!result.ok || !result.value || typeof result.value !== 'object' || Array.isArray(result.value)) return false
    const record = result.value as Record<string, unknown>
    return Object.keys(record).length === 1 && record.signedOut === true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

/** Resolve navigation only after local revocation and the bounded SSO attempt finish. */
export async function signOutCurrentBrowser(): Promise<string> {
  clearLocalLearnerState()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SIGNOUT_TIMEOUT_MS)
  let result
  try {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST', redirect: 'error', credentials: 'same-origin',
      cache: 'no-store', signal: controller.signal,
    })
    result = await readSignOutResponse(response, controller.signal)
  } finally {
    clearTimeout(timeout)
  }
  if (!result) throw new Error('sign-out failed')
  notifySiblingTabsOfLocalLearnerClear()
  const ssoConfirmed = !result.ssoSignoutUrl || await signOutIdentityBrowser(result.ssoSignoutUrl)
  if (!ssoConfirmed) {
    return result.revocation === 'confirmed'
      ? '/sign-in?notice=sso-unconfirmed'
      : '/sign-in?notice=sign-out-unconfirmed'
  }
  return result.revocation === 'confirmed' ? '/' : '/sign-in?notice=local-only'
}
