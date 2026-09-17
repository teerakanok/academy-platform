import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { checkAuthenticatedMutationQuota } from '@/lib/authenticated-mutation-quota'
import { getCourseAccess } from '@/lib/account/course-access'
import { enrolFreeCourse } from '@/lib/account/free-enrolment'
import { getCourseStructure } from '@/lib/content/course-source'
import type { CourseStructure, Locale } from '@/lib/content/course-types'
import { courseLearnPath, isFreeOffer } from '@/lib/course/offer'
import { requireEffectiveCourseVisibility } from '@/lib/course/settings'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { safeErrorMessage } from '@/lib/safe-log'

export const runtime = 'nodejs'

// จุดลงเรียนจุดเดียวของผู้เรียน — วันนี้รองรับเฉพาะคอร์สฟรี
//
// GET  → สถานะสำหรับปุ่มหลักของหน้าคอร์ส (ไม่แก้อะไร)
// POST → ลงเรียนคอร์สฟรี แล้วบอกว่าไปต่อที่ไหน
//
// DB (`academy.enrol_free_course`) เป็นตัวตัดสินจริงเรื่อง "ฟรี" · การเช็ก offer ใน
// course.json ตรงนี้แค่ตอบเร็วและไม่ยิง RPC ที่รู้อยู่แล้วว่าจะถูกปฏิเสธ

const NO_STORE = { 'cache-control': 'private, no-store' }
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/
const MAX_BODY_BYTES = 1024

const bodySchema = z.object({ locale: z.enum(['en', 'th']).optional() }).strict()

export type EnrolmentState = 'enrolled' | 'can-enrol-free' | 'inactive' | 'not-offered'

function json(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

async function courseFor(params: Promise<{ slug: string }>): Promise<CourseStructure | null> {
  const { slug } = await params
  return SLUG.test(slug) ? getCourseStructure(slug) : null
}

/** true = เปิดให้ลงเรียนฟรีอยู่จริงตอนนี้ (offer ฟรี + เผยแพร่อยู่) · throw เมื่ออ่านการตั้งค่าไม่ได้ */
async function freeOfferOpen(structure: CourseStructure): Promise<boolean> {
  if (!isFreeOffer(structure.offer)) return false
  return (await requireEffectiveCourseVisibility(structure.publicAvailability, structure.slug)) === 'published'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await currentUser()
  if (!user) return json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, 401)
  const structure = await courseFor(params)
  if (!structure) return json({ ok: false, error: 'ไม่พบคอร์สนี้' }, 404)

  const access = await getCourseAccess(user.account.id, structure.slug)
  if (access.allowed) return json({ ok: true, state: 'enrolled' satisfies EnrolmentState })
  if (access.reason === 'unavailable') return json({ ok: false, error: 'ตรวจสิทธิ์ไม่สำเร็จ' }, 503)
  if (access.reason === 'inactive') return json({ ok: true, state: 'inactive' satisfies EnrolmentState })
  try {
    const open = await freeOfferOpen(structure)
    return json({ ok: true, state: (open ? 'can-enrol-free' : 'not-offered') satisfies EnrolmentState })
  } catch (error) {
    console.error('[api/courses/enrol] อ่านสถานะคอร์สไม่สำเร็จ:', safeErrorMessage(error))
    return json({ ok: false, error: 'ตรวจสถานะคอร์สไม่สำเร็จ' }, 503)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) return json({ ok: false, error: mutation.error }, mutation.status)

  const body = await readBoundedJson(request, MAX_BODY_BYTES)
  const parsed = body.ok ? bodySchema.safeParse(body.value) : null
  if (!parsed?.success) return json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, 400)

  const user = await currentUser()
  if (!user) return json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, 401)

  const structure = await courseFor(params)
  if (!structure) return json({ ok: false, error: 'ไม่พบคอร์สนี้' }, 404)
  const locale: Locale = parsed.data.locale && structure.availableLocales.includes(parsed.data.locale)
    ? parsed.data.locale
    : structure.defaultLocale
  const next = courseLearnPath(structure.slug, locale)

  if (!isFreeOffer(structure.offer)) {
    return json({ ok: false, reason: 'not-free', error: 'คอร์สนี้ยังลงเรียนเองไม่ได้' }, 403)
  }
  try {
    if (!(await freeOfferOpen(structure))) {
      return json({ ok: false, reason: 'not-published', error: 'ไม่พบคอร์สนี้' }, 404)
    }
  } catch (error) {
    console.error('[api/courses/enrol] อ่านการตั้งค่าคอร์สไม่สำเร็จ:', safeErrorMessage(error))
    return json({ ok: false, reason: 'unavailable', error: 'ระบบยังไม่พร้อมใช้งานชั่วคราว' }, 503)
  }

  const quota = await checkAuthenticatedMutationQuota({
    operation: 'learner-enrol',
    accountId: user.account.id,
    courseSlug: structure.slug,
  })
  if (!quota.allowed) {
    return quota.status === 429
      ? json({ ok: false, reason: 'rate-limited', error: 'ส่งคำขอถี่เกินไป โปรดลองอีกครั้งตามเวลาที่แจ้ง' }, 429, { 'retry-after': String(quota.retryAfterSeconds) })
      : json({ ok: false, reason: 'unavailable', error: 'ระบบยังไม่พร้อมใช้งานชั่วคราว' }, 503)
  }

  const access = await getCourseAccess(user.account.id, structure.slug)
  if (access.allowed) return json({ ok: true, enrolled: true, changed: false, next })
  if (access.reason === 'unavailable') {
    return json({ ok: false, reason: 'unavailable', error: 'ตรวจสิทธิ์ไม่สำเร็จ' }, 503)
  }
  if (access.reason === 'inactive') {
    return json({ ok: false, reason: 'inactive', error: 'บัญชีนี้ยังใช้ Academy ไม่ได้' }, 403)
  }

  try {
    const result = await enrolFreeCourse(user.account.id, structure.slug)
    if (result.ok) return json({ ok: true, enrolled: true, changed: result.changed, next })
    if (result.reason === 'unavailable') {
      return json({ ok: false, reason: 'unavailable', error: 'ลงเรียนไม่สำเร็จ' }, 503)
    }
    if (result.reason === 'invalid') return json({ ok: false, reason: 'invalid', error: 'ไม่พบคอร์สนี้' }, 404)
    return json({ ok: false, reason: result.reason, error: 'คอร์สนี้ยังลงเรียนเองไม่ได้' }, 403)
  } catch (error) {
    console.error('[api/courses/enrol] ลงเรียนไม่สำเร็จ:', safeErrorMessage(error))
    return json({ ok: false, reason: 'unavailable', error: 'ลงเรียนไม่สำเร็จ' }, 503)
  }
}
