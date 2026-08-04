import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { academyDb } from '@/lib/db/server'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { allowRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 1_000
const schema = z.object({ token: z.string().uuid() })

function clientKey(request: NextRequest): string {
  const edgeIp = request.headers.get('cf-connecting-ip')?.trim()
  const localIp = process.env.NODE_ENV !== 'production'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : null
  return `unsubscribe:${edgeIp || localIp || 'unknown'}`
}

export async function POST(request: NextRequest) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }
  if (!allowRequest(clientKey(request))) {
    return NextResponse.json({ ok: false, error: 'โปรดลองใหม่ในอีกสักครู่' }, { status: 429 })
  }

  const body = await readBoundedJson(request, MAX_BODY_BYTES)
  if (!body.ok && body.reason === 'too-large') {
    return NextResponse.json({ ok: false, error: 'ขนาดคำขอเกินกำหนด' }, { status: 413 })
  }
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }
  const parsed = schema.safeParse(body.value)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'ลิงก์ยกเลิกไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const db = academyDb()
    const { error } = await db.rpc('withdraw_marketing_consent', {
      p_unsubscribe_token: parsed.data.token,
      p_withdrawn_at: new Date().toISOString(),
    })
    if (error) {
      console.error('[api/leads/unsubscribe] update failed:', error.code, error.message)
      return NextResponse.json({ ok: false, error: 'ดำเนินการไม่สำเร็จ โปรดลองใหม่ภายหลัง' }, { status: 502 })
    }
  } catch (err) {
    console.error('[api/leads/unsubscribe] DB config error:', err)
    return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม โปรดลองใหม่ภายหลัง' }, { status: 500 })
  }

  // Invalid, expired, and already-used bearer tokens deliberately share the same
  // success response so this public endpoint cannot be used to enumerate leads.
  return NextResponse.json({ ok: true }, { status: 200 })
}
