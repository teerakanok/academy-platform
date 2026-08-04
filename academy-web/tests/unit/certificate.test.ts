import { describe, expect, it } from 'vitest'
import { courseRecordSummary, type LearnerCourseState } from '@/lib/course/roadmap'
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

describe('สรุปประวัติการเรียนของคอร์ส', () => {
  it('ยังไม่เริ่ม = record ยังไม่ครบ และบอกว่าเหลืออะไร', () => {
    const r = courseRecordSummary(structure, state())
    expect(r.recordComplete).toBe(false)
    expect(r.lessonsFinished).toBe(0)
    expect(r.blocking.map((b) => b.reason)).toEqual(['unstarted', 'unstarted', 'unstarted'])
  })

  it('ข้ามบทเรียน = ยังไม่ครบเกณฑ์', () => {
    const r = courseRecordSummary(structure, state({ completed: ['a', 'c'], skipped: ['b'] }))
    expect(r.recordComplete).toBe(false)
    expect(r.blocking).toEqual([{ id: 'b', reason: 'skipped' }])
  })

  it('ผล test-out เก่าที่บันทึกไว้ยังนับเป็นบทที่เดินผ่านแล้ว', () => {
    const r = courseRecordSummary(structure, state({ completed: ['a', 'c'], testedOut: ['b'] }))
    expect(r.recordComplete).toBe(true)
    expect(r.blocking).toEqual([])
    expect(r.lessonsFinished).toBe(3)
  })

  it('ผล test-out เก่าครบทั้งคอร์ส = ครบเกณฑ์', () => {
    expect(courseRecordSummary(structure, state({ testedOut: ['a', 'b', 'c'] })).recordComplete).toBe(true)
  })

  it('คอร์สว่างไม่ครบเกณฑ์', () => {
    expect(courseRecordSummary({ slug: 'x', nodes: [] } as unknown as CourseStructure, state()).recordComplete).toBe(false)
  })
})

// ── W0-3: record ที่ครบต้องมีผลผ่านจากด่านวัดผล ไม่ใช่มีแค่ความคืบหน้า ───────
//
// เดิมฟังก์ชันนี้นับ `completed` เป็น proven ตรงๆ แปลว่าคนที่ไล่ลองบทปกติจนผ่าน
// (ซึ่งทำได้จริงและตั้งใจให้ทำได้ เพราะโหมดสอนบอกคำอธิบายและ retry ไม่จำกัด)
// ทำให้ record ครบโดยไม่เคยผ่านด่านวัดผลเลยสักจุด
describe('record จะครบต้องมี capstone เท่านั้น', () => {
  const noCapstone = {
    slug: 'nc',
    nodes: [
      { id: 'a', kind: 'lesson', estimatedMinutes: 5, prerequisites: [], skills: {} },
      { id: 'b', kind: 'lesson', estimatedMinutes: 5, prerequisites: ['a'], skills: {} },
    ],
  } as unknown as CourseStructure

  it('เดินครบทุกบทแต่ยังไม่ผ่าน capstone → record ยังไม่ครบ', () => {
    // จำลองผลของการ "ไล่ลองจนผ่าน" ทุกบทปกติ: a และ b เป็น completed แล้ว
    // แต่ c (capstone) ยังไม่ผ่าน — record ต้องยังไม่ครบ
    const r = courseRecordSummary(structure, state({ completed: ['a', 'b'] }))
    expect(r.recordComplete).toBe(false)
    expect(r.assessedPassed).toBe(0)
    expect(r.assessedTotal).toBe(1)
    expect(r.blocking).toEqual([{ id: 'c', reason: 'unstarted' }])
  })

  it('ผ่าน capstone แล้วแต่ยังมีบทปกติค้าง → record ยังไม่ครบ', () => {
    const r = courseRecordSummary(structure, state({ completed: ['a', 'c'] }))
    expect(r.recordComplete).toBe(false)
    expect(r.assessedPassed).toBe(1)
    expect(r.assessedTotal).toBe(1)
    expect(r.blocking).toEqual([{ id: 'b', reason: 'unstarted' }])
  })

  it('ครบทั้งสองชั้น → ครบเกณฑ์ และรายงานจำนวนด่านวัดผลตามจริง', () => {
    const r = courseRecordSummary(structure, state({ completed: ['a', 'b', 'c'] }))
    expect(r.recordComplete).toBe(true)
    expect(r.assessedPassed).toBe(1)
    expect(r.assessedTotal).toBe(1)
  })

  it('คอร์สที่ไม่มี capstone เลย → record ยังไม่รองรับผลการวัด', () => {
    const r = courseRecordSummary(noCapstone, state({ completed: ['a', 'b'] }))
    expect(r.recordComplete).toBe(false)
    expect(r.assessedTotal).toBe(0)
    // ⚠️ ปัญหาระดับคอร์ส ห้ามปนใน `blocking` เพราะ UI ทำ blocking เป็นลิงก์ไปหน้า
    // บทเรียน — ใส่ slug ลงไปจะได้ลิงก์ไปบทที่ไม่มีอยู่จริง (RIL จับ)
    expect(r.blocking).toEqual([])
    expect(r.courseIssue).toBe('no-assessment')
  })

  it('คอร์สปกติไม่มี courseIssue', () => {
    expect(courseRecordSummary(structure, state()).courseIssue).toBeNull()
  })
})
