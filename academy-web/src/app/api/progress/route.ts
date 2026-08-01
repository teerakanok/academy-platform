import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure, getLesson } from '@/lib/content/course-source'
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

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((v, i) => v === right[i])
}

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

    const resolved = getLesson(input.slug, input.nodeId)
    if (!resolved) return NextResponse.json({ ok: false, error: 'ไม่พบเนื้อหาบทนี้' }, { status: 404 })

    if (input.action === 'video-cue') {
      const cue = resolved.lesson.videoCueQuestions?.find((q) => q.cueId === input.cueId)
      if (!cue) return NextResponse.json({ ok: false, error: 'ไม่พบคำถามนี้' }, { status: 404 })
      const correct = sameSet(input.answer, cue.correct)
      await recordNodeEvent(user.account.id, {
        slug: input.slug,
        nodeId: input.nodeId,
        status: 'in-progress',
        videoCueResults: { [input.cueId]: correct },
      })
      return NextResponse.json({ ok: true, correct })
    }

    // ── checkpoint: เซิร์ฟเวอร์ตรวจเอง ────────────────────────────────────
    const questions = resolved.lesson.checkpoint
    const results: Record<string, boolean> = {}
    for (const q of questions) {
      results[q.id] = sameSet(input.answers[q.id] ?? [], q.correct)
    }
    const correctCount = Object.values(results).filter(Boolean).length
    // capstone และการ test-out ต้องถูกทุกข้อ · บทปกติแค่ทำครบก็ผ่าน
    const mustBePerfect = node.kind === 'capstone' || input.mode === 'test-out'
    const answeredAll = questions.every((q) => (input.answers[q.id]?.length ?? 0) > 0)
    const passed = answeredAll && (mustBePerfect ? correctCount === questions.length : true)

    if (passed) {
      await recordNodeEvent(user.account.id, {
        slug: input.slug,
        nodeId: input.nodeId,
        status: input.mode === 'test-out' ? 'tested-out' : 'completed',
        checkpointResults: results,
      })
    } else {
      // ตอบแล้วแต่ยังไม่ผ่าน — เก็บผลไว้ แต่สถานะยังไม่ขยับ
      await recordNodeEvent(user.account.id, {
        slug: input.slug,
        nodeId: input.nodeId,
        status: 'in-progress',
        checkpointResults: results,
      })
    }

    return NextResponse.json({ ok: true, passed, results, correctCount, total: questions.length })
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
