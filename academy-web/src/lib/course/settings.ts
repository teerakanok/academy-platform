import 'server-only'

import { academyDb } from '@/lib/db/server'
import { safeErrorMessage } from '@/lib/safe-log'
import { getCourseStructure, listCourseSlugs } from '@/lib/content/course-source'

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

export class CourseAvailabilityError extends Error {
  constructor() {
    super('Course availability settings are unavailable')
    this.name = 'CourseAvailabilityError'
  }
}

export function isCourseAvailabilityError(error: unknown): error is CourseAvailabilityError {
  return error instanceof CourseAvailabilityError
}

function fallbackAvailability(staticAvailability: 'internal' | 'syllabus-preview'): CourseVisibility {
  return staticAvailability === 'syllabus-preview' ? 'published' : 'unpublished'
}

function effectiveAvailability(
  staticAvailability: 'internal' | 'syllabus-preview',
  visibility: CourseVisibility | null,
  titleOverride: string | null,
  subtitleOverride: string | null,
): EffectiveCourseAvailability {
  return {
    visibility: visibility ?? fallbackAvailability(staticAvailability),
    overridden: visibility !== null,
    titleOverride,
    subtitleOverride,
  }
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
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_settings')
      .select('title_override, subtitle_override, visibility, edited_at')
      .eq('course_slug', courseSlug)
      .maybeSingle()
    if (error) throw new Error(`อ่านการตั้งค่าคอร์สไม่สำเร็จ: ${error.message}`)
    if (!data) {
      return effectiveAvailability(staticAvailability, null, null, null)
    }
    return effectiveAvailability(
      staticAvailability,
      data.visibility as CourseVisibility | null,
      (data.title_override as string | null) ?? null,
      (data.subtitle_override as string | null) ?? null,
    )
  } catch (error) {
    console.error('[course-settings] อ่านการตั้งค่าคอร์สไม่สำเร็จ:', safeErrorMessage(error))
    throw new CourseAvailabilityError()
  }
}

export async function getEffectiveCourseAvailability(
  courseSlug: string,
): Promise<EffectiveCourseAvailability | null> {
  const structure = getCourseStructure(courseSlug)
  if (!structure) return null
  return resolveCourseAvailability(structure.publicAvailability, courseSlug)
}

/** Resolve every registry course against runtime settings in one call. */
export async function loadAllCourseOverrides(): Promise<Map<string, EffectiveCourseAvailability>> {
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_settings')
      .select('course_slug, title_override, subtitle_override, visibility')
    if (error) throw new Error(`อ่านการตั้งค่าคอร์สไม่สำเร็จ: ${error.message}`)
    const rows = new Map((data ?? []).map((row) => [row.course_slug as string, row]))
    return new Map(listCourseSlugs().map((slug) => {
      const structure = getCourseStructure(slug)
      if (!structure) throw new Error('course registry changed during availability resolution')
      const row = rows.get(slug)
      return [slug, effectiveAvailability(
        structure.publicAvailability,
        (row?.visibility as CourseVisibility | null) ?? null,
        (row?.title_override as string | null) ?? null,
        (row?.subtitle_override as string | null) ?? null,
      )]
    }))
  } catch (error) {
    console.error('[course-settings] อ่านการตั้งค่าทั้งหมดไม่สำเร็จ:', safeErrorMessage(error))
    throw new CourseAvailabilityError()
  }
}
