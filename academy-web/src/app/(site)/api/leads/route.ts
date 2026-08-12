import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { academyDb } from '@/lib/db/server'
import { CURRENT_CONSENT_VERSION } from '@/lib/consent'
import { allowRequest } from '@/lib/rate-limit'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { clientKey } from '@/lib/request-ip'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 10_000

// consent ต้องเป็น true จาก checkbox ที่ user ติ๊กเอง (ไม่ pre-tick — ดู WaitlistForm);
// consent_text_version ผูกฝั่ง server กับไฟล์ versioned เสมอ ไม่รับจาก client
const leadSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320)),
  consent: z.literal(true),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
  referrer: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  if (!hasEdgeRateLimitMarker(request.headers) && !allowRequest(`leads:${clientKey(request)}`)) {
    return NextResponse.json(
      { ok: false, error: 'ส่งคำขอถี่เกินไป โปรดลองใหม่ในอีกสักครู่' },
      { status: 429 },
    )
  }

  const body = await readBoundedJson(request, MAX_BODY_BYTES)
  if (!body.ok && body.reason === 'too-large') {
    return NextResponse.json({ ok: false, error: 'ขนาดคำขอเกินกำหนด' }, { status: 413 })
  }
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบ JSON ไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = leadSchema.safeParse(body.value)
  if (!parsed.success) {
    // sanitized: ตอบเฉพาะชื่อ field ที่ไม่ผ่าน — ไม่สะท้อน internal error/stack
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || 'body'))]
    return NextResponse.json(
      { ok: false, error: `ข้อมูลไม่ถูกต้อง: ${fields.join(', ')}` },
      { status: 400 },
    )
  }

  const { email, utmSource, utmMedium, utmCampaign, referrer } = parsed.data

  let db: ReturnType<typeof academyDb>
  try {
    db = academyDb()
  } catch (err) {
    console.error('[api/leads] DB config error:', err)
    return NextResponse.json(
      { ok: false, error: 'ระบบยังไม่พร้อมรับข้อมูล โปรดลองใหม่ภายหลัง' },
      { status: 500 },
    )
  }

  const { error } = await db.rpc('record_lead_consent', {
    p_email: email,
    p_consent_at: new Date().toISOString(),
    p_consent_text_version: CURRENT_CONSENT_VERSION,
    p_utm_source: utmSource ?? null,
    p_utm_medium: utmMedium ?? null,
    p_utm_campaign: utmCampaign ?? null,
    p_referrer: referrer ?? null,
  })

  if (error) {
    // DB ล้มจริงต้องตอบ fail จริง — ห้าม success ปลอม (บทเรียน Server Action
    // masked errors); รายละเอียด error อยู่ log ฝั่ง server เท่านั้น
    console.error('[api/leads] insert failed:', error.code, error.message)
    return NextResponse.json(
      { ok: false, error: 'บันทึกไม่สำเร็จ โปรดลองใหม่ภายหลัง' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
