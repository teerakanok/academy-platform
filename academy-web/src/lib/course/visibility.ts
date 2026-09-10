import 'server-only'

import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import type { Course } from '@/lib/content/course-types'
import type { Locale } from '@/lib/content/course-types'
import { loadAllCourseOverrides } from '@/lib/course/settings'

/**
 * Runtime-aware catalog: combines the static course registry with the
 * founder's course_settings overrides. Courses whose runtime visibility
 * is 'unpublished' or 'retired' are excluded from the catalog.
 *
 * Titles/subtitles from overrides replace the static copy so the founder's
 * edits appear on the catalog without rebuilding.
 */
export async function getVisiblePublicCourses(locale?: Locale): Promise<Course[]> {
  const overrides = await loadAllCourseOverrides()
  return listPublicCourseSlugs()
    .filter((slug) => {
      const override = overrides.get(slug)
      if (!override) return true
      return override.visibility === 'published'
    })
    .map((slug) => {
      const course = getPublicCourse(slug, locale)
      if (!course) return null
      const override = overrides.get(slug)
      if (!override) return course
      return {
        ...course,
        copy: {
          ...course.copy,
          title: override.titleOverride ?? course.copy.title,
          subtitle: override.subtitleOverride ?? course.copy.subtitle,
        },
      }
    })
    .filter((course): course is Course => course !== null)
}
