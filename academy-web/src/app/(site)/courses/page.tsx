import { getPublicCourse } from '@/lib/content/course-source'
import { publicPage } from '@/lib/seo'
import { toPublicCourseCatalogItem } from '@/lib/content/public-course'
import type { Locale } from '@/lib/content/course-types'
import { PublicCourseCatalog } from '@/components/course/PublicCourseCatalog'
import { getVisiblePublicCourses } from '@/lib/course/visibility'

// หน้าร้านสาธารณะ — แยกจาก /dashboard ("My learning") โดยตั้งใจ. ข้อมูลที่ข้าม
// ไป client ถูกตัดเป็น catalog DTO ใน toPublicCourseCatalogItem เสมอ.
// Visibility และ title/subtitle ผ่าน runtime course_settings ของเจ้าของคอร์ส.

export const metadata = publicPage({
  path: '/courses',
  title: 'Course previews',
  description: 'See each course route before learning access opens: the lessons, prerequisite order, and required checkpoints.',
})

export const dynamic = 'force-dynamic'

export default async function CoursesPage() {
  const visibleCourses = await getVisiblePublicCourses()
  const courses = visibleCourses.flatMap((course) => {
    const slug = course.structure.slug
    const copies = Object.fromEntries(
      course.structure.availableLocales.flatMap((locale: Locale) => {
        const localized = getPublicCourse(slug, locale)
        return localized ? [[locale, { title: localized.copy.title, subtitle: localized.copy.subtitle }]] : []
      }),
    ) as Partial<Record<Locale, { title: string; subtitle: string }>>
    return [toPublicCourseCatalogItem(course, copies)]
  })

  return <PublicCourseCatalog courses={courses} />
}
