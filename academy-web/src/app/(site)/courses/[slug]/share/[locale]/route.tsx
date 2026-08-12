import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import { renderPublicCourseShareImage } from '@/lib/course-share-image'
import { toPublicCourse } from '@/lib/content/public-course'
import { isUiLocale } from '@/lib/i18n/ui'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return listPublicCourseSlugs().flatMap((slug) => {
    const course = getPublicCourse(slug)
    return course?.structure.availableLocales.map((locale) => ({ slug, locale })) ?? []
  })
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  if (!isUiLocale(locale)) return new Response(null, { status: 404 })
  const course = getPublicCourse(slug, locale)
  if (!course || course.locale !== locale) return new Response(null, { status: 404 })
  return renderPublicCourseShareImage(toPublicCourse(course))
}
