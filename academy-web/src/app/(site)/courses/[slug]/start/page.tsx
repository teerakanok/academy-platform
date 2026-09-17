import * as React from 'react'
import { notFound, redirect } from 'next/navigation'
import { FreeCourseStart } from '@/components/course/FreeCourseStart'
import { CourseLocaleChromeSync } from '@/components/course/CourseLocaleChromeSync'
import { getCourseAccess } from '@/lib/account/course-access'
import { currentUser } from '@/lib/auth/session'
import { getCourse } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { courseLearnPath, freeCourseStartPath, isFreeOffer } from '@/lib/course/offer'
import { privatePage } from '@/lib/seo'

export const metadata = privatePage('Start course')

// "เริ่มเรียนฟรี" ทุกปุ่มชี้มาที่นี่ — ยังไม่ล็อกอินก็พาไป sign-in แล้ว next กลับมาที่หน้านี้,
// ล็อกอินแล้วก็ลงเรียนให้ทันทีแล้วพาไปหน้าเรียน ไม่มีหน้ายืนยันสำหรับคอร์สฟรี
//
// การลงเรียนจริงเกิดที่ POST /api/courses/[slug]/enrol (มี origin check + quota) ไม่ใช่
// ใน GET ของหน้านี้ · คอร์สที่ไม่ฟรีไม่มีทางเข้านี้ (404)
export default async function FreeCourseStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const requested: Locale | undefined = lang === 'en' || lang === 'th' ? lang : undefined
  const course = getCourse(slug, requested)
  if (!course || !isFreeOffer(course.structure.offer)) notFound()

  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(freeCourseStartPath(slug, course.locale))}`)

  const access = await getCourseAccess(user.account.id, slug)
  if (access.allowed) redirect(courseLearnPath(slug, course.locale))
  if (access.reason === 'unavailable') throw new Error('Academy access store unavailable')
  if (access.reason === 'inactive') {
    redirect(`/access-required?${new URLSearchParams({ course: slug, lang: course.locale }).toString()}`)
  }

  return (
    <>
      <CourseLocaleChromeSync
        locale={course.locale}
        availableLocales={course.structure.availableLocales}
        requestedLocale={requested}
        localeParameterPresent={requested !== undefined}
      />
      <FreeCourseStart slug={slug} courseTitle={course.copy.title} locale={course.locale} />
    </>
  )
}
