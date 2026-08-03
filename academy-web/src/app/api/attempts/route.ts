import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { CHECKPOINT_CHALLENGE_ID, buildAttemptParams, cryptoPick } from '@/lib/course/attempt'
import { getLessonAnswerKey, mcqItems, simulationItems } from '@/lib/content/answer-key'
import { isAssessedNode, requiresAttempt } from '@/lib/course/assessment-policy'
import { issueAttempt, nextAttemptAt } from '@/lib/course/attempt-db'
import { toPublicSimulation } from '@/lib/content/public-lesson'
import { resolveChallenge, rollVariables } from '@/lib/simulation/variables'
import type { SimulationChallenge } from '@/lib/simulation/types'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { authorizeCourseResource, deniedAccessStatus } from '@/lib/account/course-access'

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

/** body ของ endpoint นี้เล็กมากอยู่แล้ว — เพดานจึงแคบกว่าที่อื่น */
const MAX_BODY_BYTES = 2 * 1024

export async function POST(request: Request) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await readBoundedJson(request, MAX_BODY_BYTES)
  if (!body.ok && body.reason === 'too-large') {
    return NextResponse.json({ ok: false, error: 'คำขอใหญ่เกินไป' }, { status: 413 })
  }
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = schema.safeParse(body.value)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 })
  }
  const input = parsed.data

  const structure = getCourseStructure(input.slug)
  const node = structure?.nodes.find((n) => n.id === input.nodeId)
  if (!structure || !node) {
    return NextResponse.json({ ok: false, error: 'ไม่พบบทเรียนนี้' }, { status: 404 })
  }

  const access = await authorizeCourseResource(user.account.id, input.slug, input.nodeId)
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ยังไม่มีสิทธิ์เข้าถึงบทนี้' },
      { status: deniedAccessStatus(access) },
    )
  }

  const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
  const bank = mcqItems(answerKey?.checkpoint ?? [])
  const sims = simulationItems(answerKey?.checkpoint ?? [])
  // ⚠️ ต้องใช้เกณฑ์เดียวกับ UI และ `/api/progress` เป๊ะๆ
  //
  // เดิมที่นี่ตัดสินเองว่า "เฉพาะ capstone" ส่วนอีกสองที่ใช้ `requiresAttempt` ·
  // บทปกติที่มีด่านจำลอง (schema ยอมรับได้) จึงกลายเป็นทางตัน: UI ขอ attempt
  // แต่ที่นี่ปฏิเสธ ผู้เรียนเห็นแต่ "เตรียมโจทย์ไม่สำเร็จ" ตลอดกาล (RIL รอบ 2)
  if (!requiresAttempt(node, sims.length > 0)) {
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่เปิดให้วัดผลแบบ attempt' }, { status: 400 })
  }
  if (bank.length === 0 && sims.length === 0) {
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่มีคลังข้อ' }, { status: 400 })
  }

  try {
    // วันนี้เสิร์ฟเท่าขนาดคลัง (คลังมีเท่าที่ใช้พอดี) — เมื่อคลังโต ≥3 เท่า (W-content)
    // จำนวนเสิร์ฟจะมาจากนิยาม challenge ไม่ใช่ขนาดคลัง
    const params = buildAttemptParams(bank, bank.length, isAssessedNode(node))

    // สุ่มค่าตัวแปรของโจทย์จำลองต่อ attempt แล้ว **เก็บโจทย์ทั้งชิ้นหลังแทนค่า**
    // ลง params · ทั้งโจทย์ที่ผู้เรียนอ่านและกติกาที่ใช้ตรวจมาจากวัตถุชิ้นเดียวกันนี้
    // deploy ระหว่างทางจึงเปลี่ยนกติกาของ attempt ที่ออกไปแล้วไม่ได้
    const resolvedSims: { id: string; challenge: SimulationChallenge }[] = []
    for (const sim of sims) {
      const rolled = rollVariables(sim.challenge.variables, cryptoPick)
      const challenge = resolveChallenge(sim.challenge, rolled)
      if (!challenge) {
        // เพิ่งสุ่มค่าไปเองเมื่อกี้ — แทนค่าไม่ครบแปลว่าไฟล์เนื้อหาประกาศตัวแปรไม่ครบ
        console.error(`[api/attempts] โจทย์ ${sim.id} แทนค่าตัวแปรไม่ครบ`)
        return NextResponse.json({ ok: false, error: 'ออก attempt ไม่สำเร็จ' }, { status: 500 })
      }
      resolvedSims.push({ id: sim.id, challenge })
    }
    params.simulations = resolvedSims
    const ctx = {
      userId: user.account.id,
      courseSlug: input.slug,
      nodeId: input.nodeId,
      challengeId: CHECKPOINT_CHALLENGE_ID,
    }
    const issued = await issueAttempt(ctx, params, structure.version)
    if (!issued) {
      // โควตาเต็ม (3 ครั้ง/30 นาที) — ใช้สิทธิ์ครบแล้วโจทย์จะหมุนใหม่ ไม่ใช่เปิดเฉลย
      //
      // บอกเวลาที่ขอได้อีกครั้งไปด้วย: "รอสักครู่" ทำให้ผู้เรียนต้องเดาเอง ซึ่งจบลงที่
      // การกดซ้ำไปเรื่อยๆ · ตัวเลขนี้ไม่ใช่ oracle เพราะไม่แปรตามคำตอบ แปรตามเวลา
      const readyAt = await nextAttemptAt(ctx)
      return NextResponse.json(
        {
          ok: false,
          error: 'ใช้สิทธิ์ครบแล้ว รอสักครู่แล้วลองใหม่',
          retryAfterSeconds: readyAt ? Math.max(0, Math.ceil((readyAt.getTime() - Date.now()) / 1000)) : undefined,
        },
        { status: 429 },
      )
    }

    // โจทย์จำลองที่แทนค่าตัวแปรของ attempt นี้แล้ว — ยังผ่าน toPublicSimulation
    // เหมือนเดิม จึงไม่มี operator/value/hints ติดไปกับ response · ประกาศชนิดไว้
    // เพื่อให้ลืมฟิลด์ใดฟิลด์หนึ่ง (เช่น `kind`) เป็น error ตอนคอมไพล์ ไม่ใช่ด่านหายเงียบๆ
    // ⚠️ ตอบจาก `issued.params` ไม่ใช่ `params` ที่เพิ่งสร้าง
    //
    // ถ้าผู้เรียนมีใบที่ยังไม่ถูกใช้อยู่แล้ว (เปิดหน้าซ้ำ / response ครั้งก่อนหายกลางทาง)
    // DB จะคืนใบเดิมมา — ตอบด้วยชุดที่เพิ่งสุ่มจะกลายเป็นโจทย์ใหม่คู่กับเฉลยเก่า
    // ทันที (0010) · attempt หนึ่งใบถือทุกอย่างที่ใช้แสดงและตรวจงานของตัวเอง
    const stored = issued.params
    return NextResponse.json({
      ok: true,
      attemptId: issued.attemptId,
      expiresAt: issued.expiresAt,
      questions: stored.questions,
      simulations: (stored.simulations ?? []).map((sim) => ({
        kind: 'simulation' as const,
        id: sim.id,
        challenge: toPublicSimulation(sim.challenge),
      })),
    })
  } catch (err) {
    console.error('[api/attempts] ออก attempt ไม่สำเร็จ:', err)
    return NextResponse.json({ ok: false, error: 'ออก attempt ไม่สำเร็จ' }, { status: 500 })
  }
}
