import { describe, expect, it } from 'vitest'
import { toLearnerDashboardCourse } from '@/lib/content/public-course'

const course = {
  structure: {
    id: 'course-1',
    slug: 'course-1',
    version: 'private-version',
    publicAvailability: 'internal' as const,
    defaultLocale: 'en' as const,
    availableLocales: ['en' as const],
    level: 'beginner' as const,
    estimatedMinutes: 30,
    skills: [{ id: 'shell', maxScore: 2 }],
    globalSkillWeights: { foundations: 1 },
    nodes: [
      {
        id: 'lesson-1',
        kind: 'lesson' as const,
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
    locale: 'en' as const,
    audience: 'Audience',
    outcomes: ['Outcome'],
    nodeTitles: { 'lesson-1': 'Lesson one' },
    skillLabels: { shell: 'Shell skills' },
  },
  locale: 'en' as const,
  translatedNodeIds: ['lesson-1'],
}

describe('learner dashboard course DTO', () => {
  it('keeps only roadmap, card copy, and global coverage weights', () => {
    const payload = JSON.stringify(toLearnerDashboardCourse(course))

    expect(payload).toContain('globalSkillWeights')
    expect(payload).not.toContain('skillWeights')
    expect(payload).not.toContain('/media/private.mp4')
    expect(payload).not.toContain('cue-1')
    expect(payload).not.toContain('private-version')
    expect(payload).not.toContain('publicAvailability')
    expect(payload).not.toContain('skillLabels')
  })
})
