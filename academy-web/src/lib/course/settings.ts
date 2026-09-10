import 'server-only'

import { academyDb } from '@/lib/db/server'
import { safeErrorMessage } from '@/lib/safe-log'

export type CourseVisibility = 'published' | 'unpublished' | 'retired'

export interface CourseSettingsRecord {
  courseSlug: string
  titleOverride: string | null
  subtitleOverride: string | null
  visibility: CourseVisibility | null
  editedAt: string
}

export interface EffectiveCourseAvailability {
  /** What the catalog and course detail should use */
  visibility: CourseVisibility
  /** Whether the runtime settings override the static value */
  overridden: boolean
  titleOverride: string | null
  subtitleOverride: string | null
}

/**
 * Resolve the effective visibility for a course by combining the static
 * build-time publicAvailability with any runtime override in course_settings.
 *
 * The static value acts as the default: 'syllabus-preview' → 'published',
 * 'internal' → 'unpublished'. A runtime row can override either direction,
 * including 'retired' which removes the course from all learner surfaces.
 */
export async function resolveCourseAvailability(
  staticAvailability: 'internal' | 'syllabus-preview',
  courseSlug: string,
): Promise<EffectiveCourseAvailability> {
  const fallback: CourseVisibility =
    staticAvailability === 'syllabus-preview' ? 'published' : 'unpublished'
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_settings')
      .select('title_override, subtitle_override, visibility, edited_at')
      .eq('course_slug', courseSlug)
      .maybeSingle()
    if (error) throw new Error(`อ่านการตั้งค่าคอร์สไม่สำเร็จ: ${error.message}`)
    if (!data) {
      return { visibility: fallback, overridden: false, titleOverride: null, subtitleOverride: null }
    }
    return {
      visibility: (data.visibility as CourseVisibility | null) ?? fallback,
      overridden: data.visibility !== null,
      titleOverride: (data.title_override as string | null) ?? null,
      subtitleOverride: (data.subtitle_override as string | null) ?? null,
    }
  } catch (error) {
    console.error('[course-settings] อ่านการตั้งค่าคอร์สไม่สำเร็จ:', safeErrorMessage(error))
    return { visibility: fallback, overridden: false, titleOverride: null, subtitleOverride: null }
  }
}

/** Load all runtime overrides in one call (for the catalog page). */
export async function loadAllCourseOverrides(): Promise<Map<string, EffectiveCourseAvailability>> {
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_settings')
      .select('course_slug, title_override, subtitle_override, visibility')
    if (error) throw new Error(`อ่านการตั้งค่าคอร์สไม่สำเร็จ: ${error.message}`)
    const map = new Map<string, EffectiveCourseAvailability>()
    for (const row of data ?? []) {
      map.set(row.course_slug as string, {
        visibility: (row.visibility as CourseVisibility | null) ?? 'published',
        overridden: row.visibility !== null,
        titleOverride: (row.title_override as string | null) ?? null,
        subtitleOverride: (row.subtitle_override as string | null) ?? null,
      })
    }
    return map
  } catch (error) {
    console.error('[course-settings] อ่านการตั้งค่าทั้งหมดไม่สำเร็จ:', safeErrorMessage(error))
    return new Map()
  }
}
