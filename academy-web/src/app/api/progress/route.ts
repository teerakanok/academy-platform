import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { loadAllProgress, loadProgress, recordNodeEvent } from '@/lib/course/progress-db'

export const runtime = 'nodejs'

// บันทึกความคืบหน้าของบทหนึ่ง
//
// ตัวตนมาจาก session เท่านั้น — ไม่รับ userId จาก body เด็ดขาด ไม่งั้นใครก็เขียน
// ความคืบหน้าให้บัญชีคนอื่นได้ ซึ่งจะทำให้ใบรับรองไม่มีความหมายทันที

const resultMap = z.record(z.string().max(64), z.boolean())

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(120),
  status: z.enum(['in-progress', 'completed', 'tested-out', 'skipped']),
  checkpointResults: resultMap.optional(),
  videoCueResults: resultMap.optional(),
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

  try {
    await recordNodeEvent(user.account.id, parsed.data)
  } catch (err) {
    console.error('[api/progress] บันทึกไม่สำเร็จ:', err)
    // ตอบตามจริง — ถ้าบอกว่าสำเร็จทั้งที่ไม่ได้บันทึก ผู้เรียนจะเสียงานโดยไม่รู้ตัว
    return NextResponse.json({ ok: false, error: 'บันทึกความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
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
