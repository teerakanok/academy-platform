import { hasExactOkJsonResponse } from '@/lib/http/exact-ok-response'

export async function submitUnsubscribeRequest(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/leads/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return hasExactOkJsonResponse(response)
  } catch {
    return false
  }
}
