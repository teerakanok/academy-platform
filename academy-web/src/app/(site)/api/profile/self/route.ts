import { NextResponse } from 'next/server'
import { z } from 'zod/v3'
import { createShareCommandSchema, revokeShareCommandSchema, setGoalCommandSchema } from '@/core-profile-ui/contracts'
import { currentUser } from '@/lib/auth/session'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { createCoreHostClient } from '@/lib/profile/core-host-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'no-store' }
const schema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('profile') }).strict(),
  z.object({ operation: z.literal('goal'), command: setGoalCommandSchema }).strict(),
  z.object({ operation: z.literal('share'), command: createShareCommandSchema }).strict(),
  z.object({ operation: z.literal('revoke'), shareId: z.string().regex(/^shr_[0-9a-f]{32}$/), command: revokeShareCommandSchema }).strict(),
])

export async function POST(request: Request) {
  const valid = validateMutationRequest(request, { requireJson: true })
  if (!valid.ok) return NextResponse.json({ error: 'invalid_request' }, { status: valid.status, headers })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  const body = await readBoundedJson(request, 12_288)
  if (!body.ok) return NextResponse.json({ error: 'invalid_request' }, { status: body.reason === 'too-large' ? 413 : 400, headers })
  // Avoid allocating a validation issue for every element in an oversized array.
  if (body.value && typeof body.value === 'object' && !Array.isArray(body.value)) {
    const command = (body.value as { command?: unknown }).command
    if (command && typeof command === 'object' && !Array.isArray(command)) {
      const skillIds = (command as { skillIds?: unknown }).skillIds
      if (Array.isArray(skillIds) && skillIds.length > 32) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
    }
  }
  const parsed = schema.safeParse(body.value)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const current = await currentUser()
  if (!current || current.account.issuer !== user.account.issuer || current.account.subject !== user.account.subject) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  }
  const client = createCoreHostClient()
  if (!client) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers })
  const principal = { issuer: current.account.issuer, subject: current.account.subject }
  try {
    const input = parsed.data
    const result = input.operation === 'profile' ? await client.profile(principal)
      : input.operation === 'goal' ? await client.goal(principal, input.command)
      : input.operation === 'share' ? await client.share(principal, input.command)
      : await client.revoke(principal, input.shareId, input.command.requestId)
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers })
  }
}
