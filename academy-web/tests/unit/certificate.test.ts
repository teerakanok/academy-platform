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

// ── W0-3: ใบรับรองอ้างถึงหลักฐาน ไม่ใช่ความคืบหน้า (แก้ F3) ────────────────────
//
// เดิมฟังก์ชันนี้นับ `completed` เป็น proven ตรงๆ แปลว่าคนที่ไล่ลองบทปกติจนผ่าน
// (ซึ่งทำได้จริงและตั้งใจให้ทำได้ เพราะโหมดสอนบอกคำอธิบายและ retry ไม่จำกัด)
// ได้ใบรับรองโดยไม่เคยผ่านด่านวัดผลเลยสักจุด
describe('ใบรับรองต้องอ้างถึง capstone เท่านั้น', () => {
  const noCapstone = {
    slug: 'nc',
    nodes: [
      { id: 'a', kind: 'lesson', estimatedMinutes: 5, prerequisites: [], skills: {} },
      { id: 'b', kind: 'lesson', estimatedMinutes: 5, prerequisites: ['a'], skills: {} },
    ],
  } as unknown as CourseStructure

  it('เดินครบทุกบทแต่ยังไม่ผ่าน capstone → ยังไม่ได้ใบ', () => {
    // จำลองผลของการ "ไล่ลองจนผ่าน" ทุกบทปกติ: a และ b เป็น completed แล้ว
    // แต่ c (capstone) ยังไม่ผ่าน — ต้องไม่ได้ใบ
    const r = certificateEligibility(structure, state({ completed: ['a', 'b'] }))
    expect(r.eligible).toBe(false)
    expect(r.assessedPassed).toBe(0)
    expect(r.assessedTotal).toBe(1)
    expect(r.blocking).toEqual([{ id: 'c', reason: 'unstarted' }])
  })

  it('ผ่าน capstone แล้วแต่ยังมีบทปกติค้าง → ยังไม่ได้ใบ (ต้องครบทั้งสองชั้น)', () => {
    const r = certificateEligibility(structure, state({ completed: ['a', 'c'] }))
    expect(r.eligible).toBe(false)
    expect(r.assessedPassed).toBe(1)
    expect(r.assessedTotal).toBe(1)
    expect(r.blocking).toEqual([{ id: 'b', reason: 'unstarted' }])
  })

  it('ครบทั้งสองชั้น → ได้ใบ และรายงานจำนวนด่านวัดผลตามจริง', () => {
    const r = certificateEligibility(structure, state({ completed: ['a', 'b', 'c'] }))
    expect(r.eligible).toBe(true)
    expect(r.assessedPassed).toBe(1)
    expect(r.assessedTotal).toBe(1)
  })

  it('คอร์สที่ไม่มี capstone เลย → ออกใบไม่ได้ เพราะใบจะไม่ได้อ้างถึงหลักฐานใด', () => {
    const r = certificateEligibility(noCapstone, state({ completed: ['a', 'b'] }))
    expect(r.eligible).toBe(false)
    expect(r.assessedTotal).toBe(0)
    expect(r.blocking).toEqual([{ id: 'nc', reason: 'unproven' }])
  })
})
