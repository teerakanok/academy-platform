import { cancelResponseBody, hasExactOkJsonResponse } from '@/lib/http/exact-ok-response'

export interface WaitlistRequestInput {
  email: string
  consent: true
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  referrer?: string
}

export type WaitlistRequestResult =
  | { status: 'success' }
  | { status: 'rejected' }
  | { status: 'network-error' }

export async function submitWaitlistRequest(input: WaitlistRequestInput): Promise<WaitlistRequestResult> {
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      cancelResponseBody(response)
      return { status: 'rejected' }
    }
    return await hasExactOkJsonResponse(response)
      ? { status: 'success' }
      : { status: 'rejected' }
  } catch {
    return { status: 'network-error' }
  }
}
