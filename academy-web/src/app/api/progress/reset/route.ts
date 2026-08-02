import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { academyDb } from '@/lib/db/server'

export const runtime = 'nodejs'

// ล้างความคืบหน้าของคอร์สหนึ่ง — ของผู้เรียนคนที่ล็อกอินอยู่เท่านั้น
//
// ลบจริง ไม่ใช่ซ่อน: ผู้เรียนขอเริ่มใหม่แปลว่าเขาอยากให้มันหายจริงๆ และการเก็บซาก
// ไว้เงียบๆ จะทำให้ใบรับรองอ้างอิงสิ่งที่เจ้าตัวคิดว่าลบไปแล้ว
export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const slug = new URL(request.url).searchParams.get('slug')?.trim()
  if (!slug) return NextResponse.json({ ok: false, error: 'ต้องระบุคอร์ส' }, { status: 400 })

  const db = academyDb()
  const { error } = await db
    .from('node_progress')
    .delete()
    .eq('user_id', user.account.id)
    .eq('course_slug', slug)

  // ⚠️ **ห้าม** ลบแถวใน `attempt` ที่นี่ — นั่นคือสมุดนับโควตา
  //
  // เคยลบไปแล้วรอบหนึ่งด้วยเหตุผลเรื่อง UX ("กดเริ่มใหม่แล้วเจอ 429 งงแน่") ·
  // RIL cross-model จับว่ามันลบโควตาทิ้งทั้งหมด: คนที่ตั้งใจไล่ลองเฉลยไม่มีความ
  // คืบหน้าให้เสียอยู่แล้ว จึงกด reset สลับกับขอ attempt ได้ไม่จำกัด — speed bump
  // หายเกลี้ยงโดยที่หน้าเว็บดูปกติดี
  //
  // ปัญหา UX เดิมแก้ที่ปลายทางแทน: `/api/attempts` บอกเวลาที่ขอได้อีกครั้ง และหน้าจอ
  // แสดงข้อความจริงแทนที่จะเงียบ (ดู use-lesson-attempt.ts)

  if (error) {
    console.error('[api/progress/reset] ลบไม่สำเร็จ:', error.message)
    return NextResponse.json({ ok: false, error: 'ล้างความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
