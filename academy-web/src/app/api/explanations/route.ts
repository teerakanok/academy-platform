import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { getLessonAnswerKey } from '@/lib/content/answer-key'
import { loadProgress } from '@/lib/course/progress-db'

export const runtime = 'nodejs'

// เฉลย + คำอธิบายของด่านวัดผล — ให้ดูได้ **หลังผ่านแล้วเท่านั้น**
//
// ทำไมต้องเป็น endpoint แยก ไม่ใช่แนบไปกับ response ของการตรวจ: ถ้าแนบไปด้วย
// รูปของ response จะต่างกันระหว่าง "ผ่าน" กับ "ไม่ผ่าน" ซึ่งตัวมันเองก็บอกใบ้ได้
// (ขนาด/จำนวน field) · แยกออกมาแล้วสัญญาของการตรวจจึงเป็น `{ passed }` เสมอจริงๆ
//
// ⚠️ เงื่อนไขที่ห้ามผ่อน: ต้องอ่านสถานะจริงจากฐานข้อมูลว่าบทนี้ `completed` หรือ
// `tested-out` แล้ว — ไม่ใช่เชื่อสิ่งที่ client บอกมา ไม่งั้นนี่คือการย้ายเครื่องเฉลย
// ไปไว้ที่ใหม่แล้วไม่มีใครเฝ้า
//
// หลังผ่านแล้วการเปิดเฉลยไม่เป็นช่องโหว่ เพราะโจทย์หมุนใหม่ทุก attempt (W0-0) และ
// สถานะที่ผ่านไปแล้วก็ผ่านไปแล้ว — แต่ **มันคือทั้งหมดของประโยชน์เชิงการเรียน**
// ผู้เรียนต้องได้รู้ว่าทำไมข้อที่ตอบไปถึงถูกหรือผิด

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
})

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = schema.safeParse({
    slug: url.searchParams.get('slug') ?? '',
    nodeId: url.searchParams.get('nodeId') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 })
  }
  const input = parsed.data

  const structure = getCourseStructure(input.slug)
  const node = structure?.nodes.find((n) => n.id === input.nodeId)
  if (!structure || !node) {
    return NextResponse.json({ ok: false, error: 'ไม่พบบทเรียนนี้' }, { status: 404 })
  }

  const record = await loadProgress(user.account.id, input.slug)
  const proven = record.completed.includes(input.nodeId) || record.testedOut.includes(input.nodeId)
  // เงื่อนไขนี้พึ่งข้อเท็จจริงสองข้อ ซึ่งถ้าข้อใดเปลี่ยนต้องกลับมาแก้ที่นี่ทันที:
  //   1. capstone ได้ `completed` ก็ต่อเมื่อถูกทุกข้อ (assessed) เท่านั้น
  //   2. `tested-out` เกิดได้เฉพาะบน node ที่นโยบายเปิด test-out ให้ ซึ่งวันนี้ปิดหมด
  //      (assessment-policy.ts) — ไม่งั้นเฉลยจากโหมด learn จะเปิดคลังเฉลยของโหมดวัดผล
  if (!proven) {
    // ตอบเหมือนกันทุกกรณีที่ยังไม่ควรเปิดเผย — ไม่บอกว่า "ใกล้แล้ว" หรือ "อีกนิดเดียว"
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่ผ่าน' }, { status: 403 })
  }

  const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
  if (!answerKey) return NextResponse.json({ ok: false, error: 'ไม่พบเนื้อหาบทนี้' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    questions: answerKey.checkpoint.map((q) => ({
      id: q.id,
      correct: q.correct,
      explanation: q.explanation,
    })),
  })
}
