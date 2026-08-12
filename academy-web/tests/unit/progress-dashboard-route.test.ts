import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, getAllCourses, getCourseStructure, getServiceAccess, getCourseAccess, deniedAccessStatus, loadAllProgress } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getAllCourses: vi.fn(),
  getCourseStructure: vi.fn(),
  getServiceAccess: vi.fn(),
  getCourseAccess: vi.fn(),
  deniedAccessStatus: vi.fn(),
  loadAllProgress: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/content/course-source', () => ({ getAllCourses, getCourseStructure }))
vi.mock('@/lib/content/answer-key', () => ({ getLessonAnswerKey: vi.fn(), mcqItems: vi.fn(), sameAnswerSet: vi.fn(), simulationItems: vi.fn() }))
vi.mock('@/lib/course/assessment-policy', () => ({
  isAssessedNode: vi.fn(),
  requiresAttempt: vi.fn(),
  isTestOutAvailable: vi.fn(),
  passesLearnMode: vi.fn(),
  TEST_OUT_UNAVAILABLE_REASON: 'unavailable',
}))
vi.mock('@/lib/course/public-progress', () => ({ toPublicProgress: (record: unknown) => record }))
vi.mock('@/lib/http/bounded-body', () => ({ readBoundedJson: vi.fn() }))
vi.mock('@/lib/http/mutation-security', () => ({ validateMutationRequest: vi.fn() }))
vi.mock('@/lib/account/course-access', () => ({
  authorizeCourseResource: vi.fn(),
  deniedAccessStatus,
  getCourseAccess,
  getServiceAccess,
}))
vi.mock('@/lib/simulation/types', () => ({ gradeSimulation: vi.fn(), gradingFingerprint: vi.fn(), simulationReadiness: vi.fn() }))
vi.mock('@/lib/course/attempt-db', () => ({ commitAttemptResult: vi.fn(), consumeAttempt: vi.fn(), finalizeAttempt: vi.fn(), inspectAttempt: vi.fn() }))
vi.mock('@/lib/course/attempt', () => ({ attemptExplanations: vi.fn(), CHECKPOINT_CHALLENGE_ID: 'challenge', remapAnswersToReal: vi.fn() }))
vi.mock('@/lib/course/attempt-grading', () => ({ simulationsToGrade: vi.fn() }))
vi.mock('@/lib/course/progress-db', () => ({
  loadAllProgress,
  loadProgress: vi.fn(),
  captureProgressEpoch: vi.fn(),
  commitNodeEvent: vi.fn(),
}))

import { GET } from '@/app/(site)/api/progress/route'

const allowedCourse = {
  structure: {
    slug: 'allowed-course',
    version: 'internal-version',
    publicAvailability: 'internal' as const,
    defaultLocale: 'en' as const,
    availableLocales: ['en' as const],
    level: 'beginner' as const,
    estimatedMinutes: 30,
    skills: [{ id: 'shell', maxScore: 2 }],
    globalSkillWeights: { foundations: 1 },
    nodes: [{ id: 'lesson-1', kind: 'lesson' as const, prerequisites: [], estimatedMinutes: 30, skillWeights: { shell: 1 }, video: { src: '/media/private.mp4', durationSeconds: 30, cues: [] } }],
  },
  copy: { title: 'Allowed', subtitle: 'Allowed subtitle', audience: 'Audience', outcomes: [], nodeTitles: { 'lesson-1': 'Lesson one' }, skillLabels: { shell: 'Shell' } },
  locale: 'en' as const,
  translatedNodeIds: ['lesson-1'],
}

const deniedCourse = {
  ...allowedCourse,
  structure: { ...allowedCourse.structure, slug: 'denied-course' },
  copy: { ...allowedCourse.copy, title: 'Denied' },
}

describe('GET /api/progress dashboard catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    getServiceAccess.mockResolvedValue({ allowed: true })
    deniedAccessStatus.mockReturnValue(403)
    getAllCourses.mockReturnValue([allowedCourse, deniedCourse])
    getCourseAccess.mockImplementation(async (_accountId: string, slug: string) => (
      slug === 'allowed-course' ? { allowed: true } : { allowed: false, reason: 'not-entitled' }
    ))
    loadAllProgress.mockResolvedValue({})
  })

  it('returns an allowlisted catalog only after per-course entitlement', async () => {
    const response = await GET(new Request('http://localhost/api/progress'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    expect(body.accessibleCourseSlugs).toEqual(['allowed-course'])
    expect(body.courses).toHaveLength(1)
    expect(body.courses[0].title).toBe('Allowed')
    expect(loadAllProgress).toHaveBeenCalledWith('user-1', ['allowed-course'])
    expect(getCourseAccess).toHaveBeenCalledBefore(loadAllProgress)

    const payload = JSON.stringify(body)
    expect(payload).toContain('globalSkillWeights')
    expect(payload).not.toContain('denied-course')
    expect(payload).not.toContain('skillWeights')
    expect(payload).not.toContain('/media/private.mp4')
    expect(payload).not.toContain('internal-version')
    expect(payload).not.toContain('publicAvailability')
    expect(payload).not.toContain('skillLabels')
  })

  it('does not return a dashboard catalog before sign-in or service activation', async () => {
    currentUser.mockResolvedValue(null)
    const signedOut = await GET(new Request('http://localhost/api/progress'))
    expect(signedOut.status).toBe(401)
    expect(signedOut.headers.get('cache-control')).toBe('private, no-store')
    await expect(signedOut.json()).resolves.not.toHaveProperty('courses')

    currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    getServiceAccess.mockResolvedValue({ allowed: false, reason: 'not-entitled' })
    const denied = await GET(new Request('http://localhost/api/progress'))
    expect(denied.status).toBe(403)
    expect(denied.headers.get('cache-control')).toBe('private, no-store')
    await expect(denied.json()).resolves.not.toHaveProperty('courses')
  })

  it('does not read progress when no course entitlement is active', async () => {
    getCourseAccess.mockResolvedValue({ allowed: false, reason: 'not-entitled' })

    const response = await GET(new Request('http://localhost/api/progress'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      accessibleCourseSlugs: [],
      courses: [],
      records: {},
    })
    expect(loadAllProgress).not.toHaveBeenCalled()
  })

  it('fails closed when course entitlement storage is unavailable', async () => {
    getCourseAccess.mockResolvedValue({ allowed: false, reason: 'unavailable' })

    const response = await GET(new Request('http://localhost/api/progress'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
    expect(loadAllProgress).not.toHaveBeenCalled()
  })
})
