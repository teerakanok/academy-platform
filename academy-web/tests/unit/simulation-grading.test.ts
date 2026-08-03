import { describe, expect, it } from 'vitest'
import { gradeSimulation, gradingFingerprint, type SimulationChallenge } from '@/lib/simulation/types'

// การตรวจโจทย์จำลอง — **fail-closed ทุกทาง**
//
// 🔴 รุ่นก่อนมีกรณี "ผ่านเพราะไม่มีอะไรเลย" (RIL cross-model จับ):
//   · `equals` ที่ requirement ไม่ระบุ value และ client ไม่ส่ง field → undefined === undefined
//   · `notEquals` / `isFalse` → ผ่านทันทีเมื่อ client ละ field ทิ้ง
// แปลว่า "ไม่ทำอะไรเลย" ผ่านด่านได้ · เทสชุดนี้คือด่านที่กันไม่ให้ย้อนกลับไปแบบนั้น
// (RIL รอบ 2 ชี้ว่ายังไม่มีเทสของ operator เหล่านี้เลย mutation จึงทะลุ)

function challenge(requirements: SimulationChallenge['requirements']): SimulationChallenge {
  return {
    id: 'c',
    title: 't',
    brief: 'b',
    surface: 'network-interface',
    initial: {},
    requiredFields: { dhcp: [], static: [] },
    requirements,
  }
}

describe('meets — ทุก operator ต้อง fail-closed เมื่อไม่มี field ในสถานะ', () => {
  const cases: { operator: SimulationChallenge['requirements'][number]['operator']; value?: string | string[] }[] = [
    { operator: 'equals', value: 'x' },
    { operator: 'notEquals', value: 'x' },
    { operator: 'oneOf', value: ['x', 'y'] },
    { operator: 'isTrue' },
    { operator: 'isFalse' },
  ]

  it.each(cases.map((c) => c.operator))('%s: client ละ field ทิ้ง → ไม่ผ่าน', (operator) => {
    const found = cases.find((c) => c.operator === operator)!
    const verdict = gradeSimulation(
      challenge([{ id: 'r', label: 'l', field: 'missing', operator, value: found.value }]),
      {},
    )
    expect(verdict.passed, `${operator} ผ่านทั้งที่ไม่มี field — "ไม่ทำอะไรเลย" ผ่านด่านได้`).toBe(false)
  })

  it.each(['equals', 'notEquals'] as const)('%s ที่ไม่มี value ในโจทย์ → ไม่ผ่าน (เงื่อนไขตัดสินอะไรไม่ได้)', (operator) => {
    const verdict = gradeSimulation(challenge([{ id: 'r', label: 'l', field: 'f', operator }]), { f: 'anything' })
    expect(verdict.passed).toBe(false)
  })

  it('oneOf ที่ value ไม่ใช่อาร์เรย์ → ไม่ผ่าน', () => {
    const verdict = gradeSimulation(
      challenge([{ id: 'r', label: 'l', field: 'f', operator: 'oneOf', value: 'x' }]),
      { f: 'x' },
    )
    expect(verdict.passed).toBe(false)
  })

  it('ชื่อ field ที่ตกไปโดน Object.prototype ต้องไม่ทะลุ', () => {
    // สถานะมาจาก client ทั้งก้อน — index ตรงๆ จะเจอ function บน prototype
    //
    // ⚠️ ต้องใช้ `notEquals` ไม่ใช่ `isTrue` — เทสรุ่นแรกใช้ isTrue ซึ่ง false positive
    // เพราะ function ที่ทะลุมาก็ไม่เท่ากับ `true` อยู่ดี เทสจึงเขียวแม้ guard ถูกถอด
    // (RIL รอบ 3 พิสูจน์ด้วย in-memory mutation) · notEquals จับได้จริงเพราะ
    // function !== 'x' → ผ่านทันทีถ้า prototype ทะลุ
    for (const field of ['toString', 'constructor', 'hasOwnProperty']) {
      const notEquals = gradeSimulation(
        challenge([{ id: 'r', label: 'l', field, operator: 'notEquals', value: 'x' }]),
        {},
      )
      expect(notEquals.passed, `field=${field} ทะลุไปเจอ prototype (notEquals)`).toBe(false)

      const isTrue = gradeSimulation(challenge([{ id: 'r', label: 'l', field, operator: 'isTrue' }]), {})
      expect(isTrue.passed).toBe(false)
    }
  })
})

