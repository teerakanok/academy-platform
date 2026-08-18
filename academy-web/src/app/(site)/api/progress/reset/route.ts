import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { deniedAccessStatus, getCourseAccess } from '@/lib/account/course-access'
import { getCourseStructure } from '@/lib/content/course-source'
import { loadProgress, loadResetReceipt, resetProgress } from '@/lib/course/progress-db'
import { safeErrorMessage } from '@/lib/safe-log'

export const runtime = 'nodejs'

function requestContext(request: Request) {
  const params = new URL(request.url).searchParams
  const slug = params.get('slug')?.trim()
  const operationId = params.get('operationId')?.trim()
  return {
    slug,
    operationId,
    validOperationId: Boolean(
      operationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId),
    ),
  }
}

/** อ่าน receipt ของ operation เดิมและ record ปัจจุบัน โดยไม่ส่ง mutation ซ้ำ */
export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const { slug, operationId, validOperationId } = requestContext(request)
  if (!slug || !operationId || !validOperationId) {
    return NextResponse.json({ ok: false, error: 'ข้อมูล reset ไม่ถูกต้อง' }, { status: 400 })
  }
  if (!getCourseStructure(slug)) {
    return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })
  }

  const access = await getCourseAccess(user.account.id, slug)
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ไม่มีสิทธิ์เข้าถึงคอร์สนี้',
      },
      { status: deniedAccessStatus(access) },
    )
  }

  try {
    const completed = await loadResetReceipt(user.account.id, slug, operationId)
    return NextResponse.json({
      ok: true,
      completed,
      record: completed ? await loadProgress(user.account.id, slug) : undefined,
    })
  } catch (error) {
    console.error('[api/progress/reset] ตรวจ receipt ไม่สำเร็จ:', safeErrorMessage(error))
    return NextResponse.json({ ok: false, error: 'ตรวจผลการล้างความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
}

// ล้างความคืบหน้าของคอร์สหนึ่ง — ของผู้เรียนคนที่ล็อกอินอยู่เท่านั้น
//
// ลบจริง ไม่ใช่ซ่อน: ผู้เรียนขอเริ่มใหม่แปลว่าเขาอยากให้มันหายจริงๆ และการเก็บซาก
// ไว้เงียบๆ จะทำให้ใบรับรองอ้างอิงสิ่งที่เจ้าตัวคิดว่าลบไปแล้ว
export async function POST(request: Request) {
  const mutation = validateMutationRequest(request)
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })

  const { slug, operationId, validOperationId } = requestContext(request)
  if (!slug || !operationId || !validOperationId) {
    return NextResponse.json({ ok: false, error: 'ข้อมูล reset ไม่ถูกต้อง' }, { status: 400 })
  }
  if (!getCourseStructure(slug)) {
    return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })
  }

  const access = await getCourseAccess(user.account.id, slug)
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ไม่มีสิทธิ์เข้าถึงคอร์สนี้',
      },
      { status: deniedAccessStatus(access) },
    )
  }

  // RPC เพิ่ม progress epoch พร้อมลบแถวใน transaction เดียว request ที่เริ่มก่อน
  // reset จึงเขียนสถานะกลับมาทีหลังไม่ได้ และ **ห้าม** ลบ attempt — นั่นคือสมุดนับโควตา
  //
  // เคยลบไปแล้วรอบหนึ่งด้วยเหตุผลเรื่อง UX ("กดเริ่มใหม่แล้วเจอ 429 งงแน่") ·
  // RIL cross-model จับว่ามันลบโควตาทิ้งทั้งหมด: คนที่ตั้งใจไล่ลองเฉลยไม่มีความ
  // คืบหน้าให้เสียอยู่แล้ว จึงกด reset สลับกับขอ attempt ได้ไม่จำกัด — speed bump
  // หายเกลี้ยงโดยที่หน้าเว็บดูปกติดี
  //
  // ปัญหา UX เดิมแก้ที่ปลายทางแทน: `/api/attempts` บอกเวลาที่ขอได้อีกครั้ง และหน้าจอ
  // แสดงข้อความจริงแทนที่จะเงียบ (ดู use-lesson-attempt.ts)

  try {
    const applied = await resetProgress(user.account.id, slug, operationId)
    if (!applied) {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึงคอร์สนี้' }, { status: 403 })
    }
  } catch (error) {
    console.error('[api/progress/reset] ลบไม่สำเร็จ:', safeErrorMessage(error))
    return NextResponse.json({ ok: false, error: 'ล้างความคืบหน้าไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
