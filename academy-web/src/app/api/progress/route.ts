import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { getLessonAnswerKey, mcqItems, sameAnswerSet, simulationItems } from '@/lib/content/answer-key'
import {
  isAssessedNode,
  requiresAttempt,
  isTestOutAvailable,
  passesLearnMode,
  TEST_OUT_UNAVAILABLE_REASON,
} from '@/lib/course/assessment-policy'
import { toPublicProgress } from '@/lib/course/public-progress'
import { readBoundedBody } from '@/lib/http/bounded-body'
import { gradeSimulation, gradingFingerprint } from '@/lib/simulation/types'
import { consumeAttempt, type ConsumedAttempt } from '@/lib/course/attempt-db'
import { CHECKPOINT_CHALLENGE_ID, remapAnswersToReal } from '@/lib/course/attempt'
import { simulationsToGrade } from '@/lib/course/attempt-grading'
import {
  loadAllProgress,
  loadProgress,
  recordNodeEvent,
  type SimulationEvidence,
} from '@/lib/course/progress-db'

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

/** ขนาด body สูงสุดที่ยอมอ่าน (byte จริง) — ดูเหตุผลใน lib/http/bounded-body.ts */
const MAX_BODY_BYTES = 8 * 1024
/** checkpoint ที่ยาวที่สุดวันนี้มี 5 ข้อ — เผื่อไว้พอสมควรแต่ไม่เปิดให้ส่งไม่จำกัด */
const MAX_ANSWER_ENTRIES = 64
/** ขอบเขตของด่านจำลองต่อ checkpoint และช่องต่อหน้าจอ — เหตุผลเดียวกับ MAX_ANSWER_ENTRIES */
const MAX_SIM_ITEMS = 16
const MAX_SIM_FIELDS = 32

