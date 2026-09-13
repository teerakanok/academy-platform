import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { checkAuthenticatedMutationQuota } from '@/lib/authenticated-mutation-quota'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { CONSENT_PRINCIPAL_ISSUER, delegateConsent, type ConsentOperation } from '@/lib/identity/consent-delegation'
import { parseAcademySessionCookie } from '@/lib/identity/session-store'
import { consentWithdrawalSchema } from './consent-contract'

const headers = { 'cache-control': 'no-store' }
const emptyBody = z.strictObject({})
const denied = (status: number) => NextResponse.json({ error: 'consent_unavailable' }, { status, headers })
export async function handleConsentRequest(request: Request, operation: ConsentOperation) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) return denied(mutation.status)
  if (!await hasEdgeRateLimitMarker(request, { secret: process.env.RATE_LIMIT_KEY_SECRET })) return denied(403)
  const parsed = await readBoundedJson(request, 2048)
  if (!parsed.ok) return denied(parsed.reason === 'too-large' ? 413 : 400)
  const body = operation === 'state' ? emptyBody.safeParse(parsed.value) : consentWithdrawalSchema.safeParse(parsed.value)
  if (!body.success) return denied(400)
  // A local legacy GoTrue fixture cannot become a delegated Identity principal.
  if (!parseAcademySessionCookie(request.headers.get('cookie'))) return denied(401)
  const user = await currentUser({ recordActivity: false })
  if (!user) return denied(401)
  if (user.account.issuer !== CONSENT_PRINCIPAL_ISSUER) return denied(403)
  const quota = await checkAuthenticatedMutationQuota({ operation: 'account-consent', accountId: user.account.id, courseSlug: 'account' })
  if (!quota.allowed) return NextResponse.json({ error: 'consent_unavailable' }, { status: quota.status,
    headers: { ...headers, ...(quota.status === 429 ? { 'retry-after': String(quota.retryAfterSeconds) } : {}) } })
  const result = await delegateConsent(operation, { issuer: user.account.issuer, subject: user.account.subject },
    operation === 'withdraw' ? consentWithdrawalSchema.parse(body.data) : undefined)
  if (!('state' in result)) return denied(result.status)
  return NextResponse.json(result.status === 409 ? { error: 'consent_revision_conflict', state: result.state } : result.state,
    { status: result.status, headers })
}
