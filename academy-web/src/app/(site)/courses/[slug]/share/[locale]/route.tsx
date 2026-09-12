import { renderPublicCourseShareImage } from '@/lib/course-share-image'
import { toPublicCourse } from '@/lib/content/public-course'
import { isUiLocale } from '@/lib/i18n/ui'
import { isCourseAvailabilityError } from '@/lib/course/settings'
import { getVisiblePublicCourse } from '@/lib/course/visibility'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  if (!isUiLocale(locale)) return new Response(null, { status: 404 })
  let course
  try {
    course = await getVisiblePublicCourse(slug, locale)
  } catch (error) {
    if (isCourseAvailabilityError(error)) {
      return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    throw error
  }
  if (!course || course.locale !== locale) return new Response(null, { status: 404 })
  const image = await renderPublicCourseShareImage(toPublicCourse(course))
  image.headers.set('cache-control', 'no-store')
  return image
}
