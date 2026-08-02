import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { getLessonAnswerKey, sameAnswerSet } from '@/lib/content/answer-key'
import { isTestOutAvailable, TEST_OUT_UNAVAILABLE_REASON } from '@/lib/course/assessment-policy'
import { loadAllProgress, loadProgress, recordNodeEvent } from '@/lib/course/progress-db'

export const runtime = 'nodejs'

// ความคืบหน้าของผู้เรียน
//
// ⚠️ กฎที่ห้ามผ่อนเด็ดขาด: **client ประกาศเองไม่ได้ว่า "ผ่านแล้ว"**
//
// เวอร์ชันแรกของ endpoint นี้รับ `status: 'completed'` กับ `checkpointResults` มาจาก
// client ตรงๆ ซึ่งแปลว่าใครก็ตามที่ล็อกอินแล้วยิง 10 request ก็ได้ครบทั้งคอร์สว่า
// "เรียนจบ" โดยไม่ต้องตอบคำถามสักข้อ — พิสูจน์แล้วว่าทำได้จริง (10/10 บท)
// และมันทำลายทุกอย่างที่ product นี้ยืนอยู่: ใบรับรองที่ออกจากสถานะนั้นไม่ได้บอกอะไร
// เกี่ยวกับคนถือใบเลย
//
// ตอนนี้ client ส่งได้แค่ "สิ่งที่ทำ" (เปิดอ่าน / ขอข้าม / ส่งคำตอบ) ส่วน "ผลลัพธ์"
// เซิร์ฟเวอร์เป็นคนตัดสินจากเฉลยที่อยู่ฝั่ง server เท่านั้น
//
// หมายเหตุ: 'skip' ยังให้ client ประกาศได้ เพราะมันคือการ *สละสิทธิ์* ไม่ใช่การอ้างว่า
// รู้ — และตัวมันเองไม่เคยนับเป็นหลักฐานอยู่แล้ว
//
// ── สิ่งที่ response บอกได้ ต่างกันตามโหมด (W0-1) ────────────────────────────────
// **assessed** (capstone หรือ test-out) → `{ passed }` เท่านั้น เหมือนกันทั้งกรณีผ่าน
//   และไม่ผ่าน · ไม่มีผลรายข้อ ไม่มีจำนวนที่ถูก ไม่มีคำอธิบาย
//   เหตุผล: capstone คือ 5 ข้อ single-answer 4 ตัวเลือก การรู้ "ถูกกี่ข้อ" ทำให้ไล่
//   ทีละข้อแบบ Mastermind ได้ (~10–15 ครั้งได้เฉลยครบโดยไม่รู้เนื้อหาเลย) — ตัวเลข
//   หรือสัญญาณใดๆ ที่แปรตามคำตอบคือเครื่องเฉลย
// **learn** (บทปกติ) → บอกผลรายข้อ + คำอธิบายได้ เพราะเป็นการสอน ไม่ใช่ด่านพิสูจน์
//   (น้ำหนักของใบรับรองอยู่ที่ capstone ทั้งหมด — W0-3)

