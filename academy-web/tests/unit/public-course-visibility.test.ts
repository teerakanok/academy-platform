import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Course } from '@/lib/content/course-types'

const mocks = vi.hoisted(() => ({
  getPublicCourse: vi.fn(),
  listPublicCourseSlugs: vi.fn(() => ['published-course', 'unpublished-course', 'retired-course']),
  requireEffectiveCourseVisibility: vi.fn(),
  loadAllCourseOverrides: vi.fn(),
  renderPublicCourseShareImage: vi.fn(async () => ({ __shareImage: true })),
}))

vi.mock('@/lib/content/course-source', () => ({
  getPublicCourse: mocks.getPublicCourse,
  listPublicCourseSlugs: mocks.listPublicCourseSlugs,
}))
vi.mock('@/lib/course/settings', () => ({
  requireEffectiveCourseVisibility: mocks.requireEffectiveCourseVisibility,
  loadAllCourseOverrides: mocks.loadAllCourseOverrides,
}))
vi.mock('@/lib/course-share-image', () => ({
  publicCourseShareImagePath: (slug: string, locale: string) => `/courses/${slug}/share/${locale}`,
  renderPublicCourseShareImage: mocks.renderPublicCourseShareImage,
}))
vi.mock('@/lib/content/public-course', () => ({
  toPublicCourse: (course: Course) => ({ slug: course.structure.slug, locale: course.locale }),
}))
vi.mock('@/components/course/CourseExperience', () => ({
  CourseExperience: (props: { slug: string; requestedLocale: string }) =>
    createElement(
      'main',
      null,
      `public-course:${props.slug}:${props.requestedLocale}`,
    ),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-nonce': 'test-nonce' })),
}))

import LegacyCoursePage from '@/app/(site)/courses/[slug]/page'
import LocalizedCoursePage, {
  generateMetadata,
} from '@/app/(localized)/courses/[slug]/[locale]/page'
import OpenGraphImage from '@/app/courses/[slug]/opengraph-image'
import { GET as ShareImageGET } from '@/app/(site)/courses/[slug]/share/[locale]/route'
import { getVisiblePublicCourse, getVisiblePublicCourses } from '@/lib/course/visibility'

function courseFor(locale: 'en' | 'th'): Course {
  return {
    locale,
    copy: {
      locale,
      title: `Public course (${locale})`,
      subtitle: 'Runtime visibility control',
      audience: 'Foundational learners',
      outcomes: ['Learn safely'],
      skillLabels: {},
      nodeTitles: {},
    },
    translatedNodeIds: [],
    structure: {
      id: 'published-course',
      slug: 'published-course',
      version: '1',
      publicAvailability: 'syllabus-preview',
      defaultLocale: 'en',
      availableLocales: ['en', 'th'],
      level: 'beginner',
      estimatedMinutes: 60,
      coverMotif: 'terminal',
      skills: [],
      globalSkillWeights: {},
      nodes: [],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as typeof globalThis & { React: unknown }).React = React
  mocks.listPublicCourseSlugs.mockReturnValue(['published-course', 'unpublished-course', 'retired-course'])
  mocks.getPublicCourse.mockImplementation((_slug: string, locale: 'en' | 'th' = 'en') => courseFor(locale))
  mocks.requireEffectiveCourseVisibility.mockImplementation(async () => 'published')
})

