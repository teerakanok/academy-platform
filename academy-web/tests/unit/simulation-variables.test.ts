import { describe, expect, it } from 'vitest'
import {
  fillPlaceholders,
  placeholdersIn,
  resolveChallenge,
  rollVariables,
  type SimulationVariables,
} from '@/lib/simulation/variables'
import { gradeSimulation, type SimulationChallenge } from '@/lib/simulation/types'

// โจทย์ที่ค่าเป้าหมายต่างกันทุก attempt (W1)
//
// สิ่งที่ต้องพิสูจน์:
//   1. แทนค่าทั้งฝั่งที่ผู้เรียนอ่าน **และ** ฝั่งที่เซิร์ฟเวอร์ใช้ตรวจ — ถ้าแทนแค่
//      ฝั่งเดียว ผู้เรียนตั้งค่าตามที่อ่านแล้วไม่ผ่าน โดยไม่มีทางเดาสาเหตุ
//   2. คำตอบของ attempt หนึ่งใช้กับอีก attempt ไม่ได้ (นี่คือเหตุผลทั้งหมดของงานนี้)
//   3. โจทย์ที่ไม่มีตัวแปรต้องทำงานเหมือนเดิม (ไม่ breaking)

const VARIABLES: SimulationVariables = {
  targetIp: { kind: 'ipv4-host', network: '192.168.10', min: 40, max: 60 },
  mode: { kind: 'oneOf', values: ['static', 'reserved'] },
}

function challenge(): SimulationChallenge {
  return {
    id: 'c',
    title: 't',
    brief: 'ต้องเข้าถึงได้ที่ {{targetIp}} เสมอ',
    surface: 'network-interface',
    initial: {},
    requiredFields: { dhcp: [], static: ['ipv4'] },
    variables: VARIABLES,
    requirements: [
      { id: 'r-ip', label: 'ตั้ง IP เป็น {{targetIp}}', field: 'ipv4', operator: 'equals', value: '{{targetIp}}' },
      { id: 'r-mode', label: 'โหมด', field: 'addressMode', operator: 'oneOf', value: ['{{mode}}'] },
    ],
    hints: ['ลองดูช่องที่รับค่า {{targetIp}}'],
    debrief: 'ที่อยู่ {{targetIp}} คงเดิมทุกครั้งที่บูต',
  }
}

/** ตัวสุ่มที่กำหนดผลได้ — เทสต้อง deterministic */
const pickFirst = () => 0
const pickLast = (max: number) => max - 1

describe('rollVariables', () => {
  it('ipv4-host อยู่ในช่วงที่กำหนดเสมอ', () => {
    for (let i = 0; i < 21; i++) {
      const rolled = rollVariables(VARIABLES, () => i % 21)
      const host = Number(rolled.targetIp.split('.')[3])
      expect(rolled.targetIp.startsWith('192.168.10.')).toBe(true)
      expect(host).toBeGreaterThanOrEqual(40)
      expect(host).toBeLessThanOrEqual(60)
    }
  })

  it('oneOf เลือกจากรายการที่ให้เท่านั้น', () => {
    expect(rollVariables(VARIABLES, pickFirst).mode).toBe('static')
    expect(rollVariables(VARIABLES, pickLast).mode).toBe('reserved')
  })

  it('ไม่มีตัวแปร = ไม่มีอะไรถูกสุ่ม', () => {
    expect(rollVariables(undefined, pickFirst)).toEqual({})
  })
})

describe('fillPlaceholders / placeholdersIn', () => {
  it('แทนค่าที่รู้จัก และคงข้อความเดิมสำหรับตัวที่ไม่รู้จัก', () => {
    expect(fillPlaceholders('ที่ {{a}} และ {{b}}', { a: 'X' })).toBe('ที่ X และ {{b}}')
  })

  it('อ่านรายชื่อตัวแปรที่ข้อความอ้างถึงได้', () => {
    expect(placeholdersIn('{{a}} กับ {{ b }} และ {{a}}')).toEqual(['a', 'b', 'a'])
  })
})

