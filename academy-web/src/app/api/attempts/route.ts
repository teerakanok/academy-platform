import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure, getLesson } from '@/lib/content/course-source'
import { CHECKPOINT_CHALLENGE_ID, buildAttemptParams, toPublicQuestions } from '@/lib/course/attempt'
import { issueAttempt } from '@/lib/course/attempt-db'

export const runtime = 'nodejs'

// ออก attempt (W0-0) — จุดเดียวที่ผู้เรียนได้ "โจทย์" ของด่านวัดผล
//
// flow ตามแผน 2026-08-02 §5 W0-0:
//   POST /api/attempts → ได้ attempt_id + โจทย์ที่สุ่มแล้ว → ผู้เรียนทำ →
//   POST /api/progress {action:'checkpoint', attemptId, ...} → เซิร์ฟเวอร์ตรวจจาก
//   params ที่ตัวเองถือ (การต่อฝั่ง /api/progress เป็นงานถัดไปของ W0-0/W0-1)
//
// กติกาที่ห้ามผ่อน:
//   · attempt ผูกกับผู้ใช้ที่ล็อกอินเท่านั้น — ไม่มี attempt นิรนาม
//   · response มีเฉพาะรูป public ของโจทย์ (id/prompt/choices ที่ remap แล้ว)
//     เฉลยและตาราง remap อยู่ใน params ฝั่งเซิร์ฟเวอร์ฝ่ายเดียว
//   · เปิดเฉพาะ node ที่มีคลังข้อ (ตอนนี้ = capstone) — node อื่นยังไม่มีพื้นผิว
//     วัดผลแบบ attempt จนกว่าจะมีคลังข้อของตัวเอง (ล็อกไว้ใน W0-0)

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
})

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

  // คลังข้อมีเฉพาะ capstone (W0-0 ล็อกขอบเขตนี้) — บทปกติไม่มีพื้นผิววัดผลแบบ attempt
  if (node.kind !== 'capstone') {
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่เปิดให้วัดผลแบบ attempt' }, { status: 400 })
  }

  const resolved = getLesson(input.slug, input.nodeId)
  const bank = resolved?.lesson.checkpoint ?? []
  if (bank.length === 0) {
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่มีคลังข้อ' }, { status: 400 })
  }

  try {
    // วันนี้เสิร์ฟเท่าขนาดคลัง (คลังมีเท่าที่ใช้พอดี) — เมื่อคลังโต ≥3 เท่า (W-content)
    // จำนวนเสิร์ฟจะมาจากนิยาม challenge ไม่ใช่ขนาดคลัง
    const params = buildAttemptParams(bank, bank.length)
    const issued = await issueAttempt(
      {
        userId: user.account.id,
        courseSlug: input.slug,
        nodeId: input.nodeId,
        challengeId: CHECKPOINT_CHALLENGE_ID,
      },
      params,
      structure.version,
    )
    if (!issued) {
      // โควตาเต็ม (3 ครั้ง/30 นาที) — ใช้สิทธิ์ครบแล้วโจทย์จะหมุนใหม่ ไม่ใช่เปิดเฉลย
      return NextResponse.json(
        { ok: false, error: 'ใช้สิทธิ์ครบแล้ว รอสักครู่แล้วลองใหม่' },
        { status: 429 },
      )
    }

    return NextResponse.json({
      ok: true,
      attemptId: issued.attemptId,
      expiresAt: issued.expiresAt,
      questions: toPublicQuestions(bank, params),
    })
  } catch (err) {
    console.error('[api/attempts] ออก attempt ไม่สำเร็จ:', err)
    return NextResponse.json({ ok: false, error: 'ออก attempt ไม่สำเร็จ' }, { status: 500 })
  }
}
