import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, getCourse, authorizeCourseResource, deniedAccessStatus, loadProgress } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getCourse: vi.fn(),
  authorizeCourseResource: vi.fn(),
  deniedAccessStatus: vi.fn(),
  loadProgress: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/content/course-source', () => ({ getCourse }))
vi.mock('@/lib/account/course-access', () => ({ authorizeCourseResource, deniedAccessStatus }))
vi.mock('@/lib/course/progress-db', () => ({ loadProgress }))

import { GET } from '@/app/(site)/api/courses/[slug]/skill-map/route'

const course = {
  structure: {
    slug: 'course-1',
    skills: [{ id: 'shell', maxScore: 2 }],
    nodes: [
      { id: 'lesson-1', skillWeights: { shell: 1 } },
      { id: 'lesson-2', skillWeights: { shell: 1 } },
    ],
  },
  copy: { skillLabels: { shell: 'Shell skills' } },
}

const record = {
  completed: ['lesson-1'],
  skipped: ['lesson-2'],
  testedOut: [],
  inProgress: [],
}

async function request(slug = 'course-1', lang = 'en') {
  return GET(new Request(`http://localhost/api/courses/${slug}/skill-map?lang=${lang}`), {
    params: Promise.resolve({ slug }),
  })
}

describe('GET /api/courses/[slug]/skill-map', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    getCourse.mockReturnValue(course)
    authorizeCourseResource.mockResolvedValue({ allowed: true })
    deniedAccessStatus.mockReturnValue(403)
    loadProgress.mockResolvedValue(record)
  })

  it('returns only derived learner coverage after course authorization', async () => {
    const response = await request()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    expect(body).toEqual({
      ok: true,
      coverage: [{ id: 'shell', label: 'Shell skills', value: 50, notStarted: false }],
    })
    expect(JSON.stringify(body)).not.toContain('skillWeights')
    expect(JSON.stringify(body)).not.toContain('globalSkillWeights')
    expect(authorizeCourseResource).toHaveBeenCalledWith('user-1', 'course-1')
    expect(loadProgress).toHaveBeenCalledWith('user-1', 'course-1')
  })

  it('returns no learner data when the request is unauthenticated', async () => {
    currentUser.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
    expect(authorizeCourseResource).not.toHaveBeenCalled()
    expect(loadProgress).not.toHaveBeenCalled()
  })

  it('fails closed for denied or unavailable enrollment without loading coverage', async () => {
    authorizeCourseResource.mockResolvedValue({ allowed: false, reason: 'not-entitled' })
    const denied = await request()

    expect(denied.status).toBe(403)
    await expect(denied.json()).resolves.toMatchObject({ ok: false })
    expect(loadProgress).not.toHaveBeenCalled()

    authorizeCourseResource.mockResolvedValue({ allowed: false, reason: 'unavailable' })
    deniedAccessStatus.mockReturnValue(503)
    const unavailable = await request()

    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toMatchObject({ ok: false })
    expect(loadProgress).not.toHaveBeenCalled()
  })

  it('does not reveal a map for an unknown course', async () => {
    getCourse.mockReturnValue(null)

    const response = await request('missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
    expect(authorizeCourseResource).not.toHaveBeenCalled()
    expect(loadProgress).not.toHaveBeenCalled()
  })
})
