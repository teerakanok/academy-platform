import { describe, expect, it } from 'vitest'
import { certificateEligibility, type LearnerCourseState } from '@/lib/course/roadmap'
import type { CourseStructure } from '@/lib/content/course-types'

const structure = {
  slug: 'c',
  nodes: [
    { id: 'a', kind: 'lesson', estimatedMinutes: 5, prerequisites: [], skills: {} },
    { id: 'b', kind: 'lesson', estimatedMinutes: 5, prerequisites: ['a'], skills: {} },
    { id: 'c', kind: 'capstone', estimatedMinutes: 5, prerequisites: ['b'], skills: {} },
  ],
} as unknown as CourseStructure

const state = (over: Partial<LearnerCourseState> = {}): LearnerCourseState => ({
  completed: [],
  skipped: [],
  testedOut: [],
  inProgress: [],
  ...over,
})

describe('ใบรับรองการเรียนจบ', () => {
  it('ยังไม่เริ่ม = ยังไม่ได้ และบอกว่าเหลืออะไร', () => {
    const r = certificateEligibility(structure, state())
    expect(r.eligible).toBe(false)
    expect(r.provenCount).toBe(0)
    expect(r.blocking.map((b) => b.reason)).toEqual(['unstarted', 'unstarted', 'unstarted'])
  })

  it('ข้ามโดยไม่พิสูจน์ = ยังไม่มีหลักฐาน จึงยังไม่ออกใบ', () => {
    const r = certificateEligibility(structure, state({ completed: ['a', 'c'], skipped: ['b'] }))
    expect(r.eligible).toBe(false)
    expect(r.blocking).toEqual([{ id: 'b', reason: 'skipped' }])
  })

  it('กลับมา test out บทที่ข้ามแล้วได้ใบทันที', () => {
    const r = certificateEligibility(structure, state({ completed: ['a', 'c'], testedOut: ['b'] }))
    expect(r.eligible).toBe(true)
    expect(r.blocking).toEqual([])
    expect(r.provenCount).toBe(3)
  })

  it('รู้อยู่แล้วและ test out ทั้งคอร์ส = ได้ใบเต็ม ไม่มีการลงโทษคนที่รู้มาก่อน', () => {
    expect(certificateEligibility(structure, state({ testedOut: ['a', 'b', 'c'] })).eligible).toBe(true)
  })

  it('คอร์สว่างไม่ออกใบ', () => {
    expect(certificateEligibility({ slug: 'x', nodes: [] } as unknown as CourseStructure, state()).eligible).toBe(false)
  })
})
