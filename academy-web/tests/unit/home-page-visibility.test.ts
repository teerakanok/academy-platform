import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPublicCourse, listPublicCourseSlugs } from '@/lib/content/course-source'
import type { Course } from '@/lib/content/course-types'

const { getVisiblePublicCourses } = vi.hoisted(() => ({ getVisiblePublicCourses: vi.fn() }))

vi.mock('@/lib/course/visibility', () => ({ getVisiblePublicCourses }))
vi.mock('@/components/WaitlistForm', () => ({ WaitlistForm: () => null }))

import HomePage from '@/app/(site)/page'

// page.tsx ใช้ JSX โดยไม่ import React (Next ใส่ให้เอง) — vitest ใช้ classic transform
vi.stubGlobal('React', React)

// AL-12: เปิดตัวด้วย 2 คอร์ส ที่เหลือถูก unpublished ผ่าน course_settings
const LAUNCH = ['basic-os-linux', 'git-essentials']
const HIDDEN = ['assembly', 'c-low-level', 'computer-architecture', 'computer-networking', 'operating-systems', 'setup-and-environment']

function courseLinks(html: string): string[] {
  return [...html.matchAll(/href="(\/courses\/[^"]+)"/g)].map((match) => match[1])
}

describe('home page course links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVisiblePublicCourses.mockResolvedValue(LAUNCH.map((slug) => getPublicCourse(slug) as Course))
  })

  it('still has the hidden courses in the static public registry (so the runtime filter is what protects home)', () => {
    expect(listPublicCourseSlugs()).toEqual(expect.arrayContaining([...LAUNCH, ...HIDDEN]))
  })

  it('links only to runtime-visible courses, including the hero call to action', async () => {
    const html = renderToStaticMarkup(await HomePage())
    const links = courseLinks(html)

    expect(getVisiblePublicCourses).toHaveBeenCalledTimes(1)
    expect(links).toContain('/courses/basic-os-linux/en')
    expect(links).toContain('/courses/git-essentials/en')
    for (const slug of HIDDEN) {
      expect(links.some((href) => href.startsWith(`/courses/${slug}/`))).toBe(false)
    }
    expect(html).toContain('View Basic OS &amp; Linux')
  })

  it('drops the hero course link and preview grid when no course is visible', async () => {
    getVisiblePublicCourses.mockResolvedValue([])

    const html = renderToStaticMarkup(await HomePage())

    expect(courseLinks(html)).toEqual([])
    expect(html).toContain('href="/courses"')
    expect(html).not.toContain('Course previews')
  })
})
