import { notFound, redirect } from 'next/navigation'
import { AccessRequiredView } from '@/components/course/AccessRequiredView'
import { CourseLocaleChromeSync } from '@/components/course/CourseLocaleChromeSync'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource } from '@/lib/account/course-access'
import { getCourse } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { privatePage } from '@/lib/seo'

export const metadata = privatePage('Course access')

function safeLessonPath(raw: string | undefined, course: string): string | null {
  if (!raw?.startsWith(`/courses/${course}/lessons/`)) return null
  if (raw.startsWith('//') || raw.includes('\\')) return null
  return raw
}

export default async function AccessRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; next?: string; lang?: string }>
}) {
  const { course: slug, next: rawNext, lang: rawLang } = await searchParams
  if (!slug) notFound()
  const next = safeLessonPath(rawNext, slug)
  const langValue = next ? new URL(next, 'http://academy.local').searchParams.get('lang') : null
  const explicitLocale: Locale | undefined = rawLang === 'th' || rawLang === 'en' ? rawLang : undefined
  const locale: Locale | undefined = explicitLocale
    ?? (langValue === 'th' || langValue === 'en' ? langValue : undefined)
  const course = getCourse(slug, locale)
  if (!course) notFound()
  const overview = `/courses/${slug}/learn?lang=${course.locale}`

  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next ?? overview)}`)

  const nodeId = next ? next.split('?')[0].split('/').at(-1) : undefined
  const access = await authorizeCourseResource(user.account.id, slug, nodeId)
  if (access.allowed) redirect(next ?? overview)
  if (!access.allowed && access.reason === 'unavailable') throw new Error('Academy access store unavailable')

  const reason = access.reason === 'inactive'
    ? 'inactive'
    : access.reason === 'locked' ? 'locked' : 'not-enrolled'
  return (
    <>
      <CourseLocaleChromeSync
        locale={course.locale}
        availableLocales={course.structure.availableLocales}
        requestedLocale={locale}
        localeParameterPresent={locale !== undefined}
      />
      <AccessRequiredView
        courseTitle={course.copy.title}
        locale={course.locale}
        reason={reason}
        slug={slug}
      />
    </>
  )
}
