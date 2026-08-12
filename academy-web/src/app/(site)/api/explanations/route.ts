import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { getCourseStructure } from '@/lib/content/course-source'
import { getLessonAnswerKey, mcqItems, simulationItems } from '@/lib/content/answer-key'
import { requiresAttempt } from '@/lib/course/assessment-policy'
import { loadProgress } from '@/lib/course/progress-db'
import { authorizeCourseResource, deniedAccessStatus } from '@/lib/account/course-access'
import { loadPassedAttemptExplanations } from '@/lib/course/attempt-db'

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

  const access = await authorizeCourseResource(user.account.id, input.slug, input.nodeId)
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ยังไม่มีสิทธิ์เข้าถึงบทนี้' },
      { status: deniedAccessStatus(access) },
    )
  }

  const record = await loadProgress(user.account.id, input.slug)
  // บทนี้ผ่านแล้วหรือยัง — ใช้คำว่า finished ไม่ใช่ proven เพราะสิ่งที่ตัดสินคือ
  // "เดินผ่านแล้ว" ส่วนคำว่าพิสูจน์แล้วสงวนให้ด่านวัดผล (W0-3)
  const finished = record.completed.includes(input.nodeId) || record.testedOut.includes(input.nodeId)
  // เงื่อนไขนี้พึ่งข้อเท็จจริงสองข้อ ซึ่งถ้าข้อใดเปลี่ยนต้องกลับมาแก้ที่นี่ทันที:
  //   1. capstone ได้ `completed` ก็ต่อเมื่อถูกทุกข้อ (assessed) เท่านั้น
  //   2. `tested-out` เกิดได้เฉพาะบน node ที่นโยบายเปิด test-out ให้ ซึ่งวันนี้ปิดหมด
  //      (assessment-policy.ts) — ไม่งั้นเฉลยจากโหมด learn จะเปิดคลังเฉลยของโหมดวัดผล
  if (!finished) {
    // ตอบเหมือนกันทุกกรณีที่ยังไม่ควรเปิดเผย — ไม่บอกว่า "ใกล้แล้ว" หรือ "อีกนิดเดียว"
    return NextResponse.json({ ok: false, error: 'บทนี้ยังไม่ผ่าน' }, { status: 403 })
  }

  // ใช้หลักฐาน persisted เป็นตัวตัดสิน ไม่เดาจาก content ปัจจุบัน: deploy อาจเพิ่ม
  // หรือลบด่าน attempt หลังผู้เรียนผ่านไปแล้ว แต่ review ต้องตามรุ่นที่เขาทำจริง
  const snapshot = await loadPassedAttemptExplanations({
    userId: user.account.id,
    courseSlug: input.slug,
    nodeId: input.nodeId,
  })
  if (snapshot.status === 'unavailable') {
    return NextResponse.json(
      { ok: false, error: 'คำอธิบายของความพยายามนี้ไม่พร้อมใช้งาน' },
      { status: 409 },
    )
  }
  if (snapshot.status === 'ready') {
    return NextResponse.json({
      ok: true,
      questions: Object.entries(snapshot.explanations).map(([id, explanation]) => ({ id, explanation })),
    })
  }

  const answerKey = getLessonAnswerKey(input.slug, input.nodeId)
  if (!answerKey) return NextResponse.json({ ok: false, error: 'ไม่พบเนื้อหาบทนี้' }, { status: 404 })
  if (requiresAttempt(node, simulationItems(answerKey.checkpoint).length > 0)) {
    // completion ของพื้นผิววัดผลที่ไม่มี passing attempt pointer ไม่ใช่หลักฐานพอ
    // สำหรับเปิดคำอธิบาย; fail closed แทนการเสิร์ฟคลังจาก deploy ปัจจุบัน
    return NextResponse.json(
      { ok: false, error: 'คำอธิบายของความพยายามนี้ไม่พร้อมใช้งาน' },
      { status: 409 },
    )
  }

  // ⚠️ คืน **คำอธิบายอย่างเดียว ไม่คืน key เฉลย**
  //
  // key เฉลยเป็น key จริงในไฟล์ ซึ่งใช้ได้กับทุกคน: คนที่ผ่านแล้วบอกเพื่อนว่า
  // "B, C, B" เพื่อนเทียบข้อความแล้วแปลงเป็น key ของ attempt ตัวเองได้ทันที
  // (RIL cross-model รอบ 2 เดินเคสนี้ให้ดู) · คนที่ผ่านแล้วรู้อยู่แล้วว่าตัวเองตอบอะไร
  // สิ่งที่เขายังไม่รู้และเป็นประโยชน์จริงคือ **ทำไม** จึงคืนเฉพาะส่วนนั้น
  //
  // หมายเหตุตรงๆ: ตราบใดที่คลังข้อยังเท่าจำนวนที่เสิร์ฟ (W-content ยังไม่เข้า)
  // การบอกต่อ "ข้อความ" ของตัวเลือกที่ถูกก็ยังทำได้อยู่ดี — การหมุนคลังข้อคือสิ่งที่
  // ปิดช่องนั้น ไม่ใช่การซ่อน key
  return NextResponse.json({
    ok: true,
    questions: mcqItems(answerKey.checkpoint).map((q) => ({
      id: q.id,
      explanation: q.explanation,
    })),
  })
}
