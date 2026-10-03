import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPublicCourseSlugs: vi.fn(() => ['published-course', 'unpublished-course', 'retired-course']),
  getPublicCourse: vi.fn((slug: string) => ({
    structure: { slug, publicAvailability: 'syllabus-preview', availableLocales: ['en', 'th'] },
  })),
  requireEffectiveCourseVisibility: vi.fn(),
  absoluteUrl: vi.fn((path: string) => `https://academy.cyberskills.co.th${path}`),
  searchIndexingEnabled: vi.fn(() => true),
}))

vi.mock('@/lib/content/course-source', () => ({
  getPublicCourse: mocks.getPublicCourse,
  listPublicCourseSlugs: mocks.listPublicCourseSlugs,
}))
vi.mock('@/lib/course/settings', () => ({
  requireEffectiveCourseVisibility: mocks.requireEffectiveCourseVisibility,
}))
vi.mock('@/lib/seo', () => ({
  absoluteUrl: mocks.absoluteUrl,
  searchIndexingEnabled: mocks.searchIndexingEnabled,
}))

import sitemap from '@/app/sitemap'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchIndexingEnabled.mockReturnValue(true)
  mocks.requireEffectiveCourseVisibility.mockImplementation(async (_availability: unknown, slug: string) => {
    if (slug === 'unpublished-course') return 'unpublished'
    if (slug === 'retired-course') return 'retired'
    return 'published'
  })
})

describe('sitemap course visibility', () => {
  it('omits unpublished and retired courses while retaining published locales', async () => {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls).toContain('https://academy.cyberskills.co.th/courses/published-course/en')
    expect(urls).toContain('https://academy.cyberskills.co.th/courses/published-course/th')
    expect(urls).not.toContain('https://academy.cyberskills.co.th/courses/unpublished-course/en')
    expect(urls).not.toContain('https://academy.cyberskills.co.th/courses/retired-course/en')
  })

  it('does not build a possibly stale sitemap when runtime visibility cannot be read', async () => {
    mocks.requireEffectiveCourseVisibility.mockRejectedValueOnce(new Error('settings unavailable'))

    await expect(sitemap()).rejects.toThrow('settings unavailable')
  })
})