const answerMap = z.record(z.string().max(64), z.array(z.string().max(8)).max(12))

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open'),
    slug: z.string().trim().min(1).max(120),
    nodeId: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal('skip'),
    slug: z.string().trim().min(1).max(120),
    nodeId: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal('checkpoint'),
    slug: z.string().trim().min(1).max(120),
    nodeId: z.string().trim().min(1).max(120),
    /** 'learn' = อ่านแล้วทำ checkpoint · 'test-out' = ข้ามการอ่านโดยพิสูจน์ */
    mode: z.enum(['learn', 'test-out']),
    answers: answerMap,
  }),
  z.object({
    action: z.literal('video-cue'),
    slug: z.string().trim().min(1).max(120),
    nodeId: z.string().trim().min(1).max(120),
    cueId: z.string().trim().min(1).max(64),
    answer: z.array(z.string().max(8)).max(12),
  }),
])

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

  // node ต้องมีอยู่จริงในคอร์สจริง — กันการสร้างแถวขยะด้วย slug/nodeId ที่แต่งขึ้น
  const structure = getCourseStructure(input.slug)
  const node = structure?.nodes.find((n) => n.id === input.nodeId)
  if (!structure || !node) {
    return NextResponse.json({ ok: false, error: 'ไม่พบบทเรียนนี้' }, { status: 404 })
  }

  try {
    if (input.action === 'open') {
      await recordNodeEvent(user.account.id, { slug: input.slug, nodeId: input.nodeId, status: 'in-progress' })
      return NextResponse.json({ ok: true })
    }

    if (input.action === 'skip') {
      // ข้ามได้เฉพาะบทที่ข้ามได้ — capstone ข้ามไม่ได้ตามกติกาของคอร์ส
      if (node.kind === 'capstone') {
        return NextResponse.json({ ok: false, error: 'บทนี้ข้ามไม่ได้' }, { status: 409 })
      }
      await recordNodeEvent(user.account.id, { slug: input.slug, nodeId: input.nodeId, status: 'skipped' })
      return NextResponse.json({ ok: true })
    }

    // ⚠️ test-out ต้องถูกปิดก่อนแตะเฉลยใดๆ — บทปกติใช้ checkpoint ชุดเดียวกับโหมด
    // learn ซึ่งตอบกลับผลรายข้อ + คำอธิบาย ถ้าปล่อยให้ test-out ทำงานบน node ที่
    // ไม่มีคลังข้อของตัวเอง โหมดสอนจะกลายเป็นเครื่องเฉลยของโหมดวัดผลทันที
    if (input.action === 'checkpoint' && input.mode === 'test-out' && !isTestOutAvailable(node)) {
      return NextResponse.json({ ok: false, error: TEST_OUT_UNAVAILABLE_REASON }, { status: 400 })
    }

    const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
    if (!answerKey) return NextResponse.json({ ok: false, error: 'ไม่พบเนื้อหาบทนี้' }, { status: 404 })

    if (input.action === 'video-cue') {
      const cue = answerKey.videoCueQuestions.find((q) => q.cueId === input.cueId)
      if (!cue) return NextResponse.json({ ok: false, error: 'ไม่พบคำถามนี้' }, { status: 404 })
      const correct = sameAnswerSet(input.answer, cue.correct)
      await recordNodeEvent(user.account.id, {
        slug: input.slug,
        nodeId: input.nodeId,
        status: 'in-progress',
        videoCueResults: { [input.cueId]: correct },
      })
      // คำถามกลางวิดีโอเป็น formative ไม่ใช่ด่าน (W0-4) — คำอธิบายคือทั้งหมดของ
      // ประโยชน์มัน จึงส่งกลับตรงนี้แทนที่จะฝังมากับหน้า
      return NextResponse.json({ ok: true, correct, explanation: cue.explanation })
    }

    // ── checkpoint: เซิร์ฟเวอร์ตรวจเอง ────────────────────────────────────
    const questions = answerKey.checkpoint
    const results: Record<string, boolean> = {}
    for (const q of questions) {
      results[q.id] = sameAnswerSet(input.answers[q.id] ?? [], q.correct)
    }
    const correctCount = Object.values(results).filter(Boolean).length
    // capstone และการ test-out ต้องถูกทุกข้อ · บทปกติแค่ทำครบก็ผ่าน
    // (เกณฑ์บทปกติจะเปลี่ยนเป็น "ผิดไม่เกิน 1 ข้อ" ใน W0-3 — คนละงานกัน จงใจไม่แตะที่นี่)
    const assessed = node.kind === 'capstone' || input.mode === 'test-out'
    const answeredAll = questions.every((q) => (input.answers[q.id]?.length ?? 0) > 0)
    const passed = answeredAll && (assessed ? correctCount === questions.length : true)

    await recordNodeEvent(user.account.id, {
      slug: input.slug,
      nodeId: input.nodeId,
      // ตอบแล้วแต่ยังไม่ผ่าน — เก็บผลไว้ แต่สถานะยังไม่ขยับ
      status: passed ? (input.mode === 'test-out' ? 'tested-out' : 'completed') : 'in-progress',
      checkpointResults: results,
    })

    // assessed: รูปของ response ต้องเหมือนกันทั้งผ่านและไม่ผ่าน — ขนาด/จำนวน field
    // ที่ต่างกันก็บอกใบ้ได้ จึงคืน key เดียวเสมอ
    if (assessed) return NextResponse.json({ ok: true, passed })

    const explanations: Record<string, string> = {}
    for (const q of questions) explanations[q.id] = q.explanation
    return NextResponse.json({ ok: true, passed, results, correctCount, total: questions.length, explanations })
  } catch (err) {
    console.error('[api/progress] บันทึกไม่สำเร็จ:', err)
    // ตอบตามจริง — ถ้าบอกว่าสำเร็จทั้งที่ไม่ได้บันทึก ผู้เรียนจะเสียงานโดยไม่รู้ตัว
    return NextResponse.json({ ok: false, error: 'บันทึกความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const slug = new URL(request.url).searchParams.get('slug')?.trim()
  try {
    if (slug) {
      return NextResponse.json({ ok: true, record: await loadProgress(user.account.id, slug) })
    }
    return NextResponse.json({ ok: true, records: await loadAllProgress(user.account.id) })
  } catch (err) {
    console.error('[api/progress] อ่านไม่สำเร็จ:', err)
    return NextResponse.json({ ok: false, error: 'อ่านความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
}