describe('meets — เคสที่ต้องผ่านก็ต้องผ่านจริง (ไม่ใช่เข้มจนใช้ไม่ได้)', () => {
  it('ค่าตรงตามเงื่อนไขครบทุกแบบ', () => {
    const verdict = gradeSimulation(
      challenge([
        { id: 'r1', label: 'l', field: 'mode', operator: 'equals', value: 'static' },
        { id: 'r2', label: 'l', field: 'other', operator: 'notEquals', value: 'bad' },
        { id: 'r3', label: 'l', field: 'pick', operator: 'oneOf', value: ['a', 'b'] },
        { id: 'r4', label: 'l', field: 'on', operator: 'isTrue' },
        { id: 'r5', label: 'l', field: 'off', operator: 'isFalse' },
      ]),
      { mode: 'static', other: 'good', pick: 'b', on: true, off: false },
    )
    expect(verdict.passed).toBe(true)
    expect(verdict.metCount).toBe(5)
  })

  it('เว้นวรรคหัวท้ายไม่ถือว่าผิด — ผู้เรียนพิมพ์เกินไม่ควรตก', () => {
    const verdict = gradeSimulation(
      challenge([{ id: 'r', label: 'l', field: 'ip', operator: 'equals', value: '10.0.0.1' }]),
      { ip: '  10.0.0.1 ' },
    )
    expect(verdict.passed).toBe(true)
  })
})

describe('gradingFingerprint — ต้องผูกกับกติกาจริง', () => {
  const base = challenge([{ id: 'r1', label: 'l', field: 'f', operator: 'equals', value: 'x' }])

  it('กติกาเดิม → ค่าเดิมเสมอ (deterministic)', () => {
    expect(gradingFingerprint(base)).toBe(gradingFingerprint(structuredClone(base)))
  })

  it.each([
    ['ค่าที่ต้องได้เปลี่ยน', { ...base, requirements: [{ ...base.requirements[0], value: 'y' }] }],
    ['operator เปลี่ยน', { ...base, requirements: [{ ...base.requirements[0], operator: 'notEquals' as const }] }],
    ['field เปลี่ยน', { ...base, requirements: [{ ...base.requirements[0], field: 'g' }] }],
    ['เพิ่ม requirement', {
      ...base,
      requirements: [...base.requirements, { id: 'r2', label: 'l', field: 'h', operator: 'isTrue' as const }],
    }],
    ['surface เปลี่ยน', { ...base, surface: 'other-surface' as SimulationChallenge['surface'] }],
  ])('%s → ลายนิ้วมือต้องเปลี่ยน', (_label, changed) => {
    // ⚠️ ถ้าฟังก์ชันนี้คืนค่าคงที่ เทสที่ตรวจแค่รูปแบบ (`/^sim-[0-9a-f]{8}$/`) จะเขียว
    // ทั้งที่หลักฐานอ้างเวอร์ชันที่ไม่มีความหมาย — RIL รอบ 2 ชี้ช่องนี้
    expect(gradingFingerprint(changed as SimulationChallenge)).not.toBe(gradingFingerprint(base))
  })

  it('ลำดับของ requirements ไม่ทำให้ค่าต่าง (เรียงก่อนคำนวณ)', () => {
    const two = challenge([
      { id: 'a', label: 'l', field: 'f', operator: 'isTrue' },
      { id: 'b', label: 'l', field: 'g', operator: 'isFalse' },
    ])
    const reordered = { ...two, requirements: [...two.requirements].reverse() }
    expect(gradingFingerprint(reordered)).toBe(gradingFingerprint(two))
  })

  it('label เปลี่ยนไม่ทำให้ค่าต่าง — label คือคำอธิบาย ไม่ใช่กติกา', () => {
    const relabeled = { ...base, requirements: [{ ...base.requirements[0], label: 'เขียนใหม่' }] }
    expect(gradingFingerprint(relabeled)).toBe(gradingFingerprint(base))
  })
})
