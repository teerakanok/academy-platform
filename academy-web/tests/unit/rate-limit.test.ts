import { beforeEach, describe, expect, it } from 'vitest'
import { allowRequest, resetRateLimiter, RATE_LIMIT } from '@/lib/rate-limit'

describe('rate limiter (sliding window, injectable clock)', () => {
  beforeEach(() => resetRateLimiter())

  it('อนุญาตจนถึงเพดานใน window เดียว แล้วปฏิเสธคำขอถัดไป', () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT.MAX_REQUESTS_PER_WINDOW; i++) {
      expect(allowRequest('1.2.3.4', t0 + i)).toBe(true)
    }
    expect(allowRequest('1.2.3.4', t0 + 500)).toBe(false)
  })

  it('window เลื่อนแล้วคำขอเก่าหมดอายุ — กลับมาอนุญาตได้', () => {
    const t0 = 2_000_000
    for (let i = 0; i < RATE_LIMIT.MAX_REQUESTS_PER_WINDOW; i++) {
      expect(allowRequest('5.6.7.8', t0 + i)).toBe(true)
    }
    expect(allowRequest('5.6.7.8', t0 + 100)).toBe(false)
    expect(allowRequest('5.6.7.8', t0 + RATE_LIMIT.WINDOW_MS + 1)).toBe(true)
  })

  it('นับแยกต่อ key — key อื่นไม่โดนหางเลข', () => {
    const t0 = 3_000_000
    for (let i = 0; i < RATE_LIMIT.MAX_REQUESTS_PER_WINDOW; i++) {
      allowRequest('9.9.9.9', t0 + i)
    }
    expect(allowRequest('9.9.9.9', t0 + 200)).toBe(false)
    expect(allowRequest('10.10.10.10', t0 + 200)).toBe(true)
  })
})
