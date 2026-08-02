import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { getLessonAnswerKey } from '@/lib/content/answer-key'
import { gradeSimulation } from '@/lib/simulation/types'

export const runtime = 'nodejs'

// ตรวจโจทย์จำลองในโหมดฝึก — **ไม่บันทึกสถานะการเรียน**
//
// ทำไมต้องมี endpoint แยกทั้งที่เป็นแค่โหมดฝึก: เดิมโหมดฝึกตรวจฝั่ง browser จาก
// `requirements[].operator/value` ที่ถูกส่งมาทั้งชุด และโชว์ `hints` ให้เองหลังลอง
// สองครั้ง — แปลว่า **คนอ่านโหมดฝึกเอาเฉลยไปตอบโหมดวัดผลได้** ซึ่งทำให้การ harden
// โหมดวัดผลไม่มีความหมาย (แผน 2026-08-02 §5 W0-1)
//
// สิ่งที่ response บอกได้ ขึ้นกับว่าโจทย์นี้เป็นด่านของอะไร:
//   · อยู่ใน capstone → `{ passed }` เท่านั้น เหมือนโหมดวัดผลทุกประการ
//   · อยู่ในบทปกติ → บอกได้ว่า requirement ข้อไหนยังไม่ผ่าน + คำใบ้หลังลอง 2 ครั้ง
//     (บอก "อะไรยังไม่ครบ" ไม่ใช่ "ค่าที่ถูกคืออะไร" — ผู้เรียนยังต้องคิดเอง)

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
  challengeId: z.string().trim().min(1).max(120),
  /** สถานะสุดท้ายของหน้าจอที่ผู้เรียนตั้งไว้ */
  state: z.record(z.string().max(64), z.union([z.string().max(200), z.boolean()])),
  /** ครั้งที่เท่าไรของการกดตรวจ — ใช้ตัดสินว่าถึงเวลาให้คำใบ้หรือยัง */
  attempt: z.number().int().min(1).max(1000),
})

/** ให้คำใบ้เมื่อผู้เรียนลองเองมาแล้วอย่างน้อยเท่านี้ครั้ง — เร็วกว่านี้คือชิงคิดแทน */
const HINT_AFTER_ATTEMPTS = 2

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 })
  }
  const input = parsed.data

  const structure = getCourseStructure(input.slug)
  const node = structure?.nodes.find((n) => n.id === input.nodeId)
  if (!structure || !node) {
    return NextResponse.json({ ok: false, error: 'ไม่พบบทเรียนนี้' }, { status: 404 })
  }

  const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
  const challenge = answerKey?.simulations.find((c) => c.id === input.challengeId)
  if (!challenge) return NextResponse.json({ ok: false, error: 'ไม่พบโจทย์นี้' }, { status: 404 })

  const verdict = gradeSimulation(challenge, input.state)

  // ด่านของ capstone: ปิดเหมือนโหมดวัดผล — จำนวน requirement ที่ผ่านคือสัญญาณที่
  // แปรตามคำตอบ ซึ่งไล่ทีละข้อได้เหมือนกัน
  if (node.kind === 'capstone') {
    return NextResponse.json({ ok: true, passed: verdict.passed })
  }

  const hints =
    !verdict.passed && input.attempt >= HINT_AFTER_ATTEMPTS && challenge.hints?.length
      ? challenge.hints
      : undefined

  return NextResponse.json({
    ok: true,
    passed: verdict.passed,
    // ผลราย requirement มีเฉพาะ label — ไม่มี operator/value ที่เป็นกติกาการตรวจ
    results: verdict.results,
    metCount: verdict.metCount,
    total: verdict.total,
    debrief: verdict.passed ? challenge.debrief : undefined,
    hints,
  })
}
