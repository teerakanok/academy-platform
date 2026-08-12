import { describe, expect, it } from 'vitest'
import { getCourse, getPublicCourse } from '@/lib/content/course-source'
import { toPublicCourse, toPublicCourseCatalogItem } from '@/lib/content/public-course'

describe('public course projection', () => {
  it('allows only syllabus data across the public client boundary', () => {
    const course = getCourse('basic-os-linux')!
    const projected = toPublicCourse(course)
    const payload = JSON.stringify(projected)

    expect(projected.structure.nodes[0]).toEqual({
      id: 'os-what-it-does',
      kind: 'lesson',
      prerequisites: [],
      estimatedMinutes: 12,
    })
    expect(Object.keys(projected.structure).sort()).toEqual([
      'availableLocales',
      'coverMotif',
      'defaultLocale',
      'estimatedMinutes',
      'level',
      'nodes',
      'slug',
    ])
    expect(Object.keys(projected.copy).sort()).toEqual(['audience', 'nodeTitles', 'outcomes', 'subtitle', 'title'])
    expect(payload).not.toContain('/media/')
    expect(payload).not.toContain('lesson-demo')
    expect(payload).not.toContain('captions')
    expect(payload).not.toContain('cue-kernel')
    expect(payload).not.toContain('skillWeights')
    expect(payload).not.toContain('globalSkillWeights')
    expect(payload).not.toContain('version')
  })

  it('allows a catalog card to receive only its public roadmap and localized summary', () => {
    const course = getPublicCourse('basic-os-linux')!
    const thai = getPublicCourse('basic-os-linux', 'th')!
    const projected = toPublicCourseCatalogItem(course, {
      en: { title: course.copy.title, subtitle: course.copy.subtitle },
      th: { title: thai.copy.title, subtitle: thai.copy.subtitle },
    })
    const payload = JSON.stringify(projected)

    expect(Object.keys(projected).sort()).toEqual(['copies', 'structure'])
    expect(Object.keys(projected.copies.en!).sort()).toEqual(['subtitle', 'title'])
    expect(projected.copies.th?.title).toBe(thai.copy.title)
    expect(payload).not.toContain('/media/')
    expect(payload).not.toContain('cue-kernel')
    expect(payload).not.toContain('skillWeights')
    expect(payload).not.toContain('globalSkillWeights')
    expect(payload).not.toContain('nodeTitles')
    expect(payload).not.toContain('outcomes')
  })
})
