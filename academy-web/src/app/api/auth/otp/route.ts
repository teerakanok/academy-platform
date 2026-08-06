import { NextResponse } from 'next/server'
import { routeAuthClient } from '@/lib/auth/route-client'
import { allowRequest } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { hasEdgeRateLimitMarker } from '@/lib/edge-rate-limit-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { acceptsAuthTransport } from '@/lib/auth/cookie-policy'
import { legacyDirectOtpFixtureAllowedForRequest } from '@/lib/auth/legacy-direct-otp'

export const runtime = 'nodejs'
const MAX_BODY_BYTES = 2 * 1024

// ขอรหัสเข้าสู่ระบบทางอีเมล
//
// ตอบเหมือนกันเสมอไม่ว่าอีเมลนั้นมีบัญชีอยู่แล้วหรือไม่ — ถ้าตอบต่างกัน หน้านี้จะกลาย
// เป็นเครื่องมือให้ใครก็ได้ไล่ตรวจว่าอีเมลไหนสมัครกับเราไว้
export async function POST(request: Request) {
  if (!legacyDirectOtpFixtureAllowedForRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'ระบบบัญชีส่วนกลางยังไม่เปิดใช้สำหรับสภาพแวดล้อมนี้' },
      { status: 503 },
    )
  }
  if (!acceptsAuthTransport(request)) {
    return NextResponse.json({ ok: false, error: 'ต้องเชื่อมต่อผ่าน HTTPS' }, { status: 400 })
  }
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  if (!hasEdgeRateLimitMarker(request.headers) && !allowRequest(`otp:${clientKey(request)}`)) {
    return NextResponse.json({ ok: false, error: 'ขอรหัสถี่เกินไป ลองใหม่ในอีกสักครู่' }, { status: 429 })
  }

  const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
  if (!parsed.ok && parsed.reason === 'too-large') {
    return NextResponse.json({ ok: false, error: 'คำขอใหญ่เกินไป' }, { status: 413 })
  }
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }
  const body = parsed.value as { email?: unknown }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'กรุณาใส่อีเมลที่ถูกต้อง' }, { status: 400 })
  }

  const supabase = await routeAuthClient(request)
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })

  if (error) {
    console.error('[auth/otp] ส่งรหัสไม่สำเร็จ:', error.message)
    // ไม่ส่งข้อความจาก provider กลับไปตรงๆ — มันบอกใบ้สถานะของอีเมลได้
    return NextResponse.json({ ok: false, error: 'ส่งรหัสไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
