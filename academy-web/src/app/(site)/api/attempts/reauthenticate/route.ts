import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource, deniedAccessStatus } from '@/lib/account/course-access'
import { checkAuthenticatedMutationQuota } from '@/lib/authenticated-mutation-quota'
import { academyDb } from '@/lib/db/server'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'
const headers = { 'cache-control': 'no-store' }
const schema = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/), nodeId: z.string().min(1).max(120), attemptId: z.string().uuid() }).strict()
const denied = (status: number) => NextResponse.json({ ok: false }, { status, headers })

export async function POST(request: Request) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) return denied(mutation.status)
  if (!await hasEdgeRateLimitMarker(request, { secret: process.env.RATE_LIMIT_KEY_SECRET })) return denied(403)
  const body = await readBoundedJson(request, 2048)
  if (!body.ok) return denied(body.reason === 'too-large' ? 413 : 400)
  const input = schema.safeParse(body.value)
  if (!input.success) return denied(400)
  const user = await currentUser()
  if (!user) return denied(401)
  const { slug, nodeId, attemptId } = input.data
  const quota = await checkAuthenticatedMutationQuota({ operation: 'attempt-reauthentication', accountId: user.account.id, courseSlug: slug })
  if (!quota.allowed) return NextResponse.json({ ok: false }, { status: quota.status,
    headers: { ...headers, ...(quota.status === 429 ? { 'retry-after': String(quota.retryAfterSeconds) } : {}) } })
  const access = await authorizeCourseResource(user.account.id, slug, nodeId)
  if (!access.allowed) return denied(deniedAccessStatus(access))
  try {
  const { data, error } = await academyDb().rpc('inspect_attempt_reauthentication', {
    p_attempt_id: attemptId, p_user_id: user.account.id, p_course_slug: slug, p_node_id: nodeId,
  })
  if (error || !['active', 'completed', 'pending', 'invalid'].includes(data)) return denied(503)
  return NextResponse.json({ ok: true, attemptId, status: data }, { headers })
  } catch { return denied(503) }
}
