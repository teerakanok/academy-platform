import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import { notFound, redirect } from 'next/navigation'
import { getCourse, getLesson } from '@/lib/content/course-source'
import { toPublicLesson } from '@/lib/content/public-lesson'
import { requiresAttempt } from '@/lib/course/assessment-policy'
import type { Locale } from '@/lib/content/course-types'
import { LessonView } from '@/components/course/LessonView'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource } from '@/lib/account/course-access'
import { resolveAuthorizedLessonMedia } from '@/lib/media/resolve'

export const metadata: Metadata = privatePage()

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; nodeId: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug, nodeId } = await params
  const { lang } = await searchParams
  const locale: Locale | undefined = lang === 'th' || lang === 'en' ? lang : undefined

  const course = getCourse(slug, locale)
  if (!course) notFound()

  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/courses/${slug}/lessons/${nodeId}`)}`)

  const access = await authorizeCourseResource(user.account.id, slug, nodeId)
  if (!access.allowed) {
    if (access.reason === 'unavailable') throw new Error('Academy access store unavailable')
    const lessonPath = `/courses/${slug}/lessons/${nodeId}${locale ? `?lang=${locale}` : ''}`
    const denied = new URLSearchParams({ course: slug, next: lessonPath })
    redirect(`/access-required?${denied.toString()}`)
  }

  const resolved = getLesson(slug, nodeId, locale)
  if (!resolved) notFound()

  const node = course.structure.nodes.find((n) => n.id === nodeId)
  if (!node) notFound()

  const mediaSecret = process.env.MEDIA_SIGNING_SECRET
  if (!mediaSecret) throw new Error('Private lesson media is not configured')
  const publicLesson = toPublicLesson(resolved.lesson, {
    tasksFromAttempt: requiresAttempt(
      node,
      resolved.lesson.checkpoint.some((item) => item.kind === 'simulation'),
    ),
  })
  const authorizedMedia = await resolveAuthorizedLessonMedia(node, publicLesson, {
    courseSlug: slug,
    nodeId,
  })

  return (
    // ~70ch ที่ขนาดตัวอักษรของเนื้อหา — กว้างพอสำหรับตาราง/โค้ด แต่ยังอ่านยาวสบาย
    // และทุกบล็อกใช้ขอบเดียวกันหมด
    //
    // ⚠️ lesson ต้องผ่าน toPublicLesson() เสมอ — ส่ง resolved.lesson ตรงๆ คือ F1
    // (เฉลยทั้งบทอยู่ใน payload ที่ view-source เห็น) · ชนิดของ LessonView บังคับไว้แล้ว
    <div className="mx-auto max-w-[46rem] px-6 py-12">
      <LessonView
        structure={course.structure}
        node={authorizedMedia.node}
        lesson={authorizedMedia.lesson}
        courseTitle={course.copy.title}
        nodeTitles={course.copy.nodeTitles}
        servedLocale={resolved.servedLocale}
        requestedLocale={resolved.requestedLocale}
      />
    </div>
  )
}
