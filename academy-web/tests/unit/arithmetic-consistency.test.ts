import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// ตัวเลขที่ได้จากการคำนวณต้องคำนวณกลับได้จากตัวเลขที่พิมพ์ไว้ข้าง ๆ เสมอ
// ผูกไว้กับชุด test เพื่อให้ทุกการแก้เนื้อหาโดนตรวจ ไม่ใช่รอให้ใครนึกได้ว่าต้องรันเกต
// เหตุผลที่มี: ลานตรวจอิสระจับได้สามจุดที่ตัวเลขไม่ reconcile กันเอง ทั้งสามมาจาก
// การพิมพ์ตัวเลขที่คำนวณในหัวแทนที่จะใช้ scripts/calc.mjs
describe('ความสอดคล้องเชิงเลขคณิตของเนื้อหาคอร์ส', () => {
  it('ทุกอัตราส่วน/เปอร์เซ็นต์/อัตราเร็ว คำนวณกลับได้จากตัวเลขที่พิมพ์ไว้', () => {
    const script = join(process.cwd(), 'tests/factcheck/arithmetic-consistency.mjs')
    let out = ''
    let failed = false
    try {
      out = execFileSync('node', [script], { encoding: 'utf8' })
    } catch (e: unknown) {
      const err = e as { stdout?: string }
      out = err.stdout ?? ''
      failed = true
    }
    expect(out, 'เกตต้องรันได้').toContain('ตรวจบล็อกโค้ด')
    expect(failed, `พบตัวเลขที่คำนวณกลับไม่ได้:\n${out}`).toBe(false)
  })
})
