import { describe, expect, it, vi } from 'vitest'
import {
  attemptExplanations,
  buildAttemptParams,
  normalizeAttemptParams,
  remapAnswersToReal,
  toPublicQuestions,
  type AttemptParams,
} from '@/lib/course/attempt'
import { attemptQuota } from '@/lib/course/attempt-db'
import type { CheckpointQuestion } from '@/lib/content/course-types'

// ตรรกะ params ของ attempt — สิ่งที่ต้องพิสูจน์คือ "remap แล้วตรวจกลับได้ถูกเสมอ"
// และ "รูป public ไม่มีทางพาเฉลยออกไป" ไม่ใช่แค่รันผ่าน

const bank: CheckpointQuestion[] = [
  {
    id: 'q1',
    prompt: 'คำถามหนึ่ง',
    choices: { A: 'ตัวเลือกหนึ่ง', B: 'ตัวเลือกสอง', C: 'ตัวเลือกสาม', D: 'ตัวเลือกสี่' },
    correct: ['A'],
    explanation: 'เหตุผลลับของข้อหนึ่ง',
  },
  {
    id: 'q2',
    prompt: 'คำถามสอง',
    choices: { A: 'หนึ่ง', B: 'สอง', C: 'สาม' },
    correct: ['B', 'C'],
    explanation: 'เหตุผลลับของข้อสอง',
  },
  {
    id: 'q3',
    prompt: 'คำถามสาม',
    choices: { A: 'x', B: 'y' },
    correct: ['B'],
    explanation: 'เหตุผลลับของข้อสาม',
  },
]

describe('buildAttemptParams', () => {
  it('สุ่มได้เฉพาะข้อที่มีในคลัง และจำนวนตามที่ขอ', () => {
    const params = buildAttemptParams(bank, 2)
    expect(params.questionIds).toHaveLength(2)
    const bankIds = new Set(bank.map((q) => q.id))
    for (const id of params.questionIds) expect(bankIds.has(id)).toBe(true)
    // ไม่มีข้อซ้ำ
    expect(new Set(params.questionIds).size).toBe(2)
  })

  it('ขอเกินขนาดคลังได้อย่างมากเท่าคลัง', () => {
    expect(buildAttemptParams(bank, 99).questionIds).toHaveLength(bank.length)
  })

  it('ตาราง remap ต่อข้อเป็น bijection บนชุด key เดิม', () => {
    const params = buildAttemptParams(bank, bank.length)
    for (const q of bank) {
      const map = params.keyMaps[q.id]
      const realKeys = Object.keys(q.choices).sort()
      // client เห็นชุด key เดิม (ครบทุกตัว) และค่าที่ map ไปคือ key จริงครบทุกตัวไม่ซ้ำ
      expect(Object.keys(map).sort()).toEqual(realKeys)
      expect(Object.values(map).sort()).toEqual(realKeys)
    }
  })

  it('snapshot เฉลย (key จริง) ติดมากับ params ของทุกข้อที่สุ่ม — ไม่ต้องพึ่งไฟล์คอร์สตอนตรวจ', () => {
    const params = buildAttemptParams(bank, bank.length)
    for (const q of bank) {
      expect(params.answerKeys[q.id]).toEqual(q.correct)
      // ต้องเป็นสำเนา ไม่ใช่ reference — เนื้อหาเปลี่ยนภายหลังแล้ว snapshot ต้องไม่ขยับ
      expect(params.answerKeys[q.id]).not.toBe(q.correct)
    }
  })

  it('snapshot คำอธิบายตาม attempt โดยไม่ส่งออกไปกับโจทย์ public', () => {
    const params = buildAttemptParams(bank, bank.length)
    for (const q of bank) {
      expect(params.explanations?.[q.id]).toBe(q.explanation)
      expect(JSON.stringify(params.questions)).not.toContain(q.explanation)
    }
    expect(attemptExplanations(params)).toEqual(
      Object.fromEntries(params.questionIds.map((id) => [id, bank.find((q) => q.id === id)!.explanation])),
    )
  })

  it('attempt เก่าที่ไม่มี explanation snapshot ต้อง fail closed', () => {
    expect(
      attemptExplanations({
        questionIds: ['q1'],
        questions: [],
        keyMaps: {},
        answerKeys: {},
        assessment: { assessed: true },
      }),
    ).toBeNull()
  })

  it('remap ต่างกันได้ระหว่าง attempt (สุ่มจริง ไม่ใช่ identity ตายตัว)', () => {
    // ข้อ 4 ตัวเลือกมี 24 permutation — 20 attempt แล้วยังได้ map เดิมทุกครั้ง
    // มีโอกาส (1/24)^19 ≈ 0 · ถ้าเทสนี้ตก แปลว่า shuffle ไม่ได้ทำงาน
    const maps = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const params = buildAttemptParams([bank[0]], 1)
      maps.add(JSON.stringify(params.keyMaps.q1))
    }
    expect(maps.size).toBeGreaterThan(1)
  })
})

