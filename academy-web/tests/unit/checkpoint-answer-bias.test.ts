import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// เฉลยต้องเดาไม่ได้จากตำแหน่งหรือความยาว
// เดิมเฉลยเป็นข้อ B 95.3% และเป็นตัวเลือกที่ยาวที่สุด 94.8% — ตอบ B ทุกข้อได้ 95%
// ผูกกับชุด test เพื่อให้ทุกการเพิ่ม/แก้คำถามโดนตรวจ ไม่ใช่รอให้ใครนึกได้
describe('อคติของเฉลย checkpoint', () => {
  it('ตำแหน่งเฉลยกระจาย และเฉลยไม่ใช่ตัวเลือกที่ยาวที่สุดเสมอ', () => {
    const script = join(process.cwd(), 'tests/factcheck/checkpoint-answer-bias.mjs')
    let out = ''
    let failed = false
    try {
      out = execFileSync('node', [script], { encoding: 'utf8' })
    } catch (e: unknown) {
      out = (e as { stdout?: string }).stdout ?? ''
      failed = true
    }
    expect(out, 'เกตต้องรันได้').toContain('การกระจายตำแหน่งเฉลย')
    expect(failed, `เฉลยเดาได้:\n${out}`).toBe(false)
  })
})
