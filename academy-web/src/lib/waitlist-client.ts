import { cancelResponseBody, readExactOkJsonResponse } from '@/lib/http/exact-ok-response'

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

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
const MAX_EMAIL_LENGTH = 320

export function normalizeWaitlistEmail(value: string): string | null {
  const email = value.trim()
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null
}

export async function submitWaitlistRequest(input: WaitlistRequestInput): Promise<WaitlistRequestResult> {
  const email = normalizeWaitlistEmail(input.email)
  if (email === null) return { status: 'rejected' }

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, email }),
    })
    if (!response.ok) {
      cancelResponseBody(response)
      return { status: 'rejected' }
    }
    const result = await readExactOkJsonResponse(response)
    if (result.status === 'success') return { status: 'success' }
    return result.status === 'read-error'
      ? { status: 'network-error' }
      : { status: 'rejected' }
  } catch {
    return { status: 'network-error' }
  }
}
