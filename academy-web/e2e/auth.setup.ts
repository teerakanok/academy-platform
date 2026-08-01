import { test as setup, expect, request as playwrightRequest } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// สร้าง session ผู้เรียนหนึ่งคนไว้ให้ spec อื่นใช้ร่วมกัน
//
// จำเป็นตั้งแต่ M3 เพราะบทเรียน/quiz/lab/dashboard ต้องมีบัญชีแล้ว (มติ founder
// 2026-08-01) — spec ที่เปิดหน้าเหล่านี้โดยไม่ล็อกอินจะถูกเด้งไปหน้า sign-in
//
// ล็อกอินผ่าน API + อ่านรหัสจากกล่องจดหมายทดสอบของ local Supabase (mailpit)
// ไม่ใช่การ mock — เส้นทางเดียวกับผู้ใช้จริงทุกขั้น

const MAILPIT = 'http://127.0.0.1:54324'
export const STORAGE_STATE = join(__dirname, '..', 'test-results', '.auth', 'learner.json')

setup('เตรียมบัญชีผู้เรียนสำหรับ e2e', async ({ page, baseURL }) => {
  const email = `e2e-learner-${Date.now()}@example.com`

  const res = await page.request.post('/api/auth/otp', { data: { email } })
  expect(res.ok(), 'ขอรหัสเข้าสู่ระบบไม่สำเร็จ').toBeTruthy()

  // รอให้อีเมลถึงกล่องทดสอบ แล้วดึงรหัส 6 หลักจากฉบับล่าสุด
  const mail = await playwrightRequest.newContext({ baseURL: MAILPIT })
  let token = ''
  for (let attempt = 0; attempt < 15 && !token; attempt++) {
    await new Promise((r) => setTimeout(r, 400))
    const list = await mail.get('/api/v1/messages')
    if (!list.ok()) continue
    const body = (await list.json()) as { messages?: { ID: string; To?: { Address: string }[] }[] }
    const found = body.messages?.find((m) => m.To?.some((t) => t.Address === email))
    if (!found) continue
    const detail = await mail.get(`/api/v1/message/${found.ID}`)
    const message = (await detail.json()) as { Text?: string; HTML?: string }
    token = /\b(\d{6})\b/.exec(`${message.Text ?? ''}${message.HTML ?? ''}`)?.[1] ?? ''
  }
  await mail.dispose()
  expect(token, 'ไม่พบรหัส 6 หลักในอีเมลทดสอบ').toHaveLength(6)

  const verify = await page.request.post('/api/auth/verify', { data: { email, token } })
  expect(verify.ok(), 'ยืนยันรหัสไม่สำเร็จ').toBeTruthy()

  // ยืนยันว่า session ใช้ได้จริงก่อนบันทึก ไม่ใช่แค่ API ตอบ ok
  await page.goto(`${baseURL}/dashboard`)
  await expect(page.getByTestId('course-card-basic-os-linux')).toBeVisible()

  mkdirSync(join(__dirname, '..', 'test-results', '.auth'), { recursive: true })
  const state = await page.context().storageState()
  writeFileSync(STORAGE_STATE, JSON.stringify(state), 'utf8')
})
