import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  single: { data: null as Record<string, unknown> | null, error: null as { message: string } | null },
  all: { data: [] as Record<string, unknown>[], error: null as { message: string } | null },
}))

vi.mock('@/lib/db/server', () => ({
  academyDb: () => ({
    from: () => ({
      select: (columns: string) => columns.includes('course_slug')
        ? Promise.resolve(state.all)
        : {
            eq: () => ({ maybeSingle: () => Promise.resolve(state.single) }),
          },
    }),
  }),
}))

import {
  CourseAvailabilityError,
  loadAllCourseOverrides,
  resolveCourseAvailability,
} from '@/lib/course/settings'
import { getVisiblePublicCourse, getVisiblePublicCourses } from '@/lib/course/visibility'

describe('runtime course availability security', () => {
  beforeEach(() => {
    state.single = { data: null, error: null }
    state.all = { data: [], error: null }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the static registry only as the default when the settings store is reachable', async () => {
    await expect(resolveCourseAvailability('syllabus-preview', 'basic-os-linux')).resolves.toMatchObject({
      visibility: 'published',
      overridden: false,
    })
    await expect(resolveCourseAvailability('internal', 'content-formats-demo')).resolves.toMatchObject({
      visibility: 'unpublished',
      overridden: false,
    })
  })

  it('honors a runtime retirement before returning a public course', async () => {
    state.single.data = {
      visibility: 'retired',
      title_override: null,
      subtitle_override: null,
      edited_at: '2026-09-12T00:00:00.000Z',
    }

    await expect(getVisiblePublicCourse('basic-os-linux', 'en')).resolves.toBeNull()
  })

  it('fails closed when a single-course availability read fails', async () => {
    state.single.error = { message: 'sensitive backend detail' }

    await expect(getVisiblePublicCourse('basic-os-linux', 'en')).rejects.toBeInstanceOf(CourseAvailabilityError)
    expect(console.error).toHaveBeenCalledWith(
      '[course-settings] อ่านการตั้งค่าคอร์สไม่สำเร็จ:',
      'operation_failed',
    )
  })

  it('fails closed when the catalog availability read fails', async () => {
    state.all.error = { message: 'sensitive backend detail' }

    await expect(getVisiblePublicCourses('en')).rejects.toBeInstanceOf(CourseAvailabilityError)
    await expect(loadAllCourseOverrides()).rejects.toBeInstanceOf(CourseAvailabilityError)
  })

  it('filters runtime-unpublished courses and applies safe runtime copy overrides', async () => {
    state.all.data = [
      {
        course_slug: 'basic-os-linux',
        visibility: 'unpublished',
        title_override: null,
        subtitle_override: null,
      },
      {
        course_slug: 'content-formats-demo',
        visibility: 'published',
        title_override: 'Runtime title',
        subtitle_override: 'Runtime subtitle',
      },
    ]

    const courses = await getVisiblePublicCourses('en')
    expect(courses.some((course) => course.structure.slug === 'basic-os-linux')).toBe(false)
    expect(courses.find((course) => course.structure.slug === 'content-formats-demo')?.copy).toMatchObject({
      title: 'Runtime title',
      subtitle: 'Runtime subtitle',
    })
  })
})
