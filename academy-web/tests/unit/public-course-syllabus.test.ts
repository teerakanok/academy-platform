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
    const lessons = course.structure.nodes.filter((n) => n.kind === 'lesson').length
    const capstones = course.structure.nodes.filter((n) => n.kind === 'capstone').length
    expect(page).toContain(
      `${lessons + capstones} learning steps · ${capstones} required checkpoints`,
    )
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

  it('states Thai coverage honestly: complete when it is, partial when it is not', () => {
    const course = getCourse('basic-os-linux', 'th')!
    const render = (translatedNodeIds: string[]) =>
      renderToStaticMarkup(
        createElement(PublicCourseSyllabus, {
          structure: course.structure,
          copy: course.copy,
          locale: course.locale,
          translatedNodeIds,
        }),
      )

    // ครบทุกบท — ต้องไม่บอกเป็นตัวเลขบางส่วน
    const complete = render(course.translatedNodeIds)
    expect(complete).toContain('แผนการเรียน')
    expect(complete).toContain('ภาษาไทยพร้อมสำหรับทุกขั้นการเรียน')
    expect(complete).not.toContain('เนื้อหาภาษาอังกฤษ')
    expect(complete).toContain('aria-label="ภาษาของคอร์ส"')
    expect(complete).toContain('aria-label="ดูแผนการเรียนนี้เป็นภาษาไทย"')
    expect(complete).toContain('ดูตัวอย่างคอร์สทั้งหมด')
    expect(complete).toContain('href="/courses?lang=th"')
    expect(complete).not.toContain('Course roadmap')

    // แปลไม่ครบ — ต้องบอกตรง ๆ ว่ากี่ขั้นจากทั้งหมด ไม่ใช่ปล่อยให้เข้าใจว่าครบ
    const total = course.structure.nodes.length
    const partial = render([course.structure.nodes[0].id])
    expect(partial).toContain(`ภาษาไทยพร้อมสำหรับ 1 จาก ${total} ขั้นการเรียน`)
    expect(partial).toContain('ภาษาอังกฤษ')
  })
})