describe('toPublicQuestions', () => {
  it('ไม่มี field เฉลยหรือคำอธิบายในรูป public — ทั้งระดับ type และค่า runtime', () => {
    const params = buildAttemptParams(bank, bank.length)
    for (const pub of toPublicQuestions(bank, params)) {
      expect(pub).not.toHaveProperty('correct')
      expect(pub).not.toHaveProperty('explanation')
      // ข้อความ explanation ต้องไม่โผล่ที่ไหนเลยใน payload (สตริงยาวไม่ซ้ำ ใช้ชี้วัดได้
      // ต่างจากเฉลย "A" ที่เป็น key ซึ่งอยู่ใน choices โดยธรรมชาติ)
      const serialized = JSON.stringify(pub)
      for (const q of bank) expect(serialized).not.toContain(q.explanation)
    }
  })

  it('ข้อความตัวเลือกครบชุดเดิม แค่ย้าย key ตามตาราง remap', () => {
    const params = buildAttemptParams(bank, bank.length)
    const pub = toPublicQuestions(bank, params)
    for (const p of pub) {
      const original = bank.find((q) => q.id === p.id)!
      expect(Object.values(p.choices).sort()).toEqual(Object.values(original.choices).sort())
      // ตำแหน่งข้อความตรงตาราง: ข้อความใต้ clientKey ต้องเป็นข้อความของ key จริงที่ map ไป
      for (const [clientKey, text] of Object.entries(p.choices)) {
        expect(text).toBe(original.choices[params.keyMaps[p.id][clientKey]])
      }
    }
  })

  it('params ที่อ้างข้อนอกคลัง = ข้อมูลพัง ต้อง throw ไม่ใช่ข้ามเงียบ', () => {
    expect(() =>
      toPublicQuestions(bank, {
        questionIds: ['ghost'],
        questions: [],
        keyMaps: { ghost: { A: 'A' } },
        answerKeys: { ghost: ['A'] },
        assessment: { assessed: true },
      }),
    ).toThrow()
  })
})