describe('resolveChallenge', () => {
  it('🔴 แทนค่าทั้งฝั่งที่อ่านและฝั่งที่ตรวจ', () => {
    const rolled = rollVariables(VARIABLES, pickFirst)
    const resolved = resolveChallenge(challenge(), rolled)!

    // ฝั่งที่ผู้เรียนอ่าน
    expect(resolved.brief).toContain(rolled.targetIp)
    expect(resolved.brief).not.toContain('{{')
    expect(resolved.requirements[0].label).toContain(rolled.targetIp)
    expect(resolved.hints?.[0]).toContain(rolled.targetIp)
    expect(resolved.debrief).toContain(rolled.targetIp)

    // ฝั่งที่เซิร์ฟเวอร์ใช้ตรวจ — ถ้าลืมแทนตรงนี้ ผู้เรียนทำตามที่อ่านแล้วไม่ผ่าน
    expect(resolved.requirements[0].value).toBe(rolled.targetIp)
    expect(resolved.requirements[1].value).toEqual([rolled.mode])
  })

  it('ตั้งค่าตามโจทย์ที่อ่าน → ผ่านจริง (สองฝั่งตรงกัน)', () => {
    const rolled = rollVariables(VARIABLES, pickFirst)
    const resolved = resolveChallenge(challenge(), rolled)!
    const verdict = gradeSimulation(resolved, { ipv4: rolled.targetIp, addressMode: rolled.mode })
    expect(verdict.passed).toBe(true)
  })

  it('🔴 คำตอบของ attempt อื่นใช้ไม่ได้ — นี่คือเหตุผลทั้งหมดของการสุ่ม', () => {
    const mine = rollVariables(VARIABLES, () => 0) // 192.168.10.40
    const theirs = rollVariables(VARIABLES, () => 20) // 192.168.10.60
    expect(mine.targetIp).not.toBe(theirs.targetIp)

    const myChallenge = resolveChallenge(challenge(), mine)!
    // ส่งค่าที่ถูกของคนอื่นมา — ต้องไม่ผ่าน
    const verdict = gradeSimulation(myChallenge, { ipv4: theirs.targetIp, addressMode: mine.mode })
    expect(verdict.passed).toBe(false)
    expect(verdict.results.find((r) => r.id === 'r-ip')?.met).toBe(false)
  })

  it('โจทย์ที่ไม่มีตัวแปรทำงานเหมือนเดิมทุกประการ (ไม่ breaking)', () => {
    const plain: SimulationChallenge = {
      id: 'p',
      title: 't',
      brief: 'ตั้งค่าให้ถูก',
      surface: 'network-interface',
      initial: {},
      requiredFields: { dhcp: [], static: [] },
      requirements: [{ id: 'r', label: 'l', field: 'f', operator: 'equals', value: 'x' }],
    }
    expect(resolveChallenge(plain, {})).toBe(plain)
    expect(gradeSimulation(resolveChallenge(plain, {})!, { f: 'x' }).passed).toBe(true)
  })
})

describe('fail closed เมื่อแทนค่าไม่ครบ', () => {
  // รูที่ข้อนี้ปิด (RIL cross-model รอบ W1): attempt ที่ออก **ก่อน** โจทย์มีตัวแปร
  // ยังไม่หมดอายุอีก 60 นาที · ถ้าตรวจด้วยโจทย์ดิบ ค่าที่ต้องได้จะเป็นสตริง
  // `"{{targetIp}}"` ตรงตัว แปลว่ากรอก `{{targetIp}}` ลงช่อง IP ก็ผ่านด่านทันที

  it('🔴 ไม่มีค่าตัวแปรเลย แต่โจทย์ต้องใช้ → คืน null ไม่ใช่โจทย์ดิบ', () => {
    expect(resolveChallenge(challenge(), {})).toBeNull()
  })

  it('🔴 มีค่าบางตัว ขาดบางตัว → คืน null', () => {
    expect(resolveChallenge(challenge(), { targetIp: '192.168.10.44' })).toBeNull()
  })

  it('🔴 โจทย์ดิบที่หลุดไปตรวจ จะทำให้กรอกแม่แบบตรงตัวแล้วผ่าน — จึงต้องไม่มีทางได้มันมา', () => {
    // พิสูจน์ว่าอันตรายที่พูดถึงเป็นของจริง ไม่ใช่ความกังวลลอยๆ
    const raw = challenge()
    expect(gradeSimulation(raw, { ipv4: '{{targetIp}}', addressMode: '{{mode}}' }).passed).toBe(true)
    // และ resolveChallenge ต้องไม่มีวันคืนของชิ้นนี้ออกไป
    expect(resolveChallenge(raw, {})).toBeNull()
  })

  it('label/hints/debrief ที่ยังมีแม่แบบก็ถือว่าไม่ครบ', () => {
    const partial = {
      ...challenge(),
      requirements: [
        { id: 'r', label: 'ตั้งเป็น {{missing}}', field: 'f', operator: 'equals' as const, value: 'x' },
      ],
      hints: undefined,
      debrief: undefined,
    }
    expect(resolveChallenge(partial, { targetIp: '1.1.1.1', mode: 'static' })).toBeNull()
  })
})
