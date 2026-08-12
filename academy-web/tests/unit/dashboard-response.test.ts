import { describe, expect, it } from 'vitest'
import {
  dashboardResumeNode,
  parseDashboardResponse,
  readDashboardResponse,
  type DashboardCourse,
} from '@/components/course/CourseDashboard'
import { emptyProgress } from '@/lib/course/progress'

const response = {
  ok: true,
  accessibleCourseSlugs: ['course-1'],
  records: {},
  courses: [{
    structure: {
      slug: 'course-1',
      defaultLocale: 'en',
      availableLocales: ['en'],
      level: 'beginner',
      estimatedMinutes: 30,
      globalSkillWeights: { foundations: 1 },
      nodes: [{ id: 'lesson-1', kind: 'lesson', prerequisites: [], estimatedMinutes: 30 }],
    },
    title: 'Course one',
    subtitle: 'Subtitle',
    level: 'beginner',
    nodeTitles: { 'lesson-1': 'Lesson one' },
  }],
}

describe('dashboard progress response', () => {
  it('accepts the explicit dashboard DTO', () => {
    expect(parseDashboardResponse(response)).toMatchObject({
      accessibleCourseSlugs: ['course-1'],
      courses: [{ structure: { slug: 'course-1' } }],
    })
  })

  it('fails closed instead of presenting an empty enrollment for a malformed success response', () => {
    expect(parseDashboardResponse({ ok: true, accessibleCourseSlugs: [], records: {} })).toBeNull()
    expect(parseDashboardResponse({ ...response, courses: [{ ...response.courses[0], structure: { ...response.courses[0].structure, nodes: [{}] } }] })).toBeNull()
    expect(parseDashboardResponse({ ...response, accessibleCourseSlugs: [] })).toBeNull()
    expect(parseDashboardResponse({ ...response, courses: [] })).toBeNull()
    expect(parseDashboardResponse({ ...response, accessibleCourseSlugs: ['course-1', 'course-1'] })).toBeNull()
    expect(parseDashboardResponse({ ...response, records: { 'course-1': {} } })).toBeNull()
  })

  it('rejects surplus fields at every fixed response level', () => {
    expect(parseDashboardResponse({ ...response, unexpected: true })).toBeNull()
    expect(parseDashboardResponse({
      ...response,
      courses: [{ ...response.courses[0], unexpected: true }],
    })).toBeNull()
    expect(parseDashboardResponse({
      ...response,
      courses: [{
        ...response.courses[0],
        structure: { ...response.courses[0].structure, unexpected: true },
      }],
    })).toBeNull()
    expect(parseDashboardResponse({
      ...response,
      courses: [{
        ...response.courses[0],
        structure: {
          ...response.courses[0].structure,
          nodes: [{ ...response.courses[0].structure.nodes[0], unexpected: true }],
        },
      }],
    })).toBeNull()
  })

  it('returns a fresh recursive projection instead of aliases from the input', () => {
    const projected = parseDashboardResponse(response)
    expect(projected).not.toBeNull()
    expect(projected?.courses).not.toBe(response.courses)
    expect(projected?.courses[0]).not.toBe(response.courses[0])
    expect(projected?.courses[0].structure).not.toBe(response.courses[0].structure)
    expect(projected?.courses[0].structure.nodes).not.toBe(response.courses[0].structure.nodes)
    expect(projected?.courses[0].nodeTitles).not.toBe(response.courses[0].nodeTitles)
    expect(projected?.records).not.toBe(response.records)
  })

  it('reads only bounded duplicate-safe JSON dashboard responses', async () => {
    const valid = new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    })
    await expect(readDashboardResponse(valid)).resolves.toMatchObject({
      accessibleCourseSlugs: ['course-1'],
    })

    const duplicate = new Response(
      JSON.stringify(response).replace('{"ok":true', '{"ok":false,"ok":true'),
      { headers: { 'content-type': 'application/json' } },
    )
    await expect(readDashboardResponse(duplicate)).resolves.toBeNull()
    await expect(readDashboardResponse(new Response(JSON.stringify(response), {
      headers: { 'content-type': 'text/plain' },
    }))).resolves.toBeNull()
    await expect(readDashboardResponse(new Response(' '.repeat(262_145), {
      headers: { 'content-type': 'application/json' },
    }))).resolves.toBeNull()
  })

  it('resumes the last in-progress lesson when parallel lessons are open', () => {
    const course: DashboardCourse = {
      structure: {
        slug: 'course-1',
        defaultLocale: 'en',
        availableLocales: ['en'],
        level: 'beginner',
        estimatedMinutes: 40,
        globalSkillWeights: { foundations: 1 },
        nodes: [
          { id: 'a', kind: 'lesson', prerequisites: [], estimatedMinutes: 10 },
          { id: 'b', kind: 'lesson', prerequisites: ['a'], estimatedMinutes: 10 },
          { id: 'c', kind: 'lesson', prerequisites: ['a'], estimatedMinutes: 10 },
        ],
      },
      title: 'Course one',
      subtitle: 'Subtitle',
      level: 'beginner',
      nodeTitles: { a: 'First', b: 'Branch B', c: 'Branch C' },
    }
    const record = {
      ...emptyProgress('course-1'),
      completed: ['a'],
      inProgress: ['b', 'c'],
      lastNodeId: 'c',
    }

    expect(dashboardResumeNode(course, record)?.id).toBe('c')
  })
})