describe('runtime public course route visibility', () => {
  it.each(['unpublished', 'retired'] as const)(
    'returns 404 for the legacy overview when visibility is %s',
    async (visibility) => {
      mocks.requireEffectiveCourseVisibility.mockResolvedValueOnce(visibility)

      await expect(
        LegacyCoursePage({
          params: Promise.resolve({ slug: 'unpublished-course' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow(/(?:NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)/)
    },
  )

  it.each(['unpublished', 'retired'] as const)(
    'returns 404 for every localized syllabus route when visibility is %s',
    async (visibility) => {
      mocks.requireEffectiveCourseVisibility.mockResolvedValue(visibility)

      for (const locale of ['en', 'th'] as const) {
        await expect(
          LocalizedCoursePage({
            params: Promise.resolve({ slug: 'unpublished-course', locale }),
          }),
        ).rejects.toThrow(/(?:NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)/)
        await expect(
          generateMetadata({
            params: Promise.resolve({ slug: 'unpublished-course', locale }),
          }),
        ).rejects.toThrow(/(?:NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)/)
      }
    },
  )

  it.each(['unpublished', 'retired'] as const)(
    'returns 404 for both share-image routes when visibility is %s',
    async (visibility) => {
      mocks.requireEffectiveCourseVisibility.mockResolvedValue(visibility)

      await expect(
        OpenGraphImage({ params: Promise.resolve({ slug: 'unpublished-course' }) }),
          ).rejects.toThrow(/(?:NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)/)

      for (const locale of ['en', 'th'] as const) {
        const response = await ShareImageGET(new Request('https://academy.test'), {
          params: Promise.resolve({ slug: 'unpublished-course', locale }),
        })
        expect(response.status).toBe(404)
        expect(response.body).toBeNull()
      }
    },
  )

  it('keeps a published legacy course on its canonical redirect path', async () => {
    await expect(
      LegacyCoursePage({
        params: Promise.resolve({ slug: 'published-course' }),
        searchParams: Promise.resolve({ lang: 'th' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('renders and emits images for a published localized course', async () => {
    const page = await LocalizedCoursePage({
      params: Promise.resolve({ slug: 'published-course', locale: 'th' }),
    })
    expect(renderToStaticMarkup(page as React.ReactElement)).toContain('public-course:published-course:th')

    await expect(OpenGraphImage({ params: Promise.resolve({ slug: 'published-course' }) })).resolves.toEqual({
      __shareImage: true,
    })

    const response = await ShareImageGET(new Request('https://academy.test'), {
      params: Promise.resolve({ slug: 'published-course', locale: 'en' }),
    })
    expect(response).toEqual({ __shareImage: true })
  })
})

describe('runtime public catalog visibility', () => {
  it('omits unpublished and retired courses while retaining the published control', async () => {
    mocks.loadAllCourseOverrides.mockResolvedValue(
      new Map([
        ['published-course', { visibility: 'published', overridden: true, titleOverride: null, subtitleOverride: null }],
        ['unpublished-course', { visibility: 'unpublished', overridden: true, titleOverride: null, subtitleOverride: null }],
        ['retired-course', { visibility: 'retired', overridden: true, titleOverride: null, subtitleOverride: null }],
      ]),
    )

    await expect(getVisiblePublicCourses()).resolves.toHaveLength(1)
    await expect(getVisiblePublicCourse('published-course')).resolves.toMatchObject({
      structure: { slug: 'published-course' },
    })
  })

  it('fails closed when the settings table cannot be read', async () => {
    mocks.loadAllCourseOverrides.mockRejectedValueOnce(new Error('settings unavailable'))
    mocks.requireEffectiveCourseVisibility.mockRejectedValueOnce(new Error('settings unavailable'))

    await expect(getVisiblePublicCourses()).rejects.toThrow('settings unavailable')
    await expect(getVisiblePublicCourse('published-course')).rejects.toThrow('settings unavailable')
  })
})

describe('public visibility route caching', () => {
  it('renders every direct course surface on demand', () => {
    const root = join(__dirname, '..', '..')
    const sources = [
      'src/app/(site)/courses/[slug]/page.tsx',
      'src/app/(localized)/courses/[slug]/[locale]/page.tsx',
      'src/app/courses/[slug]/opengraph-image.tsx',
      'src/app/(site)/courses/[slug]/share/[locale]/route.tsx',
    ]

    for (const source of sources) {
      expect(readFileSync(join(root, source), 'utf8')).toContain(
        "export const dynamic = 'force-dynamic'",
      )
    }
  })
})
