import { NextResponse } from 'next/server'
import { routeAuthClient, safeNextPath } from '@/lib/auth/route-client'
import { allowRequest } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const runtime = 'nodejs'

// ยืนยันรหัส 6 หลัก → ตั้ง session cookie
//
// rate limit สำคัญเป็นพิเศษตรงนี้: รหัส 6 หลักมีค่าที่เป็นไปได้แค่ล้านค่า
// ถ้าเดาได้ไม่จำกัด ความปลอดภัยของทั้งระบบเท่ากับศูนย์
export async function POST(request: Request) {
  if (!allowRequest(`verify:${clientKey(request)}`)) {
    return NextResponse.json({ ok: false, error: 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่' }, { status: 429 })
  }

  let email = ''
  let token = ''
  let next = '/dashboard'
  try {
    const body = (await request.json()) as { email?: unknown; token?: unknown; next?: unknown }
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    token = typeof body.token === 'string' ? body.token.trim() : ''
    next = safeNextPath(typeof body.next === 'string' ? body.next : null)
  } catch {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!email || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ ok: false, error: 'รหัสต้องเป็นตัวเลข 6 หลัก' }, { status: 400 })
  }

  const supabase = await routeAuthClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error || !data.session) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, next })
}