const answerMap = z
  .record(z.string().max(64), z.array(z.string().max(8)).max(12))
  .refine((a) => Object.keys(a).length <= MAX_ANSWER_ENTRIES, {
    message: `ส่งคำตอบได้ไม่เกิน ${MAX_ANSWER_ENTRIES} ข้อ`,
  })

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
    /** สถานะหน้าจอของด่านจำลอง — client ส่ง "สิ่งที่ตั้งค่าไว้" เซิร์ฟเวอร์ตัดสินเอง */
    simulations: z
      .record(
        z.string().max(64),
        z
          .record(z.string().max(64), z.union([z.string().max(200), z.boolean()]))
          .refine((state) => Object.keys(state).length <= MAX_SIM_FIELDS, {
            message: `หน้าจอจำลองมีได้ไม่เกิน ${MAX_SIM_FIELDS} ช่อง`,
          }),
      )
      .refine((s) => Object.keys(s).length <= MAX_SIM_ITEMS, {
        message: `ส่งด่านจำลองได้ไม่เกิน ${MAX_SIM_ITEMS} ด่าน`,
      })
      .optional(),
    /**
     * attempt ที่ผู้เรียนกำลังทำอยู่ (W1)
     *
     * บังคับเมื่อบทนั้นมีโจทย์จำลองที่ค่าเป้าหมายถูกสุ่ม — ไม่มี attempt แปลว่าไม่มี
     * ค่าที่ตรวจได้ · ไม่บังคับกับบทที่เป็น MCQ ล้วน เพื่อไม่ทำลายของเดิม
     */
    attemptId: z.string().uuid().optional(),
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
    //
    // ด่านหนึ่งบทมีได้ทั้ง MCQ และโจทย์จำลอง (W1) · ทั้งสองถูกตรวจที่นี่ที่เดียว
    // และนับรวมเป็นชุดเดียว — ผู้เรียนกด "ตรวจ" ครั้งเดียวได้ผลของทั้งด่าน
    const questions = mcqItems(answerKey.checkpoint)
    const sims = simulationItems(answerKey.checkpoint)

    // ── attempt: แหล่งเดียวของ "โจทย์ครั้งนี้" ────────────────────────────
    //
    // บังคับสำหรับพื้นผิววัดผลทุกกรณี ไม่ใช่เฉพาะบทที่มีโจทย์จำลอง — เพราะ MCQ ก็
    // ถูก **remap key ต่อ attempt** เหมือนกัน · ถ้าไม่บังคับ ผู้เรียนส่ง key จริงจาก
    // ไฟล์มาได้ตรงๆ แปลว่าคำตอบคงที่ตลอดและแชร์กันได้ = การ remap ไม่มีความหมาย
    //
    // ⚠️ consume เป็น atomic และเงื่อนไข ownership/context/expiry อยู่ใน WHERE
    // เดียวกันทั้งหมด (W0-0) — attempt ของคนอื่นหรือของบทอื่นใช้ไม่ได้ และใช้ซ้ำไม่ได้
    const needsAttempt = requiresAttempt(node, sims.length > 0)
    let consumed: ConsumedAttempt | null = null
    if (needsAttempt) {
      if (!input.attemptId) {
        return NextResponse.json({ ok: false, error: 'ต้องเริ่มความพยายามใหม่ก่อนส่งคำตอบ' }, { status: 400 })
      }
      consumed = await consumeAttempt(
        {
          userId: user.account.id,
          courseSlug: input.slug,
          nodeId: input.nodeId,
          challengeId: CHECKPOINT_CHALLENGE_ID,
        },
        input.attemptId,
      )
      if (!consumed) {
        // ไม่แยกเหตุผล — รายละเอียดคือ oracle ให้คนเดา attempt_id (W0-0)
        return NextResponse.json({ ok: false, error: 'ความพยายามนี้ใช้ไม่ได้แล้ว' }, { status: 409 })
      }
    }

    // ── MCQ ──────────────────────────────────────────────────────────────
    //
    // มี attempt = ตรวจจากของที่ attempt ถือเองทั้งหมด: แปลง key ที่ client เห็น
    // กลับเป็น key จริงด้วยตาราง remap ของ attempt นั้น แล้วเทียบกับ **เฉลย snapshot**
    // ไม่ใช่ไฟล์ปัจจุบัน (attempt อายุ 60 นาที เนื้อหาอาจถูก deploy ทับระหว่างนั้น)
    const results: Record<string, boolean> = {}
    const gradedQuestionIds = consumed ? consumed.params.questionIds : questions.map((q) => q.id)
    if (consumed) {
      // ชุดคำตอบต้องตรงกับชุดข้อของ attempt **พอดี** ไม่ขาดไม่เกิน
      //
      // เดิมวนเฉพาะ questionIds จึงเมิน key แปลกปลอมเงียบๆ ทั้งที่ comment บอกว่า
      // "เจอของแปลกปลอม = ปฏิเสธทั้งชุด" — กติกาที่เขียนไว้กับที่ทำจริงต้องตรงกัน
      // ไม่งั้นรอบหน้าจะไม่มีใครรู้ว่าอันไหนคือของจริง (RIL cross-model รอบ 2)
      const submittedIds = Object.keys(input.answers)
      const expected = new Set(gradedQuestionIds)
      if (submittedIds.length !== expected.size || submittedIds.some((id) => !expected.has(id))) {
        return NextResponse.json({ ok: false, error: 'คำตอบไม่ตรงกับโจทย์ชุดนี้' }, { status: 400 })
      }
      for (const id of gradedQuestionIds) {
        const real = remapAnswersToReal(consumed.params, id, input.answers[id] ?? [])
        if (real === null) {
          // key ที่ไม่มีในตาราง / ข้อที่ไม่ได้อยู่ใน attempt นี้ / key ซ้ำ → ปฏิเสธทั้งชุด
          // ไม่ใช่ตัดตัวปลอมทิ้งเงียบๆ (ดูเหตุผลใน remapAnswersToReal)
          return NextResponse.json({ ok: false, error: 'คำตอบไม่ตรงกับโจทย์ชุดนี้' }, { status: 400 })
        }
        results[id] = sameAnswerSet(real, consumed.params.answerKeys[id] ?? [])
      }
    } else {
      for (const q of questions) {
        results[q.id] = sameAnswerSet(input.answers[q.id] ?? [], q.correct)
      }
    }

    // ⚠️ หลักฐานของโจทย์จำลองต้องเก็บ **ผลราย requirement + เวอร์ชันของโจทย์**
    // ไม่ใช่ boolean รวม เพราะใบรับรองอ้างอิงหลักฐานนี้และต้องตรวจย้อนหลังได้ว่า
    // ผ่านด้วยอะไร (แผน §5 W1 ข้อ 4)
    const simulationEvidence: Record<string, SimulationEvidence> = {}
    // ⚠️ ตรวจจาก **โจทย์ที่ attempt ถือเอง** ไม่ใช่จากไฟล์ปัจจุบัน
    //
    // attempt อายุ 60 นาที · deploy ระหว่างนั้นเปลี่ยนกติกาได้ (หรือลบด่านทิ้ง) ·
    // ตรวจจากไฟล์ = ผู้เรียนถูกตัดสินด้วยกติกาที่เขาไม่เคยเห็น และบทอาจถูกบันทึกว่า
    // ผ่านโดยไม่มีหลักฐานของด่านที่เขาถูกเสิร์ฟมาจริง (RIL cross-model รอบ 2)
    const source = simulationsToGrade(consumed?.params ?? null, sims)
    if (!source.ok) {
      return NextResponse.json(
        { ok: false, error: 'โจทย์ชุดนี้หมดอายุแล้ว เริ่มใหม่อีกครั้ง' },
        { status: 409 },
      )
    }
    const gradedSims = source.simulations
    for (const sim of gradedSims) {
      const submitted = input.simulations?.[sim.id] ?? {}
      const verdict = gradeSimulation(sim.challenge, submitted)
      results[sim.id] = verdict.passed
      simulationEvidence[sim.id] = {
        passed: verdict.passed,
        requirements: verdict.results.map((r) => ({ id: r.id, met: r.met })),
        // ลายนิ้วมือของกติกาจริง ไม่ใช่เวอร์ชันคอร์ส — ดูเหตุผลใน gradingFingerprint
        challengeVersion: gradingFingerprint(sim.challenge),
        at: new Date().toISOString(),
      }
    }

    const correctCount = Object.values(results).filter(Boolean).length
    const totalTasks = gradedQuestionIds.length + gradedSims.length
    // capstone และการ test-out ต้องถูกทุกข้อ · บทปกติใช้เกณฑ์ของโหมดสอน (W0-3)
    //
    // เดิมบทปกติผ่านด้วย "ตอบครบ" เฉยๆ — ตอบผิดทุกข้อก็ได้ `completed` (F2)
    const assessed = isAssessedNode(node) || input.mode === 'test-out'
    // โจทย์จำลองไม่มี "ยังไม่ตอบ" — หน้าจอมีค่าตั้งต้นเสมอ จึงนับความครบเฉพาะ MCQ
    const answeredAll = gradedQuestionIds.every((id) => (input.answers[id]?.length ?? 0) > 0)
    const passed =
      answeredAll && (assessed ? correctCount === totalTasks : passesLearnMode(correctCount, totalTasks))

    await recordNodeEvent(user.account.id, {
      slug: input.slug,
      nodeId: input.nodeId,
      // ตอบแล้วแต่ยังไม่ผ่าน — เก็บผลไว้ แต่สถานะยังไม่ขยับ
      status: passed ? (input.mode === 'test-out' ? 'tested-out' : 'completed') : 'in-progress',
      checkpointResults: results,
      simulationEvidence: Object.keys(simulationEvidence).length > 0 ? simulationEvidence : undefined,
      // ตัวชี้ว่า "ผ่านด้วยความพยายามครั้งไหน" — ส่งเฉพาะตอนผ่านจริงและมี attempt
      passedAttemptId: passed && consumed ? input.attemptId : undefined,
      passedChallengeVersion: passed && consumed ? consumed.challengeVersion : undefined,
    })

    // assessed: รูปของ response ต้องเหมือนกันทั้งผ่านและไม่ผ่าน — ขนาด/จำนวน field
    // ที่ต่างกันก็บอกใบ้ได้ จึงคืน key เดียวเสมอ
    if (assessed) return NextResponse.json({ ok: true, passed })

    const explanations: Record<string, string> = {}
    for (const q of questions) explanations[q.id] = q.explanation
    return NextResponse.json({ ok: true, passed, results, correctCount, total: totalTasks, explanations })
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
    // ⚠️ ทุกเส้นทางที่ส่งความคืบหน้าออกไปหา browser ต้องผ่าน toPublicProgress
    // ผลรายข้อของพื้นผิววัดผลคือเครื่องเฉลย — ดูเหตุผลเต็มใน public-progress.ts
    if (slug) {
      const record = await loadProgress(user.account.id, slug)
      return NextResponse.json({ ok: true, record: toPublicProgress(record, getCourseStructure(slug)) })
    }
    const records = await loadAllProgress(user.account.id)
    return NextResponse.json({
      ok: true,
      records: Object.fromEntries(
        Object.entries(records).map(([courseSlug, record]) => [
          courseSlug,
          toPublicProgress(record, getCourseStructure(courseSlug)),
        ]),
      ),
    })
  } catch (err) {
    console.error('[api/progress] อ่านไม่สำเร็จ:', err)
    return NextResponse.json({ ok: false, error: 'อ่านความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
}
