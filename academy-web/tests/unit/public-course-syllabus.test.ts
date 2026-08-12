import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getCourse, getLesson } from '@/lib/content/course-source'
import { PublicCourseSyllabus } from '@/components/course/PublicCourseSyllabus'

describe('PublicCourseSyllabus', () => {
  const course = getCourse('basic-os-linux')!

  it('lets a visitor inspect the full learning route without loading a learning record', () => {
    const page = renderToStaticMarkup(
      createElement(PublicCourseSyllabus, {
        structure: course.structure,
        copy: course.copy,
        locale: course.locale,
        translatedNodeIds: course.translatedNodeIds,
      }),
    )

    expect(page).toContain(course.copy.subtitle)
    expect(page).toContain('10 learning steps · 2 required checkpoints')
    expect(page).toContain('Course roadmap')
    expect(page).toContain('Required checkpoint')
    expect(page).toContain(course.copy.nodeTitles['os-what-it-does'])
    expect(page).toContain(course.copy.nodeTitles.permissions)
    expect(page).toContain('English is available for every learning step.')
    expect(page).toContain('Browse course previews')
    expect(page).toContain('href="/courses?lang=en"')
    expect(page).toContain('aria-label="Course language"')
    expect(page).toContain('aria-label="View this syllabus in English"')
    expect(page).not.toContain('Loading your learning record')
    expect(page).not.toContain('/api/progress')
    expect(page).not.toContain('Start the first lesson')

    const lesson = getLesson('basic-os-linux', 'os-what-it-does')!.lesson
    const firstParagraph = lesson.blocks.find((block) => block.kind === 'paragraph')
    const question = lesson.checkpoint.find((item) => item.kind === 'mcq')
    expect(firstParagraph?.kind === 'paragraph' ? page : '').not.toContain(firstParagraph?.text ?? '')
    expect(question?.kind === 'mcq' ? page : '').not.toContain(question?.prompt ?? '')
    expect(question?.kind === 'mcq' ? page : '').not.toContain(question?.explanation ?? '')
    expect(page).not.toContain('/media/lesson-demo.mp4')
  })

  it('is explicit that Thai is partial rather than presenting an English course as fully translated', () => {
    const course = getCourse('basic-os-linux', 'th')!
    const page = renderToStaticMarkup(
      createElement(PublicCourseSyllabus, {
        structure: course.structure,
        copy: course.copy,
        locale: course.locale,
        translatedNodeIds: course.translatedNodeIds,
      }),
    )

    expect(page).toContain('แผนการเรียน')
    expect(page).toContain('ภาษาไทยพร้อมสำหรับ 1 จาก 10 ขั้นการเรียน')
    expect(page).toContain('เนื้อหาภาษาอังกฤษ')
    expect(page).toContain('aria-label="ภาษาของคอร์ส"')
    expect(page).toContain('aria-label="ดูแผนการเรียนนี้เป็นภาษาไทย"')
    expect(page).toContain('ดูตัวอย่างคอร์สทั้งหมด')
    expect(page).toContain('href="/courses?lang=th"')
    expect(page).not.toContain('Course roadmap')
  })
})
