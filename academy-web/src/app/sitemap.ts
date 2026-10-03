import type { MetadataRoute } from 'next'
import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import { requireEffectiveCourseVisibility } from '@/lib/course/settings'
import { absoluteUrl, searchIndexingEnabled } from '@/lib/seo'

export const dynamic = 'force-dynamic'

// ลงเฉพาะหน้าร้าน — บทเรียนต้องมี account จึงไม่ควรอยู่ใน sitemap
// (crawler ที่ตามลิงก์ไปเจอหน้าที่เข้าไม่ได้ = สัญญาณคุณภาพแย่ต่อทั้งโดเมน)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIndexingEnabled()) return []
  const publicCourses = await Promise.all(listPublicCourseSlugs().map(async (slug) => {
    const course = getPublicCourse(slug)
    if (!course) return []
    const visibility = await requireEffectiveCourseVisibility(course.structure.publicAvailability, slug)
    if (visibility !== 'published') return []
    return course.structure.availableLocales.map((locale) => ({
      url: absoluteUrl(`/courses/${slug}/${locale}`),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  }))

  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/courses'), changeFrequency: 'weekly', priority: 0.9 },
    ...publicCourses.flat(),
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.1 },
  ]
}
