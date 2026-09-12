import 'server-only'

import { getCourse, listCourseSlugs } from '@/lib/content/course-source'
import type { Course } from '@/lib/content/course-types'
import type { Locale } from '@/lib/content/course-types'
import {
  getEffectiveCourseAvailability,
  loadAllCourseOverrides,
  type EffectiveCourseAvailability,
} from '@/lib/course/settings'

/**
 * Runtime-aware catalog: combines the static course registry with the
 * founder's course_settings overrides. Courses whose runtime visibility
 * is 'unpublished' or 'retired' are excluded from the catalog.
 *
 * Titles/subtitles from overrides replace the static copy so the founder's
 * edits appear on the catalog without rebuilding.
 */
export function applyCourseAvailability(
  course: Course,
  availability: EffectiveCourseAvailability,
): Course {
  if (!availability.titleOverride && !availability.subtitleOverride) return course
  return {
    ...course,
    copy: {
      ...course.copy,
      title: availability.titleOverride ?? course.copy.title,
      subtitle: availability.subtitleOverride ?? course.copy.subtitle,
    },
  }
}

export async function getVisiblePublicCourse(
  slug: string,
  locale?: Locale,
): Promise<Course | null> {
  const effective = await getEffectiveCourseAvailability(slug)
  if (!effective || effective.visibility !== 'published') return null
  const course = getCourse(slug, locale)
  return course ? applyCourseAvailability(course, effective) : null
}

export async function getVisiblePublicCourses(locale?: Locale): Promise<Course[]> {
  const availability = await loadAllCourseOverrides()
  return listCourseSlugs()
    .map((slug) => {
      const effective = availability.get(slug)
      if (!effective || effective.visibility !== 'published') return null
      const course = getCourse(slug, locale)
      return course ? applyCourseAvailability(course, effective) : null
    })
    .filter((course): course is Course => course !== null)
}
