import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import { publicPage } from '@/lib/seo'
import { toPublicCourseCatalogItem } from '@/lib/content/public-course'
import type { Locale } from '@/lib/content/course-types'
import { PublicCourseCatalog } from '@/components/course/PublicCourseCatalog'

// หน้าร้านสาธารณะ — แยกจาก /dashboard ("My learning") โดยตั้งใจ. ข้อมูลที่ข้าม
// ไป client ถูกตัดเป็น catalog DTO ใน toPublicCourseCatalogItem เสมอ.

export const metadata = publicPage({
  path: '/courses',
  title: 'Course previews',
  description: 'See each course route before learning access opens: the lessons, prerequisite order, and required checkpoints.',
})

export default function CoursesPage() {
  const courses = listPublicCourseSlugs().flatMap((slug) => {
    const course = getPublicCourse(slug)
    if (!course) return []
    const copies = Object.fromEntries(
      course.structure.availableLocales.flatMap((locale) => {
        const localized = getPublicCourse(slug, locale)
        return localized ? [[locale, { title: localized.copy.title, subtitle: localized.copy.subtitle }]] : []
      }),
    ) as Partial<Record<Locale, { title: string; subtitle: string }>>
    return [toPublicCourseCatalogItem(course, copies)]
  })

  return <PublicCourseCatalog courses={courses} />
}
