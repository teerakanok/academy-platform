import { describe, expect, it } from 'vitest'
import { simulationsToGrade, type SimulationSet } from '@/lib/course/attempt-grading'
import type { AttemptParams } from '@/lib/course/attempt'
import type { SimulationChallenge } from '@/lib/simulation/types'

// "ตรวจด้วยโจทย์ชุดไหน" — คำถามที่ deploy ระหว่างทางทำให้ตอบผิดได้ (RIL รอบ 2)
//
// attempt อายุ 60 นาที · ถ้าไฟล์เนื้อหาเปลี่ยนระหว่างนั้นแล้วเรายังตรวจจากไฟล์
// ผู้เรียนจะถูกตัดสินด้วยกติกาที่เขาไม่เคยเห็น — ตั้งค่าตามที่อ่านแล้วไม่ผ่าน
// โดยไม่มีทางเดาสาเหตุ · และถ้าเนื้อหา **เพิ่ม** ด่าน บทอาจถูกบันทึกว่าผ่านทั้งที่
// ไม่มีหลักฐานของด่านใหม่เลย

function challenge(value: string): SimulationChallenge {
  return {
    id: 'c',
    title: 't',
    brief: `ตั้งเป็น ${value}`,
    surface: 'network-interface',
    initial: {},
    requirements: [{ id: 'r', label: 'l', field: 'ipv4', operator: 'equals', value }],
  }
}

const fromContent: SimulationSet = [{ id: 'sim-1', challenge: challenge('192.168.10.99') }]

function params(simulations?: SimulationSet): AttemptParams {
  return { questionIds: [], questions: [], keyMaps: {}, answerKeys: {}, simulations }
}

describe('simulationsToGrade', () => {
  it('ไม่มี attempt (บทสอนทั่วไป) → ใช้ของในไฟล์', () => {
    expect(simulationsToGrade(null, fromContent)).toEqual({ ok: true, simulations: fromContent })
  })

  it('🔴 มี attempt → ใช้ snapshot ของ attempt ไม่ใช่ไฟล์ (แม้ค่าต่างกัน)', () => {
    const snapshot: SimulationSet = [{ id: 'sim-1', challenge: challenge('192.168.10.41') }]
    const result = simulationsToGrade(params(snapshot), fromContent)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.simulations).toBe(snapshot)
    // ค่าที่ใช้ตรวจต้องเป็นของ attempt — ไม่ใช่ค่าปัจจุบันในไฟล์
    expect(result.simulations[0].challenge.requirements[0].value).toBe('192.168.10.41')
  })

  it('🔴 deploy เพิ่มด่านใหม่หลังออก attempt → ไม่ตรวจต่อ ให้เริ่มใหม่', () => {
    const snapshot: SimulationSet = [{ id: 'sim-1', challenge: challenge('192.168.10.41') }]
    const grown: SimulationSet = [...fromContent, { id: 'sim-2', challenge: challenge('10.0.0.5') }]
    expect(simulationsToGrade(params(snapshot), grown)).toEqual({ ok: false, reason: 'stale-attempt' })
  })

  it('🔴 deploy ลบด่านทิ้งหลังออก attempt → ไม่ตรวจต่อ ให้เริ่มใหม่', () => {
    const snapshot: SimulationSet = [{ id: 'sim-1', challenge: challenge('192.168.10.41') }]
    expect(simulationsToGrade(params(snapshot), [])).toEqual({ ok: false, reason: 'stale-attempt' })
  })

  it('🔴 attempt ที่ออกก่อนมี snapshot (deploy คร่อม) → ไม่ตรวจต่อ', () => {
    // params รุ่นเก่าไม่มีฟิลด์ `simulations` เลย — ตรวจด้วยไฟล์ไม่ได้เด็ดขาด
    expect(simulationsToGrade(params(undefined), fromContent)).toEqual({
      ok: false,
      reason: 'stale-attempt',
    })
  })

  it('บทที่ไม่มีด่านจำลองเลย → ผ่านได้ตามปกติ (ไม่ใช่ stale)', () => {
    expect(simulationsToGrade(params([]), [])).toEqual({ ok: true, simulations: [] })
  })
})
