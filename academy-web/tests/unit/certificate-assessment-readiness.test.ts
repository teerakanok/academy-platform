import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourseStructure } from '@/lib/content/course-types'

const mocks = vi.hoisted(() => ({ getLesson: vi.fn(), getCourseStructure: vi.fn(), loadProgress: vi.fn(), academyDb: vi.fn() }))
vi.mock('@/lib/content/course-source', () => ({ getLesson: mocks.getLesson, getCourseStructure: mocks.getCourseStructure }))
vi.mock('@/lib/course/progress-db', () => ({ loadProgress: mocks.loadProgress }))
vi.mock('@/lib/db/server', () => ({ academyDb: mocks.academyDb }))
import { certificateAssessmentReady } from '@/lib/course/certificate-assessment-readiness'
import { certificateEligibility } from '@/lib/course/certificate-eligibility'

const structure = { slug: 'fixture', availableLocales: ['en', 'th'], nodes: [{ id: 'proof', kind: 'capstone' }] } as CourseStructure
function lesson(count: number) {
  return { lesson: { checkpoint: Array.from({ length: count }, (_, index) => ({ id: `q${index}`, kind: 'mcq' })) } }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCourseStructure.mockReturnValue(structure)
  mocks.getLesson.mockReturnValue(lesson(15))
})

describe('certificate assessment bank boundary', () => {
  it('requires the approved bank depth for every proof node and served locale', () => {
    expect(certificateAssessmentReady(structure)).toBe(true)
    mocks.getLesson.mockImplementation((_slug, _node, locale) => lesson(locale === 'th' ? 14 : 15))
    expect(certificateAssessmentReady(structure)).toBe(false)
  })
  it('does not count simulations or duplicate question IDs toward the bank', () => {
    const duplicate = lesson(15)
    duplicate.lesson.checkpoint[14].id = 'q0'
    mocks.getLesson.mockReturnValue(duplicate)
    expect(certificateAssessmentReady(structure)).toBe(false)
    const mixed = lesson(15)
    mixed.lesson.checkpoint[14].kind = 'simulation'
    mocks.getLesson.mockReturnValue(mixed)
    expect(certificateAssessmentReady(structure)).toBe(false)
  })
  it('denies missing or invalid content and a course with no proof', () => {
    mocks.getLesson.mockReturnValue(null)
    expect(certificateAssessmentReady(structure)).toBe(false)
    mocks.getLesson.mockImplementation(() => { throw new Error('invalid content') })
    expect(certificateAssessmentReady(structure)).toBe(false)
    expect(certificateAssessmentReady({ ...structure, nodes: [] })).toBe(false)
  })
  it('prevents eligibility queries and issuance evidence for a short bank', async () => {
    mocks.getLesson.mockReturnValue(lesson(4))
    await expect(certificateEligibility('user', 'fixture')).resolves.toEqual({ unavailable: true, reason: 'assessment-not-ready' })
    expect(mocks.loadProgress).not.toHaveBeenCalled()
    expect(mocks.academyDb).not.toHaveBeenCalled()
  })
  it('keeps every current static-public course assessment ready', async () => {
    const actual = await vi.importActual<typeof import('@/lib/content/course-source')>('@/lib/content/course-source')
    mocks.getLesson.mockImplementation(actual.getLesson)
    const publicSlugs = actual.listPublicCourseSlugs()
    expect(publicSlugs.length).toBeGreaterThan(0)
    for (const slug of publicSlugs) {
      const course = actual.getCourseStructure(slug)
      expect(course, slug).not.toBeNull()
      expect(certificateAssessmentReady(course!), slug).toBe(true)
    }
    expect(certificateAssessmentReady(actual.getCourseStructure('content-formats-demo')!)).toBe(false)
  }, 15_000)
})
