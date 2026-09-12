import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { checkAuthenticatedMutationQuota } from '@/lib/authenticated-mutation-quota'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'
const headers = { 'cache-control': 'no-store' }
const denied = (status: number) => NextResponse.json({ ok: false }, { status, headers })

export async function POST(request: Request) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) return denied(mutation.status)
  if (!await hasEdgeRateLimitMarker(request, { secret: process.env.RATE_LIMIT_KEY_SECRET })) return denied(403)
  const body = await readBoundedJson(request, 64)
  if (!body.ok) return denied(body.reason === 'too-large' ? 413 : 400)
  if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)
    || Object.keys(body.value).length !== 0) return denied(400)
  // Quota-rejected activity must not itself extend the idle clock.
  const user = await currentUser({ recordActivity: false })
  if (!user) return denied(401)
  const quota = await checkAuthenticatedMutationQuota({ operation: 'session-activity', accountId: user.account.id, courseSlug: 'academy' })
  if (!quota.allowed) return NextResponse.json({ ok: false }, { status: quota.status,
    headers: { ...headers, ...(quota.status === 429 ? { 'retry-after': String(quota.retryAfterSeconds) } : {}) } })
  const active = await currentUser()
  if (!active || active.account.id !== user.account.id) return denied(401)
  return NextResponse.json({ ok: true }, { headers })
}
