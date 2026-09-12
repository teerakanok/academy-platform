import type { MetadataRoute } from 'next'
import { absoluteUrl, searchIndexingEnabled } from '@/lib/seo'
import { isCourseAvailabilityError } from '@/lib/course/settings'
import { getVisiblePublicCourses } from '@/lib/course/visibility'

export const dynamic = 'force-dynamic'

// ลงเฉพาะหน้าร้าน — บทเรียนต้องมี account จึงไม่ควรอยู่ใน sitemap
// (crawler ที่ตามลิงก์ไปเจอหน้าที่เข้าไม่ได้ = สัญญาณคุณภาพแย่ต่อทั้งโดเมน)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIndexingEnabled()) return []
  try {
    const courses = await getVisiblePublicCourses()
    return [
      { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
      { url: absoluteUrl('/courses'), changeFrequency: 'weekly', priority: 0.9 },
      ...courses.flatMap((course) =>
        course.structure.availableLocales.map((locale) => ({
          url: absoluteUrl(`/courses/${course.structure.slug}/${locale}`),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        })),
      ),
      { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.1 },
    ]
  } catch (error) {
    if (isCourseAvailabilityError(error)) return []
    throw error
  }
}
