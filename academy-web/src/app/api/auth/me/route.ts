import { NextResponse } from 'next/server'
import { routeAuthClient } from '@/lib/auth/route-client'

export const runtime = 'nodejs'

// สถานะบัญชีแบบเบาสำหรับ header
//
// ทำไมต้องเป็น endpoint แยก แทนที่จะอ่านใน root layout: การเรียก cookies() ใน layout
// จะทำให้**ทุกหน้าในเว็บกลายเป็น dynamic** ซึ่งฆ่า static/SSG ที่หน้าร้านพึ่งพาอยู่
// (และ SEO กับความเร็วบน edge ก็หายไปด้วย) header จึงดึงสถานะหลัง hydrate แทน
export async function GET(request: Request) {
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
