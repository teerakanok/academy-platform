import * as React from 'react'
import { notFound, redirect } from 'next/navigation'
import { CourseOverview } from '@/components/course/CourseOverview'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource } from '@/lib/account/course-access'
import { getCourse } from '@/lib/content/course-source'
import { toPublicCourse } from '@/lib/content/public-course'
import type { Locale } from '@/lib/content/course-types'
import { privatePage } from '@/lib/seo'

export const metadata = privatePage()

export default async function LearnerCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const locale: Locale | undefined = lang === 'en' || lang === 'th' ? lang : undefined
  const course = getCourse(slug, locale)
  if (!course) notFound()

  const target = `/courses/${slug}/learn${locale ? `?lang=${locale}` : ''}`
  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(target)}`)

  const access = await authorizeCourseResource(user.account.id, slug)
  if (!access.allowed) {
    if (access.reason === 'unavailable') throw new Error('Academy access store unavailable')
    const denied = new URLSearchParams({ course: slug })
    if (locale) denied.set('lang', locale)
    redirect(`/access-required?${denied.toString()}`)
  }

  const learnerView = toPublicCourse(course)

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseOverview
        {...learnerView}
        learnerRoute
      />
    </div>
  )
}
