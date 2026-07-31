import { describe, expect, it } from 'vitest'
import { shuffled } from '@/lib/player/shuffle'

describe('seedable shuffle', () => {
  const items = Array.from({ length: 20 }, (_, i) => i)

  it('seed เดียวกัน → ลำดับเดียวกัน (deterministic)', () => {
    expect(shuffled(items, 42)).toEqual(shuffled(items, 42))
  })

  it('seed ต่าง → ลำดับต่าง (โอกาสชนต่ำมาก)', () => {
    expect(shuffled(items, 1)).not.toEqual(shuffled(items, 2))
  })

  it('permutation ครบ — ไม่หายไม่เพิ่ม และไม่แก้ array เดิม', () => {
    const original = [...items]
    const out = shuffled(items, 7)
    expect(items).toEqual(original)
    expect([...out].sort((a, b) => a - b)).toEqual(original)
  })
})
