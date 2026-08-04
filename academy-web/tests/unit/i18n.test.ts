import { describe, expect, it } from 'vitest'
import { UI, UI_LOCALES, type UiStrings } from '@/lib/i18n/ui'
import { PRIVACY } from '@/lib/i18n/privacy'

// กฎที่ห้ามผิด: เว็บภาษาอังกฤษต้องไม่มีอักษรไทยหลุดเลย
//
// คนต่างชาติที่เปิดมาต้องอ่านได้ทั้งหน้า ไม่ใช่เจอลิงก์หรือประโยคไทยคาอยู่กลางหน้า
// แล้วเดาไม่ออกว่ามันคืออะไร (เคยหลุดจริงที่ลิงก์ privacy บน footer และคำอธิบาย
// caption ใต้วิดีโอ) — เทสนี้จับให้ตั้งแต่ตอน build ไม่ใช่ตอนมีคนทัก

const THAI = /[฀-๿]/

function collectStrings(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === 'string') {
    out.push([path, value])
  } else if (typeof value === 'function') {
    // ข้อความที่เป็นฟังก์ชัน ต้องเรียกด้วยค่าตัวอย่างถึงจะเห็นผลลัพธ์จริง
    out.push([path, String((value as (...a: unknown[]) => string)('sample@example.com'))])
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, `${path}.${k}`, out)
  }
}

describe('ภาษาของตัวเว็บ', () => {
  it('ฉบับภาษาอังกฤษไม่มีอักษรไทยเลย', () => {
    const out: [string, string][] = []
    collectStrings(UI.en, 'UI.en', out)
    collectStrings(PRIVACY.en, 'PRIVACY.en', out)
    const leaks = out.filter(([, text]) => THAI.test(text))
    expect(leaks.map(([p, t]) => `${p}: ${t}`)).toEqual([])
  })

  it('ฉบับภาษาไทยเป็นภาษาไทยจริง ไม่ใช่อังกฤษค้างไว้', () => {
    // อนุญาตให้มีคำทับศัพท์/ชื่อแบรนด์ปนได้ แต่ประโยคหลักต้องเป็นไทย
    const out: [string, string][] = []
    collectStrings(UI.th, 'UI.th', out)
    const longOnes = out.filter(([, t]) => t.length > 25)
    const notThai = longOnes.filter(([, t]) => !THAI.test(t))
    expect(notThai.map(([p]) => p)).toEqual([])
  })

  it('ทั้งสองภาษามีคีย์ครบเท่ากัน', () => {
    const keys = (o: unknown, prefix = ''): string[] => {
      if (!o || typeof o !== 'object') return [prefix]
      return Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null && !Array.isArray(v) ? keys(v, `${prefix}.${k}`) : [`${prefix}.${k}`],
      )
    }
    expect(keys(UI.th).sort()).toEqual(keys(UI.en).sort())
  })

  it('นโยบายความเป็นส่วนตัวมีหัวข้อครบเท่ากันทั้งสองภาษา', () => {
    expect(PRIVACY.th.sections).toHaveLength(PRIVACY.en.sections.length)
    // ฉบับอังกฤษต้องบอกชัดว่าเป็นคำแปล ไม่ใช่เอกสารกฎหมายคนละฉบับ
    expect(PRIVACY.en.translationNote).toBeTruthy()
  })

  it('ครบทุกภาษาที่ประกาศไว้', () => {
    for (const l of UI_LOCALES) {
      expect(UI[l], `ไม่มี dictionary ของ ${l}`).toBeTruthy()
      expect(PRIVACY[l], `ไม่มีนโยบายของ ${l}`).toBeTruthy()
    }
  })

  it('ไม่สัญญาว่า Academy ออกใบรับรองได้แล้ว', () => {
    const out: [string, string][] = []
    collectStrings(UI, 'UI', out)
    const copy = out.map(([, text]) => text).join('\n')

    expect(copy).not.toMatch(/certifications we issue|certificate stands behind|the certificate certifies/i)
    expect(copy).not.toMatch(/works across everything we run|everything we run/i)
    expect(copy).not.toContain('ใบรับรองที่เราออกเอง')
    expect(copy).not.toContain('ใบรับรองยืนยัน')
    expect(copy).not.toContain('ทุกบริการของเรา')
    expect(copy).not.toContain('ใช้ได้ทุกบริการ')
  })
})

describe('ชนิดของ dictionary', () => {
  it('โครงตรงกับ UiStrings', () => {
    const check: UiStrings = UI.th
    expect(check.nav.myLearning.length).toBeGreaterThan(0)
  })
})
