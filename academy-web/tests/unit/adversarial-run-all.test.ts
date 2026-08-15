import { describe, expect, it } from 'vitest'

import { composeVerdict, runSequentially } from '../../scripts/adversarial/run-all.mjs'

/**
 * `node scripts/adversarial/*.mjs` รันตัวแรกเท่านั้นทั้งที่คนสั่งคิดว่ารันครบ —
 * run-all ต้องรันทุกตัว เรียงลำดับ และตัดสินจากตัวที่ร้ายที่สุด
 */
describe('runner ของสคริปต์ adversarial', () => {
  it('ตัดสินจากรหัสที่ร้ายที่สุด: 1 (มีทางรอด) ชนะ 2 (รันไม่ได้) ชนะผ่าน', () => {
    expect(composeVerdict([0, 0, 0])).toBe(0)
    expect(composeVerdict([0, 2, 0])).toBe(2)
    expect(composeVerdict([0, 2, 1])).toBe(1)
    expect(composeVerdict([1, 2, 1])).toBe(1)
    // รหัสอื่นที่ไม่ใช่ 0/1/2 (เช่น signal kill) ต้องถือว่าพิสูจน์ไม่ได้ ไม่ใช่ผ่าน
    expect(composeVerdict([0, 137])).toBe(2)
  })

  it('รันครบทุกตัวตามลำดับที่ให้ แม้ตัวก่อนหน้าจะไม่ผ่าน', async () => {
    const order: string[] = []
    const results = await runSequentially(['a.mjs', 'b.mjs', 'c.mjs'], async (script) => {
      order.push(script)
      return script === 'b.mjs' ? 1 : 0
    })
    expect(order).toEqual(['a.mjs', 'b.mjs', 'c.mjs'])
    expect(results).toEqual([
      { name: 'a.mjs', code: 0 },
      { name: 'b.mjs', code: 1 },
      { name: 'c.mjs', code: 0 },
    ])
  })
})
