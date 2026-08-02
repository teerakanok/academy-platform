import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { CHECKPOINT_CHALLENGE_ID, buildAttemptParams, cryptoPick, toPublicQuestions } from '@/lib/course/attempt'
import { getLessonAnswerKey, mcqItems, simulationItems } from '@/lib/content/answer-key'
import { issueAttempt, nextAttemptAt } from '@/lib/course/attempt-db'
import { toPublicSimulation, type AttemptSimulation } from '@/lib/content/public-lesson'
import { resolveChallenge, rollVariables } from '@/lib/simulation/variables'
import { readBoundedBody } from '@/lib/http/bounded-body'

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
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const raw = await readBoundedBody(request, MAX_BODY_BYTES)
  if (!raw.ok) return NextResponse.json({ ok: false, error: 'คำขอใหญ่เกินไป' }, { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(raw.text)
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

  const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
  const bank = mcqItems(answerKey?.checkpoint ?? [])
  const sims = simulationItems(answerKey?.checkpoint ?? [])
  if (bank.length === 0 && sims.length === 0) {
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่มีคลังข้อ' }, { status: 400 })
  }

  try {
    // วันนี้เสิร์ฟเท่าขนาดคลัง (คลังมีเท่าที่ใช้พอดี) — เมื่อคลังโต ≥3 เท่า (W-content)
    // จำนวนเสิร์ฟจะมาจากนิยาม challenge ไม่ใช่ขนาดคลัง
    const params = buildAttemptParams(bank, bank.length)

    // สุ่มค่าตัวแปรของโจทย์จำลองต่อ attempt (W1) — ค่าที่สุ่มถูกเก็บใน params
    // ฝ่ายเดียว แล้วใช้ทั้งตอนสร้างโจทย์ที่ผู้เรียนอ่านและตอนตรวจ สองฝั่งจึงตรงกัน
    const simulationVars: Record<string, Record<string, string>> = {}
    for (const sim of sims) {
      simulationVars[sim.id] = rollVariables(sim.challenge.variables, cryptoPick)
    }
    params.simulationVars = simulationVars
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
    const simulations: AttemptSimulation[] = []
    for (const sim of sims) {
      const resolved = resolveChallenge(sim.challenge, simulationVars[sim.id] ?? {})
      if (!resolved) {
        // เพิ่งสุ่มค่าไปเองเมื่อกี้ — แทนค่าไม่ครบแปลว่าไฟล์เนื้อหาประกาศตัวแปรไม่ครบ
        // ส่งโจทย์ที่ยังมีแม่แบบให้ผู้เรียนไม่ได้ ต้องดังทันทีไม่ใช่ปล่อยผ่าน
        console.error(`[api/attempts] โจทย์ ${sim.id} แทนค่าตัวแปรไม่ครบ`)
        return NextResponse.json({ ok: false, error: 'ออก attempt ไม่สำเร็จ' }, { status: 500 })
      }
      simulations.push({ kind: 'simulation', id: sim.id, challenge: toPublicSimulation(resolved) })
    }

    return NextResponse.json({
      ok: true,
      attemptId: issued.attemptId,
      expiresAt: issued.expiresAt,
      questions: toPublicQuestions(bank, params),
      simulations,
    })
  } catch (err) {
    console.error('[api/attempts] ออก attempt ไม่สำเร็จ:', err)
    return NextResponse.json({ ok: false, error: 'ออก attempt ไม่สำเร็จ' }, { status: 500 })
  }
}
