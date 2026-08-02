import { describe, expect, it } from 'vitest'
import { toPublicProgress } from '@/lib/course/public-progress'
import { emptyProgress } from '@/lib/course/progress'
import type { CourseStructure } from '@/lib/content/course-types'

// ความคืบหน้าที่ส่งไป browser ต้องไม่พาผลรายข้อของพื้นผิววัดผลไปด้วย
//
// รูที่ข้อนี้ปิด (RIL cross-model รอบ W1): POST ตอบแค่ `{ok, passed}` ตามสัญญาแล้ว
// แต่ GET คืน `checkpointResults` รายข้อของ capstone มาให้ — ส่ง A,A,A แล้วอ่านว่า
// ข้อไหนถูก, B,B,B, C,C,C ครบสามรอบก็ได้เฉลยทั้งชุดโดยไม่ต้องรู้เนื้อหา
// **ปิดรูที่จุดหนึ่งแล้วเปิดที่อีกจุด คือรูเดิม**

const structure = {
  slug: 'c',
  nodes: [
    { id: 'lesson-1', kind: 'lesson' },
    { id: 'final', kind: 'capstone' },
  ],
} as unknown as CourseStructure

function record() {
  const r = emptyProgress('c')
  r.completed = ['lesson-1', 'final']
  r.checkpointResults = {
    'lesson-1': { q1: true, q2: false },
    final: { 'cp-1': true, 'cp-2': false },
  }
  r.simulationEvidence = {
    final: { 'sim-1': { passed: false, requirements: [{ id: 'r-ip', met: false }] } },
  }
  return r
}

describe('toPublicProgress', () => {
  it('🔴 ตัดผลรายข้อและหลักฐานของ capstone ออก', () => {
    const pub = toPublicProgress(record(), structure)
    expect(pub.checkpointResults.final).toBeUndefined()
    expect(pub.simulationEvidence.final).toBeUndefined()
    // และต้องไม่มีร่องรอยเหลือใน payload จริง
    expect(JSON.stringify(pub)).not.toContain('cp-1')
    expect(JSON.stringify(pub)).not.toContain('r-ip')
  })

  it('บทสอนยังบอกผลรายข้อได้ — feedback คือหน้าที่ของโหมดสอน', () => {
    const pub = toPublicProgress(record(), structure)
    expect(pub.checkpointResults['lesson-1']).toEqual({ q1: true, q2: false })
  })

  it('สถานะยังครบ — ตัดเฉพาะสิ่งที่แปรตามคำตอบ', () => {
    const pub = toPublicProgress(record(), structure)
    expect(pub.completed).toEqual(['lesson-1', 'final'])
    expect(pub.version).toBe(record().version)
  })

  it('🔴 บทปกติที่ถูกบันทึกว่า tested-out ก็ต้องปิด — test-out ทำให้มันเป็นพื้นผิววัดผล', () => {
    const r = record()
    r.testedOut = ['lesson-1']
    const pub = toPublicProgress(r, structure)
    expect(pub.checkpointResults['lesson-1']).toBeUndefined()
  })

  it('🔴 ไม่รู้จักโครงคอร์ส → ตัดทั้งหมด (fail closed)', () => {
    const pub = toPublicProgress(record(), null)
    expect(pub.checkpointResults).toEqual({})
    expect(pub.simulationEvidence).toEqual({})
  })

  it('🔴 บทที่ไม่มีในโครงคอร์ส → ตัด (เนื้อหาถูกถอดออกไปแล้ว)', () => {
    const r = record()
    r.checkpointResults['ผีบทเก่า'] = { q1: true }
    const pub = toPublicProgress(r, structure)
    expect(pub.checkpointResults['ผีบทเก่า']).toBeUndefined()
  })
})
