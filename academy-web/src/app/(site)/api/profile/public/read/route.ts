import { NextResponse } from 'next/server'
import { z } from 'zod/v3'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { createCoreHostClient } from '@/lib/profile/core-host-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
const schema = z.object({ shareId: z.string().regex(/^shr_[0-9a-f]{32}$/), secret: z.string().regex(/^[0-9a-f]{64}$/) }).strict()

export async function POST(request: Request) {
  if (new URL(request.url).search) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  if (!await hasEdgeRateLimitMarker(request, { secret: process.env.RATE_LIMIT_KEY_SECRET })) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers })
  }
  const valid = validateMutationRequest(request, { requireJson: true })
  if (!valid.ok) return NextResponse.json({ error: 'invalid_request' }, { status: valid.status, headers })
  const body = await readBoundedJson(request, 1_024)
  if (!body.ok) return NextResponse.json({ error: 'invalid_request' }, { status: body.reason === 'too-large' ? 413 : 400, headers })
  const parsed = schema.safeParse(body.value)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const client = createCoreHostClient()
  if (!client) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers })
  try {
    const share = await client.publicShare(parsed.data.shareId, parsed.data.secret)
    return NextResponse.json(share, { headers })
  } catch {
    // Wrong, missing, expired and revoked grants have the same public response.
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  }
}
