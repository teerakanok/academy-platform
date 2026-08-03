import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
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
  searchParams: Promise<{ course?: string; next?: string }>
}) {
  const { course: slug, next: rawNext } = await searchParams
  if (!slug) notFound()
  const next = safeLessonPath(rawNext, slug)
  const langValue = next ? new URL(next, 'http://academy.local').searchParams.get('lang') : null
  const locale: Locale | undefined = langValue === 'th' || langValue === 'en' ? langValue : undefined
  const overview = `/courses/${slug}${locale ? `?lang=${locale}` : ''}`
  const course = getCourse(slug, locale)
  if (!course) notFound()

  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next ?? overview)}`)

  const nodeId = next ? next.split('?')[0].split('/').at(-1) : undefined
  const access = await authorizeCourseResource(user.account.id, slug, nodeId)
  if (access.allowed) redirect(next ?? overview)
  if (!access.allowed && access.reason === 'unavailable') throw new Error('Academy access store unavailable')

  const inactive = !access.allowed && access.reason === 'inactive'
  const locked = !access.allowed && access.reason === 'locked'
  return (
    <main className="mx-auto max-w-2xl px-6 py-16" data-testid="course-access-required">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">Course access</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-cs-text">
        {inactive ? 'Academy access is not active yet' : locked ? 'This lesson is not unlocked yet' : 'This course is not in your access'}
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-cs-body">
        {inactive
          ? 'Your CYBERSKILLS account is signed in, but Academy enrollment has not been activated. No learning record has been changed.'
          : locked
            ? 'Continue from the course roadmap first. Your learning record and completed work are unchanged.'
            : `${course.copy.title} is not included in your current enrollment. Your existing learning record is unchanged.`}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={locked ? overview : '/dashboard'}
          className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
        >
          {locked ? 'Return to the course roadmap' : 'Return to My learning'}
        </Link>
        <Link
          href="/courses"
          className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm text-cs-body hover:border-cs-accent"
        >
          Browse courses
        </Link>
      </div>
    </main>
  )
}
