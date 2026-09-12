import { getCourse } from '@/lib/content/course-source'
import { publicPage } from '@/lib/seo'
import { toPublicCourseCatalogItem } from '@/lib/content/public-course'
import type { Locale } from '@/lib/content/course-types'
import { PublicCourseCatalog } from '@/components/course/PublicCourseCatalog'
import { applyCourseAvailability } from '@/lib/course/visibility'
import { loadAllCourseOverrides } from '@/lib/course/settings'

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
  const availability = await loadAllCourseOverrides()
  const courses = [...availability.entries()]
    .filter(([, settings]) => settings.visibility === 'published')
    .flatMap(([slug, settings]) => {
      const defaultCourse = getCourse(slug)
      if (!defaultCourse) return []
      const course = applyCourseAvailability(defaultCourse, settings)
      const copies = Object.fromEntries(
        course.structure.availableLocales.flatMap((locale: Locale) => {
          const localized = getCourse(slug, locale)
          if (!localized) return []
          const localizedCopy = applyCourseAvailability(localized, settings).copy
          return [[locale, { title: localizedCopy.title, subtitle: localizedCopy.subtitle }]]
        }),
      ) as Partial<Record<Locale, { title: string; subtitle: string }>>
      return [toPublicCourseCatalogItem(course, copies)]
    })

  return <PublicCourseCatalog courses={courses} />
}