describe('remapAnswersToReal', () => {
  it('roundtrip: client เลือกข้อความของเฉลยจริง → แปลงกลับตรงกับ snapshot เฉลยใน params', () => {
    const params = buildAttemptParams(bank, bank.length)
    const pub = toPublicQuestions(bank, params)
    for (const p of pub) {
      const original = bank.find((q) => q.id === p.id)!
      // จำลองผู้เรียนที่รู้คำตอบ: เลือก clientKey ที่ข้อความตรงกับตัวเลือกเฉลยจริง
      const clientPick = Object.entries(p.choices)
        .filter(([, text]) => original.correct.some((real) => original.choices[real] === text))
        .map(([clientKey]) => clientKey)
      const real = remapAnswersToReal(params, p.id, clientPick)
      expect(real).not.toBeNull()
      expect([...real!].sort()).toEqual([...params.answerKeys[p.id]].sort())
    }
  })

  it('key ที่แต่งขึ้นเอง = ปฏิเสธทั้ง submission ไม่ใช่ตัดทิ้งเงียบๆ', () => {
    const params = buildAttemptParams(bank, bank.length)
    // RIL จับ: ถ้าตัดตัวปลอมทิ้ง [เฉลยถูก, 'Z'] จะหดเหลือ [เฉลยถูก] แล้วผ่านการตรวจ
    const correctClientKey = Object.entries(params.keyMaps.q1).find(
      ([, real]) => real === bank[0].correct[0],
    )![0]
    expect(remapAnswersToReal(params, 'q1', [correctClientKey, 'Z'])).toBeNull()
    expect(remapAnswersToReal(params, 'q1', ['Z', 'ไม่มี'])).toBeNull()
    expect(remapAnswersToReal(params, 'ข้อที่ไม่มี', ['A'])).toBeNull()
  })

  it('key ซ้ำในชุดคำตอบ = ปฏิเสธ', () => {
    const params = buildAttemptParams(bank, bank.length)
    expect(remapAnswersToReal(params, 'q2', ['A', 'A'])).toBeNull()
  })

  it('ชื่อที่ตกลงไปโดน Object.prototype ต้องไม่ทะลุ (prototype pollution)', () => {
    // RIL รอบ 2 รันพิสูจน์สด: lookup บน plain object ด้วย qid='toString' ได้ function
    // กลับมาแทน undefined — ทุกกรณีต้องถูกปฏิเสธเป็น null เท่านั้น
    const params = buildAttemptParams(bank, bank.length)
    for (const evil of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(remapAnswersToReal(params, evil, ['A'])).toBeNull()
      expect(remapAnswersToReal(params, 'q1', [evil])).toBeNull()
    }
  })
})

describe('attemptQuota', () => {
  // โควตาเป็นค่าคอนฟิกตั้งแต่ RIL รอบ W1 (เดิม e2e ล้างสมุดนับโควตาทิ้งเพื่อให้รันซ้ำได้
  // ซึ่งลบ speed bump ในของจริงไปด้วย) · ค่าที่อ่านผิดต้องตกกลับไปที่ค่าตั้งต้นเสมอ
  // ไม่ใช่กลายเป็น 0 (ปิดตาย) หรือ NaN (เปิดหมด)
  const cases: [string | undefined, number][] = [
    [undefined, 3],
    ['', 3],
    ['  ', 3],
    ['500', 500],
    ['1', 1],
    ['0', 3],
    ['-5', 3],
    ['abc', 3],
    ['3.9', 3],
  ]

  it.each(cases)('ATTEMPT_MAX_PER_WINDOW=%s → %i', (value, expected) => {
    if (value === undefined) vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', '')
    else vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', value)
    expect(attemptQuota()).toBe(expected)
    vi.unstubAllEnvs()
  })
})

describe('legacy attempt snapshot normalization', () => {
  it('เติม readiness และ assessed policy เดิมโดยไม่ crash ระหว่าง reuse ข้าม deploy', () => {
    const legacy = {
      questionIds: [],
      questions: [],
      keyMaps: {},
      answerKeys: {},
      simulations: [{
        id: 'sim-1',
        challenge: {
          id: 'legacy',
          title: 'Legacy',
          brief: 'Configure the interface',
          surface: 'network-interface',
          initial: { addressMode: 'dhcp', ipv4: '', subnet: '', gateway: '', applied: false },
          requirements: [],
        },
      }],
    } as unknown as AttemptParams

    const normalized = normalizeAttemptParams(legacy)
    expect(normalized.assessment).toEqual({ assessed: true })
    expect(normalized.simulations?.[0].challenge.requiredFields).toEqual({
      dhcp: [],
      static: ['ipv4', 'subnet', 'gateway'],
    })
  })

  it('snapshot policy ที่ออกใหม่เก็บ learn mode ได้ ไม่ถูก fallback เป็น assessed', () => {
    expect(normalizeAttemptParams(buildAttemptParams(bank, bank.length, false)).assessment).toEqual({ assessed: false })
  })
})
