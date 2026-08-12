import { describe, expect, it, vi } from 'vitest'

const { currentUser, getCourse, authorizeCourseResource } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getCourse: vi.fn(),
  authorizeCourseResource: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/content/course-source', () => ({ getCourse }))
vi.mock('@/lib/account/course-access', () => ({ authorizeCourseResource }))
vi.mock('@/components/course/CourseOverview', () => ({ CourseOverview: () => null }))

import LearnerCoursePage from '@/app/(site)/courses/[slug]/learn/page'

const course = {
  structure: {
    slug: 'course-1',
    defaultLocale: 'en',
    availableLocales: ['en'],
    level: 'beginner',
    estimatedMinutes: 30,
    skills: [{ id: 'shell', maxScore: 2 }],
    globalSkillWeights: { foundations: 1 },
    nodes: [
      {
        id: 'lesson-1',
        kind: 'lesson',
        prerequisites: [],
        estimatedMinutes: 30,
        skillWeights: { shell: 1 },
        video: { src: '/media/private.mp4', durationSeconds: 30, cues: [{ id: 'cue-1', atSeconds: 10 }] },
      },
    ],
  },
  copy: {
    title: 'Course one',
    subtitle: 'Subtitle',
    audience: 'Audience',
    outcomes: ['Outcome'],
    nodeTitles: { 'lesson-1': 'Lesson one' },
    skillLabels: { shell: 'Shell skills' },
  },
  locale: 'en',
  translatedNodeIds: ['lesson-1'],
}

describe('protected learner course page', () => {
  it('passes only the public roadmap DTO to the client and enables learner-only loading', async () => {
    currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    getCourse.mockReturnValue(course)
    authorizeCourseResource.mockResolvedValue({ allowed: true })

    const page = await LearnerCoursePage({
      params: Promise.resolve({ slug: 'course-1' }),
      searchParams: Promise.resolve({ lang: 'en' }),
    })
    const overview = (page as { props: { children: { props: Record<string, unknown> } } }).props.children
    const payload = JSON.stringify(overview.props)

    expect(overview.props.learnerRoute).toBe(true)
    expect(payload).not.toContain('skillWeights')
    expect(payload).not.toContain('globalSkillWeights')
    expect(payload).not.toContain('/media/private.mp4')
    expect(payload).not.toContain('cue-1')
    expect(payload).not.toContain('skillLabels')
  })
})
