import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourseSkillMap } from '@/components/course/CourseSkillMap'

describe('CourseSkillMap', () => {
  it('labels coverage truthfully and retains the RadarChart numeric alternative', () => {
    const page = renderToStaticMarkup(
      createElement(CourseSkillMap, {
        coverage: [
          { id: 'shell', label: 'Shell skills', value: 50, notStarted: false },
          { id: 'storage', label: 'Storage basics', value: 0, notStarted: true },
        ],
        locale: 'en',
      }),
    )

    expect(page).toContain('Learning coverage by course topic')
    expect(page).toContain('It is not a score, assessment, or measure of proficiency.')
    expect(page).toContain('Skipped lessons do not add coverage.')
    expect(page).toContain('<table')
    expect(page).toContain('max-w-[268px]')
    expect(page).toContain('data-testid="course-skill-map"')
  })

  it('localizes every learner-facing map label for Thai', () => {
    const page = renderToStaticMarkup(
      createElement(CourseSkillMap, {
        coverage: [{ id: 'shell', label: 'ทักษะเชลล์', value: 0, notStarted: true }],
        locale: 'th',
      }),
    )

    expect(page).toContain('ความครอบคลุมของการเรียนตามหัวข้อ')
    expect(page).toContain('ยังไม่เริ่ม')
    expect(page).toContain('ค่าตัวเลข')
    expect(page).toContain('ไม่ใช่คะแนน')
    expect(page).not.toContain('not started')
  })
})
