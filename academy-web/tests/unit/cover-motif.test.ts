import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// กรอบที่ประกาศไว้ต้องตรงกับพิกัดที่วาดจริง
//
// ถ้าไม่ตรง ลายจะถูกย่อ/ขยายผิดสัดส่วนแล้วดูใหญ่หรือเล็กกว่าลายอื่นโดยไม่มีอะไรพัง
// — เป็นความผิดพลาดที่มองไม่เห็นจนกว่าจะวางสองการ์ดข้างกัน
const src = readFileSync(join(process.cwd(), 'src', 'components', 'course', 'CoverMotif.tsx'), 'utf8')

function drawnBox(fnName: string): [number, number, number, number] {
  const start = src.indexOf(`function ${fnName}(`)
  expect(start, `ไม่พบฟังก์ชัน ${fnName}`).toBeGreaterThan(-1)
  const end = src.indexOf('\nfunction ', start + 1)
  const body = src.slice(start, end === -1 ? undefined : end)

  const xs: number[] = []
  const ys: number[] = []

  // rect: x, y, width, height
  for (const m of body.matchAll(/x=\{(-?[\d.]+)\}\s*y=\{(-?[\d.]+)\}\s*width=\{(-?[\d.]+)\}\s*height=\{(-?[\d.]+)\}/g)) {
    const [x, y, w, h] = m.slice(1).map(Number)
    xs.push(x, x + w)
    ys.push(y, y + h)
  }
  // circle: cx, cy, r
  for (const m of body.matchAll(/cx=\{(-?[\d.]+)\}\s*cy=\{(-?[\d.]+)\}\s*r=\{(-?[\d.]+)\}/g)) {
    const [cx, cy, r] = m.slice(1).map(Number)
    xs.push(cx - r, cx + r)
    ys.push(cy - r, cy + r)
  }
  // path d="..." — เก็บทุกคู่พิกัดสัมบูรณ์ (ไม่รวมพารามิเตอร์ของ arc)
  for (const m of body.matchAll(/d=[`"]([^`"]+)[`"]/g)) {
    const d = m[1]
    for (const seg of d.matchAll(/([MLC])\s*((?:-?[\d.]+[\s,]+)*-?[\d.]+)/g)) {
      const nums = seg[2].trim().split(/[\s,]+/).map(Number)
      for (let i = 0; i + 1 < nums.length; i += 2) {
        xs.push(nums[i])
        ys.push(nums[i + 1])
      }
    }
    for (const seg of d.matchAll(/H\s*(-?[\d.]+)/g)) xs.push(Number(seg[1]))
    for (const seg of d.matchAll(/V\s*(-?[\d.]+)/g)) ys.push(Number(seg[1]))
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function declaredBox(name: string): number[] {
  const m = new RegExp(`${name}: \\{ Shape: \\w+, box: \\[([^\\]]+)\\]`).exec(src)
  expect(m, `ไม่พบกรอบที่ประกาศของ ${name}`).toBeTruthy()
  return m![1].split(',').map((n) => Number(n.trim()))
}

// ยกเว้นสองอันอย่างชัดเจน แทนที่จะทำให้เทสหลวมจนไม่จับอะไรเลย:
//   cloud — วาดด้วย arc (A) ซึ่งกรอบจริงไม่ได้อยู่ที่พิกัดคำสั่ง ต้องแก้สมการวงรี
//   logs  — พิกัดถูกคำนวณตอน render (template literal) จึงอ่านจาก source ไม่ได้
// ทั้งสองอันต้องตรวจด้วยตาเวลาแก้ และมีคอมเมนต์เตือนไว้ในไฟล์ต้นทางแล้ว
const CHECKED: [string, string][] = [
  ['terminal', 'Terminal'],
  ['shield', 'Shield'],
  ['probe', 'Probe'],
  ['layers', 'Layers'],
]

describe('ลายประจำคอร์ส', () => {
  it.each(CHECKED)('กรอบที่ประกาศของ %s ตรงกับพิกัดที่วาดจริง', (name, fn) => {
    const drawn = drawnBox(fn)
    const declared = declaredBox(name)
    // ยอมคลาดเคลื่อนได้เล็กน้อยเพราะความหนาเส้นไม่ได้นับ
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(drawn[i] - declared[i]), `${name} ด้านที่ ${i}: วาดจริง ${drawn[i]} แต่ประกาศ ${declared[i]}`).toBeLessThanOrEqual(2)
    }
  })

  it('ทุกลายถูกปรับให้พอดีกล่องเป้าหมายเดียวกัน', () => {
    expect(src).toContain('transform={fitTransform(box)}')
    const boxes = ['terminal', 'logs', 'shield', 'cloud', 'probe', 'layers'].map(declaredBox)
    for (const [minX, minY, maxX, maxY] of boxes) {
      expect(maxX - minX).toBeGreaterThan(0)
      expect(maxY - minY).toBeGreaterThan(0)
    }
  })
})
