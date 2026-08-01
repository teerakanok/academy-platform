import type { MetadataRoute } from 'next'
import { getAllCourses } from '@/lib/content/course-source'
import { absoluteUrl, searchIndexingEnabled } from '@/lib/seo'

// ลงเฉพาะหน้าร้าน — บทเรียนต้องมี account จึงไม่ควรอยู่ใน sitemap
// (crawler ที่ตามลิงก์ไปเจอหน้าที่เข้าไม่ได้ = สัญญาณคุณภาพแย่ต่อทั้งโดเมน)
export default function sitemap(): MetadataRoute.Sitemap {
  if (!searchIndexingEnabled()) return []
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/courses'), changeFrequency: 'weekly', priority: 0.9 },
    ...getAllCourses().map((c) => ({
      url: absoluteUrl(`/courses/${c.structure.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.1 },
  ]
}
