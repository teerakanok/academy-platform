import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCourse } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { CourseOverview } from '@/components/course/CourseOverview'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const course = getCourse(slug, lang === 'th' || lang === 'en' ? (lang as Locale) : undefined)
  if (!course) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <CourseOverview
        structure={course.structure}
        copy={course.copy}
        locale={course.locale}
        translatedNodeIds={course.translatedNodeIds}
      />
    </div>
  )
}
