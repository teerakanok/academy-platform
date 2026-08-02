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
//   · อยู่ในบทปกติ → บอกได้ว่า requirement ข้อไหนยังไม่ผ่าน + คำใบ้เมื่อผู้เรียนกดขอ
//     (บอก "อะไรยังไม่ครบ" ไม่ใช่ "ค่าที่ถูกคืออะไร" — ผู้เรียนยังต้องคิดเอง)

/** หน้าจอจำลองที่ใหญ่ที่สุดวันนี้มี 6 ช่อง — เผื่อไว้พอสมควรแต่ไม่เปิดให้ส่งไม่จำกัด */
const MAX_STATE_FIELDS = 32

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
  challengeId: z.string().trim().min(1).max(120),
  /** สถานะสุดท้ายของหน้าจอที่ผู้เรียนตั้งไว้ */
  state: z
    .record(z.string().max(64), z.union([z.string().max(200), z.boolean()]))
    // จำกัดจำนวน key ด้วย ไม่ใช่แค่ความยาวต่อค่า — ไม่งั้นบัญชีฟรีส่ง object ที่มี
    // คีย์นับหมื่นมาให้ Zod เดินทุกตัวได้ (RIL cross-model ชี้)
    .refine((s) => Object.keys(s).length <= MAX_STATE_FIELDS, {
      message: `state มีได้ไม่เกิน ${MAX_STATE_FIELDS} ช่อง`,
    }),
  /** ขอคำใบ้มาด้วยไหม — ผู้เรียนกดขอเอง */
  wantHint: z.boolean().optional(),
})

/** ขนาด body สูงสุดที่ยอมอ่าน — กันการยัด JSON ก้อนใหญ่ให้ parser ทำงานฟรี */
const MAX_BODY_BYTES = 8 * 1024

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  // อ่านเป็น byte ก่อนแล้ววัดขนาด — `request.json()` ตรงๆ จะ parse ให้เสร็จก่อน
  // ไม่ว่าจะใหญ่แค่ไหน แปลว่างาน parse เกิดไปแล้วก่อนเราจะได้ปฏิเสธ
  //
  // ⚠️ ต้องวัดที่ `byteLength` ไม่ใช่ `String.length` — String.length นับ UTF-16
  // code unit ซึ่งข้อความไทยหนึ่งตัวใช้ 1 หน่วยแต่กินจริง 3 byte ใน UTF-8
  // (RIL cross-model พิสูจน์: payload ไทย 19,601 byte ผ่าน guard 8 KiB ที่นับด้วย
  // String.length มาแล้ว) · เว็บนี้เป็นสองภาษาโดยตั้งใจ ช่องนี้จึงไม่ใช่กรณีทฤษฎี
  let body: unknown
  try {
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'คำขอใหญ่เกินไป' }, { status: 413 })
    }
    body = JSON.parse(new TextDecoder().decode(bytes))
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

  // คำใบ้ให้เมื่อผู้เรียน "กดขอ" เท่านั้น
  //
  // เดิมใช้จำนวนครั้งที่ client ส่งมาเป็นเงื่อนไข ซึ่งปลอมได้ (ส่ง attempt:2 ตั้งแต่
  // ครั้งแรกก็ได้คำใบ้) — การอ้างว่า "เซิร์ฟเวอร์พิสูจน์แล้วว่าลองมา 2 ครั้ง" จึงไม่จริง
  // และเราไม่มีที่เก็บจำนวนครั้งของโหมดฝึก (ตั้งใจไม่บันทึกสถานะ) · ทางที่ตรงไปตรงมา
  // กว่าคือให้มันเป็นการขอที่ผู้เรียนตัดสินใจเอง แล้ว UI เป็นคนเสนอตอนเหมาะสม
  const hints = !verdict.passed && input.wantHint && challenge.hints?.length ? challenge.hints : undefined

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
