import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CourseExperience } from '@/components/course/CourseExperience'
import { projectAccountResponse } from '@/lib/auth/account-response-client'
import { getCourse } from '@/lib/content/course-source'

describe('CourseExperience', () => {
  const course = getCourse('basic-os-linux')!

  it('fails closed to the public syllabus until an account response explicitly says signedIn', () => {
    expect(projectAccountResponse({ signedIn: true, email: 'learner@example.test' })).toEqual({
      signedIn: true,
      email: 'learner@example.test',
    })
    expect(projectAccountResponse({ signedIn: false })).toEqual({ signedIn: false })
    expect(projectAccountResponse({ signedIn: true })).toBeNull()
    expect(projectAccountResponse(null)).toBeNull()

    const page = renderToStaticMarkup(
      createElement(CourseExperience, {
        structure: course.structure,
        copy: course.copy,
        locale: course.locale,
        translatedNodeIds: course.translatedNodeIds,
      }),
    )
    expect(page).toContain('Course roadmap')
    expect(page).not.toContain('/api/progress')
  })
})
