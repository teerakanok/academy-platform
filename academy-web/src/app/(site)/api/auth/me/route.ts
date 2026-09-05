import { NextResponse } from 'next/server'
import { routeAuthClient } from '@/lib/auth/route-client'
import { currentUser } from '@/lib/auth/session'
import { legacyDirectOtpFixtureAllowedForRequest } from '@/lib/auth/legacy-direct-otp'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import { readLocalAcademySession } from '@/lib/identity/local-runtime'

export const runtime = 'nodejs'

// สถานะบัญชีแบบเบาสำหรับ header
//
// ทำไมต้องเป็น endpoint แยก แทนที่จะอ่านใน root layout: การเรียก cookies() ใน layout
// จะทำให้**ทุกหน้าในเว็บกลายเป็น dynamic** ซึ่งฆ่า static/SSG ที่หน้าร้านพึ่งพาอยู่
// (และ SEO กับความเร็วบน edge ก็หายไปด้วย) header จึงดึงสถานะหลัง hydrate แทน
export async function GET(request: Request) {
  if (identityControlLocalFixtureAllowedForRequest(request)) {
    const session = readLocalAcademySession(request)
    return session
      ? NextResponse.json({ signedIn: true, email: session.verifiedEmail })
      : NextResponse.json({ signedIn: false })
  }
  if (!legacyDirectOtpFixtureAllowedForRequest(request)) {
    const user = await currentUser()
    return user
      ? NextResponse.json({ signedIn: true, email: user.email })
      : NextResponse.json({ signedIn: false })
  }
  try {
    const supabase = await routeAuthClient(request)
    const { data } = await supabase.auth.getUser()
    if (!data.user?.email) return NextResponse.json({ signedIn: false })
    return NextResponse.json({ signedIn: true, email: data.user.email })
  } catch {
    // ตั้ง env ไม่ครบ / auth ล่ม — header ต้องไม่พังทั้งหน้า แค่แสดงว่ายังไม่ล็อกอิน
    return NextResponse.json({ signedIn: false })
  }
}
