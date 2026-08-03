import { NextResponse } from 'next/server'
import { routeAuthClient, safeNextPath } from '@/lib/auth/route-client'
import { allowRequest } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { acceptsAuthTransport } from '@/lib/auth/cookie-policy'

export const runtime = 'nodejs'
const MAX_BODY_BYTES = 4 * 1024

// ยืนยันรหัส 6 หลัก → ตั้ง session cookie
//
// rate limit สำคัญเป็นพิเศษตรงนี้: รหัส 6 หลักมีค่าที่เป็นไปได้แค่ล้านค่า
// ถ้าเดาได้ไม่จำกัด ความปลอดภัยของทั้งระบบเท่ากับศูนย์
export async function POST(request: Request) {
  if (!acceptsAuthTransport(request)) {
    return NextResponse.json({ ok: false, error: 'ต้องเชื่อมต่อผ่าน HTTPS' }, { status: 400 })
  }
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  if (!allowRequest(`verify:${clientKey(request)}`)) {
    return NextResponse.json({ ok: false, error: 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่' }, { status: 429 })
  }

  const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
  if (!parsed.ok && parsed.reason === 'too-large') {
    return NextResponse.json({ ok: false, error: 'คำขอใหญ่เกินไป' }, { status: 413 })
  }
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }
  const body = parsed.value as { email?: unknown; token?: unknown; next?: unknown }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const next = safeNextPath(typeof body?.next === 'string' ? body.next : null)

  if (!email || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ ok: false, error: 'รหัสต้องเป็นตัวเลข 6 หลัก' }, { status: 400 })
  }

  const supabase = await routeAuthClient(request)
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error || !data.session) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, next })
}
