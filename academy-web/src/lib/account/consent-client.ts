import { consentConflictSchema, consentStateSchema, type ConsentState, type ConsentWithdrawal } from './consent-contract'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'

export type ConsentClientResult = { kind: 'loaded' | 'conflict'; state: ConsentState } | { kind: 'unavailable' }
export async function requestConsent(withdrawal?: ConsentWithdrawal): Promise<ConsentClientResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`/api/account/consents/${withdrawal ? 'withdraw' : 'state'}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(withdrawal ?? {}),
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
    })
    const parsed = await readStrictJsonResponse(response, { maxBytes: 16384, maxDepth: 6, signal: controller.signal })
    if (!parsed.ok) return { kind: 'unavailable' }
    if (response.status === 409 && withdrawal) {
      const conflict = consentConflictSchema.safeParse(parsed.value)
      return conflict.success ? { kind: 'conflict', state: conflict.data.state } : { kind: 'unavailable' }
    }
    const state = consentStateSchema.safeParse(parsed.value)
    return response.status === 200 && state.success ? { kind: 'loaded', state: state.data } : { kind: 'unavailable' }
  } catch { return { kind: 'unavailable' } } finally { clearTimeout(timer) }
}
