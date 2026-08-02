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

  // ล้าง attempt ของคอร์สนี้ด้วย — เริ่มใหม่แปลว่าเริ่มใหม่จริง
  //
  // ⚠️ พิจารณาแล้วว่านี่ไม่ใช่ช่องเลี่ยงโควตา (3 ครั้ง/30 นาที ต่อ user×node):
  // ราคาของการ reset คือ **ทิ้งความคืบหน้าทั้งคอร์สของตัวเอง** ซึ่งแพงกว่าการรอ
  // 30 นาทีมากสำหรับคนที่ตั้งใจเรียน · ส่วนคนที่ตั้งใจไล่ลองเฉลย โควตาเป็นแค่
  // speed bump อยู่แล้วเพราะ D1 เปิดสมัครเสรี (บันทึกไว้ในแผน §5 W0-1)
  // ถ้าไม่ล้าง ผู้เรียนที่กด "เริ่มใหม่" จะเจอ 429 โดยไม่มีทางเข้าใจว่าทำไม
  const { error: attemptError } = await db
    .from('attempt')
    .delete()
    .eq('user_id', user.account.id)
    .eq('course_slug', slug)

  if (attemptError) {
    console.error('[api/progress/reset] ล้าง attempt ไม่สำเร็จ:', attemptError.message)
  }

  if (error) {
    console.error('[api/progress/reset] ลบไม่สำเร็จ:', error.message)
    return NextResponse.json({ ok: false, error: 'ล้างความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
