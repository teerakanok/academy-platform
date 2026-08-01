import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// gate ของ token ที่แก้ผิดซ้ำได้ง่ายเพราะ "ดูถูกบนจอเราคนเดียว"
const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')

describe('แสงพื้นหลัง hero', () => {
  const washes = css.match(/--cs-hero-wash:[^;]+;/g) ?? []

  it('มีครบทั้ง light และ dark', () => {
    expect(washes).toHaveLength(2)
  })

  it.each(washes.map((w, i) => [i === 0 ? 'light' : 'dark', w]))(
    'ขนาดของ %s ผูกกับเนื้อหา ไม่ใช่ความกว้างจอ',
    (_theme, wash) => {
      // เคยพลาดมาแล้ว: ใช้ `radial-gradient(105% 78% ...)` บนกล่องกว้าง 100vw
      // แปลว่าจอ 2000px ได้แสงกว้าง 2100px — บนจอกว้างจึงกลายเป็นทุ่งสีฟ้าในที่ว่าง
      // ไม่ใช่แสงหลังหัวเรื่อง ความเข้มไม่ใช่ต้นเหตุ หน่วยต่างหาก
      const size = wash.match(/radial-gradient\(\s*([^,]+?)\s+at\s/)?.[1]
      expect(size, `อ่านขนาดจาก ${wash} ไม่ได้`).toBeDefined()
      expect(size).not.toMatch(/%/)
      expect(size).toMatch(/px/)
    },
  )

  it('กล่องของแสงสูงกว่าเนื้อหา ไม่ใช่ height: 100%', () => {
    // ถ้ากล่องสูงเท่าเนื้อหา ตัวไล่สีจะถูกตัดที่ขอบกล่องทั้งที่ยังไม่จางหมด
    // ผลคือเส้นตัดแนวนอนชัดๆ ที่คนอ่านตีความว่า "หน้าถูกแบ่งครึ่ง" — เคยหลุดมาแล้ว
    // ตัดคอมเมนต์ทิ้งก่อน ไม่งั้นข้อความที่อธิบายข้อผิดพลาดจะถูกนับเป็นตัวข้อผิดพลาดเอง
    const rule = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.hero-bleed::before\s*\{[^}]+\}/)?.[0]
    expect(rule, 'ไม่พบ .hero-bleed::before').toBeDefined()
    expect(rule).not.toMatch(/height:\s*100%/)
    expect(rule).toMatch(/height:\s*\d+px/)
    // ต้องจัดกลางทั้งสองแกน ไม่งั้นแสงจะเกาะขอบใดขอบหนึ่งแล้วโดนตัดที่นั่นแทน
    expect(rule).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/)
  })

  it.each(washes.map((w, i) => [i === 0 ? 'light' : 'dark', w]))('%s จางหายก่อนถึงขอบ', (_theme, wash) => {
    // ต้องจบที่ alpha 0 ไม่งั้นจะเห็นเป็นขอบตัด ซึ่งเป็นสิ่งที่ทำให้เนื้อหาดูถูกขังในกรอบ
    expect(wash).toMatch(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/)
  })
})
