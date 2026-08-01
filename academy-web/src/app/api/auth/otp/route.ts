import { NextResponse } from 'next/server'
import { routeAuthClient } from '@/lib/auth/route-client'
import { allowRequest } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const runtime = 'nodejs'

// ขอรหัสเข้าสู่ระบบทางอีเมล
//
// ตอบเหมือนกันเสมอไม่ว่าอีเมลนั้นมีบัญชีอยู่แล้วหรือไม่ — ถ้าตอบต่างกัน หน้านี้จะกลาย
// เป็นเครื่องมือให้ใครก็ได้ไล่ตรวจว่าอีเมลไหนสมัครกับเราไว้
export async function POST(request: Request) {
  if (!allowRequest(`otp:${clientKey(request)}`)) {
    return NextResponse.json({ ok: false, error: 'ขอรหัสถี่เกินไป ลองใหม่ในอีกสักครู่' }, { status: 429 })
  }

  let email = ''
  try {
    const body = (await request.json()) as { email?: unknown }
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'กรุณาใส่อีเมลที่ถูกต้อง' }, { status: 400 })
  }

  const supabase = await routeAuthClient()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })

  if (error) {
    console.error('[auth/otp] ส่งรหัสไม่สำเร็จ:', error.message)
    // ไม่ส่งข้อความจาก provider กลับไปตรงๆ — มันบอกใบ้สถานะของอีเมลได้
    return NextResponse.json({ ok: false, error: 'ส่งรหัสไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
