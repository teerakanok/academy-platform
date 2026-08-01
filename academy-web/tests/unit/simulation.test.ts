import { describe, expect, it } from 'vitest'
import { gradeSimulation, type SimulationChallenge } from '@/lib/simulation/types'
import { getLesson } from '@/lib/content/course-source'

// การตัดสินต้องมาจาก "สถานะสุดท้าย" ไม่ใช่ลำดับการคลิก — ของจริงมีหลายทางไปถึงผล
// เดียวกัน การบังคับลำดับคือการสอนให้ท่องขั้นตอน ซึ่งตรงข้ามกับสิ่งที่โจทย์นี้มีไว้ทำ

function challengeFrom(nodeId: string, index: number): SimulationChallenge {
  const resolved = getLesson('content-formats-demo', nodeId)
  expect(resolved, `ไม่พบบท ${nodeId}`).toBeTruthy()
  const sims = resolved!.lesson.blocks.filter((b) => b.kind === 'simulation')
  expect(sims.length, 'บทนี้ต้องมีโจทย์จำลอง').toBeGreaterThan(index)
  return (sims[index] as { kind: 'simulation'; challenge: SimulationChallenge }).challenge
}

describe('การตัดสินโจทย์จำลอง', () => {
  it('สถานะตั้งต้นต้องยังไม่ผ่าน — ไม่งั้นไม่มีอะไรให้ทำ', () => {
    for (const i of [0, 1]) {
      const c = challengeFrom('formats-simulation', i)
      expect(gradeSimulation(c, c.initial).passed, `${c.id} ผ่านตั้งแต่ยังไม่แตะ`).toBe(false)
    }
  })

  it('print server: ตั้ง static ครบทุกค่าแล้วผ่าน', () => {
    const c = challengeFrom('formats-simulation', 0)
    const verdict = gradeSimulation(c, {
      addressMode: 'static',
      ipv4: '192.168.10.50',
      subnet: '255.255.255.0',
      gateway: '192.168.10.1',
      dns1: '192.168.10.1',
      applied: true,
    })
    expect(verdict.passed).toBe(true)
    expect(verdict.metCount).toBe(verdict.total)
  })

  it('เว้นวรรคหัวท้ายไม่ถือว่าผิด — คนพิมพ์ ไม่ใช่เครื่องกรอก', () => {
    const c = challengeFrom('formats-simulation', 0)
    const verdict = gradeSimulation(c, {
      addressMode: 'static',
      ipv4: '  192.168.10.50 ',
      subnet: '255.255.255.0 ',
      gateway: ' 192.168.10.1',
      dns1: '192.168.10.1',
      applied: true,
    })
    expect(verdict.passed).toBe(true)
  })

  it('ลืมกด OK = ยังไม่ผ่าน และบอกได้ว่าข้อไหนค้าง', () => {
    const c = challengeFrom('formats-simulation', 0)
    const verdict = gradeSimulation(c, {
      addressMode: 'static',
      ipv4: '192.168.10.50',
      subnet: '255.255.255.0',
      gateway: '192.168.10.1',
      dns1: '192.168.10.1',
      applied: false,
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.results.find((r) => r.id === 'applied')?.met).toBe(false)
    expect(verdict.results.filter((r) => r.met)).toHaveLength(verdict.total - 1)
  })

  it('laptop: คำตอบตรงข้ามกับ print server บนหน้าจอเดียวกัน', () => {
    const c = challengeFrom('formats-simulation', 1)
    // ค่าที่ถูกของ print server ต้อง "ไม่ผ่าน" ที่นี่ — นี่คือหัวใจของบทนี้
    expect(
      gradeSimulation(c, {
        addressMode: 'static',
        ipv4: '192.168.10.50',
        subnet: '255.255.255.0',
        gateway: '192.168.10.1',
        dns1: '192.168.10.1',
        applied: true,
      }).passed,
    ).toBe(false)
    expect(gradeSimulation(c, { addressMode: 'dhcp', applied: true }).passed).toBe(true)
  })

  it('เลือกถูกแต่ยังไม่ยืนยัน = ยังไม่ผ่าน', () => {
    const c = challengeFrom('formats-simulation', 1)
    expect(gradeSimulation(c, { addressMode: 'dhcp', applied: false }).passed).toBe(false)
  })

  it('คำใบ้ต้องไม่เฉลยค่าที่ต้องกรอกตรงๆ', () => {
    // ถ้าคำใบ้บอกเลขที่ต้องพิมพ์ ผู้เรียนก็แค่ก๊อปลงช่อง แล้วไม่ได้อะไรติดตัวไป
    for (const i of [0, 1]) {
      const c = challengeFrom('formats-simulation', i)
      const answers = c.requirements
        .map((r) => r.value)
        .filter((v): v is string => typeof v === 'string' && /\d/.test(v))
      for (const hint of c.hints ?? []) {
        for (const answer of answers) {
          expect(hint, `คำใบ้ของ ${c.id} เฉลย ${answer}`).not.toContain(answer)
        }
      }
    }
  })
})
