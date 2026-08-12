import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { resetRateLimiter } from '@/lib/rate-limit'

// DB-fail honesty: เรียก route handler จริง โดยชี้ Academy data API ไป port ที่ปิดอยู่
// (inject connection fail ตามแผน §4-M1 step 9) — insert ล้มจริงต้องตอบ fail จริง
// ห้าม success ปลอม (บทเรียน Server Action masked errors)

const ORIGINAL_ENV = { ...process.env }

function leadRequest(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1:3000/api/leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'x-forwarded-for': `10.99.0.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify(body),
  })
}

describe('lead intake — DB-fail honesty', () => {
  beforeEach(() => {
    resetRateLimiter()
    process.env.ACADEMY_DATA_API_URL = 'http://127.0.0.1:1'
    process.env.ACADEMY_DATA_API_JWT_SECRET = 'academy-runtime-test-secret-at-least-32-bytes'
  })

  afterEach(() => {
    process.env.ACADEMY_DATA_API_URL = ORIGINAL_ENV.ACADEMY_DATA_API_URL
    process.env.ACADEMY_DATA_API_JWT_SECRET = ORIGINAL_ENV.ACADEMY_DATA_API_JWT_SECRET
  })

  it('DB ต่อไม่ได้ → ตอบ 5xx พร้อม ok:false — ไม่ใช่ success ปลอม', async () => {
    const { POST } = await import('@/app/(site)/api/leads/route')
    const res = await POST(leadRequest({ email: 'honest-fail@example.com', consent: true }))
    expect(res.status).toBeGreaterThanOrEqual(500)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    // sanitized: ห้ามรั่ว internal (connection string / stack / host)
    expect(body.error ?? '').not.toMatch(/127\.0\.0\.1|ECONNREFUSED|fetch failed|stack/i)
  })

  it('env DB ไม่ถูกตั้งค่า → ตอบ 500 ok:false ไม่ใช่ success ปลอม', async () => {
    delete process.env.ACADEMY_DATA_API_URL
    delete process.env.ACADEMY_DATA_API_JWT_SECRET
    const { POST } = await import('@/app/(site)/api/leads/route')
    const res = await POST(leadRequest({ email: 'no-env@example.com', consent: true }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })
})
