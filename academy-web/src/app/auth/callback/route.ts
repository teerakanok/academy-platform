import { NextResponse } from 'next/server'
import { getIdentityAdapter } from '@/lib/identity/registry'

export const runtime = 'nodejs'

// จุดรับกลับจาก Account Center — เตรียมไว้ ยังไม่ต่อ production
//
// ทิศทาง Identity Control (2026-08-01) กำหนดว่า callback ผ่าน browser ได้แค่
// **one-time code + state** เท่านั้น ห้ามมี subject, email, access token, OTP,
// invite code หรือ enrollment code วิ่งผ่าน URL — route นี้จึงปฏิเสธทุกอย่างที่เกินนั้น
// ตั้งแต่ก่อนแลก code เพราะถ้ามีของพวกนั้นมาด้วย แปลว่าอีกฝั่งทำผิดสัญญา
// และเราต้องไม่ทำให้มันดูเหมือนใช้ได้
//
// PKCE verifier อยู่ใน transaction ฝั่ง backend เท่านั้น ไม่เคยออกไปที่ browser
// (ยังไม่ได้ทำ transaction store — เป็นงานถัดไปเมื่อจะต่อจริง)

const FORBIDDEN_PARAMS = ['subject', 'sub', 'email', 'access_token', 'id_token', 'otp', 'invite', 'invitation', 'enrollment_code']

export async function GET(request: Request) {
  const url = new URL(request.url)

  const leaked = FORBIDDEN_PARAMS.filter((p) => url.searchParams.has(p))
  if (leaked.length > 0) {
    console.error('[auth/callback] callback มีข้อมูลที่ห้ามส่งผ่าน browser:', leaked.join(', '))
    return NextResponse.json(
      { ok: false, error: 'callback ไม่เป็นไปตามสัญญา — มีข้อมูลที่ห้ามส่งผ่าน browser' },
      { status: 400 },
    )
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return NextResponse.json({ ok: false, error: 'callback ต้องมี code และ state' }, { status: 400 })
  }

  const adapter = getIdentityAdapter()
  if (!adapter) {
    // ยังไม่ได้ต่อ Identity Control — ตอบตามจริง ไม่ใช่ทำเป็นว่าใช้ได้
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
      { status: 503 },
    )
  }

  // ขั้นตอนที่เหลือ (ทำเมื่อ Identity Control พร้อมต่อจริง):
  //   1. ดึง transaction จาก state ref ฝั่ง backend และตรวจว่ายังไม่หมดอายุ/ยังไม่ถูกใช้
  //   2. adapter.exchangeCode ด้วย PKCE verifier ที่เก็บไว้กับ transaction นั้น
  //   3. ตรวจ nonce ที่ได้กลับมาว่าตรงกับที่ส่งไป
  //   4. findOrCreateUser ด้วย (issuer, subject) เท่านั้น — ห้ามค้นด้วย email
  //   5. syncActivation ตามผลที่ได้
  //   6. ตั้ง session ของ Academy เอง แบบ host-scoped
  return NextResponse.json(
    { ok: false, error: 'ยังไม่เปิดใช้งาน — transaction store ฝั่ง backend ยังไม่ได้ทำ' },
    { status: 501 },
  )
}
