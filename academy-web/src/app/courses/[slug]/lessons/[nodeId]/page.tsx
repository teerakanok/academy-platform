import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCourse, getLesson } from '@/lib/content/course-source'
import type { Locale } from '@/lib/content/course-types'
import { LessonView } from '@/components/course/LessonView'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

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
  const resolved = getLesson(slug, nodeId, locale)
  if (!course || !resolved) notFound()

  const node = course.structure.nodes.find((n) => n.id === nodeId)
  if (!node) notFound()

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <LessonView
        structure={course.structure}
        node={node}
        lesson={resolved.lesson}
        courseTitle={course.copy.title}
        nodeTitles={course.copy.nodeTitles}
        servedLocale={resolved.servedLocale}
        requestedLocale={resolved.requestedLocale}
      />
    </div>
  )
}
