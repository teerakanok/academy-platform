import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource, deniedAccessStatus } from '@/lib/account/course-access'
import { getCourse } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { toLearnerState } from '@/lib/course/progress'
import { loadProgress } from '@/lib/course/progress-db'
import { courseSkillData } from '@/lib/course/skills'
import { safeErrorMessage } from '@/lib/safe-log'

export const runtime = 'nodejs'

function learnerResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/**
 * Topic coverage is learner data, not public course metadata. The endpoint
 * computes it after the same course authorization used for lessons and returns
 * a finished presentation DTO rather than content weights or progress evidence.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await currentUser()
  if (!user) return learnerResponse({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, 401)

  const { slug } = await params
  const requestedLocale = new URL(request.url).searchParams.get('lang')
  const locale: Locale | undefined = requestedLocale === 'en' || requestedLocale === 'th' ? requestedLocale : undefined
  const course = getCourse(slug, locale)
  if (!course) return learnerResponse({ ok: false, error: 'ไม่พบคอร์สนี้' }, 404)

  const access = await authorizeCourseResource(user.account.id, course.structure.slug)
  if (!access.allowed) {
    return learnerResponse(
      { ok: false, error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ไม่มีสิทธิ์เข้าถึงคอร์สนี้' },
      deniedAccessStatus(access),
    )
  }

  try {
    const record = await loadProgress(user.account.id, course.structure.slug)
    return learnerResponse({
      ok: true,
      coverage: courseSkillData(course.structure, course.copy.skillLabels, toLearnerState(record)),
    })
  } catch (error) {
    console.error('[api/course-skill-map] อ่านความคืบหน้าไม่สำเร็จ:', safeErrorMessage(error))
    return learnerResponse({ ok: false, error: 'อ่านข้อมูลหัวข้อเรียนไม่สำเร็จ' }, 503)
  }
}
