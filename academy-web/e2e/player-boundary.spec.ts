import { test, expect } from '@playwright/test'

// `/player` — INTERNAL ONLY (CAS-005 fixture)
//
// เครื่องข้อสอบใน `/player` ยังตรวจคำตอบฝั่ง client (`src/lib/player/scoring.ts`)
// และรับเฉลยไปทั้งชุด ซึ่งเป็นพื้นผิวที่สี่ของ F1 · แผน 2026-08-02 §5 W0-1 **ล็อกว่า
// ไม่แก้ในเฟสนี้** เพราะไม่ได้เปิดให้ผู้เรียนทั่วไป — แต่การยกเว้นจะปลอดภัยก็ต่อเมื่อ
// "ไม่เปิดให้คนนอก" ถูกบังคับด้วยโค้ดจริง
//
// 🔴 เทสรุ่นแรกของไฟล์นี้ตรวจแค่ **ผู้ไม่ล็อกอิน** จึงเขียวทั้งที่รูเปิดอยู่:
// middleware ปล่อยผู้ล็อกอินทุกคนผ่าน และมีลิงก์จากเมนู/dashboard ด้วย แปลว่า
// ผู้เรียนที่สมัครฟรี (D1 เปิดสมัครเสรี) เปิดคลังข้อสอบพร้อมเฉลยได้ทันที
// RIL cross-model จับข้อนี้ — ตอนนี้จึงวัดจาก **บัญชีผู้เรียนจริง** เป็นหลัก

// เทสชุดนี้ยืนยัน "สถานะปิด" ซึ่งเป็นค่าตั้งต้น — เมื่อรันด้วย INTERNAL_SURFACES=on
// (โหมดทำงานภายใน) จึงข้ามไป ไม่งั้นจะแดงด้วยเหตุผลที่ตรงข้ามกับสิ่งที่ต้องการวัด
test.skip(
  process.env.INTERNAL_SURFACES?.trim() === 'on',
  'กำลังรันในโหมดภายใน — เทสนี้ยืนยันสถานะปิดซึ่งเป็นค่าตั้งต้นของ production',
)

const INTERNAL_ROUTES = ['/player', '/player/module/cas005-module-1', '/player/exam/cas005-full-practice-02']

test.describe('/player ปิดสำหรับทุกคนที่ไม่ใช่ภายใน', () => {
  for (const route of INTERNAL_ROUTES) {
    test(`${route}: ผู้เรียนที่ล็อกอินแล้วก็เข้าไม่ได้`, async ({ page }) => {
      const res = await page.goto(route)
      expect(res?.status(), `${route} ตอบ ${res?.status()} ให้ผู้เรียนที่ล็อกอินแล้ว`).toBe(404)
      // และต้องไม่มีเนื้อหาข้อสอบติดมากับ response ที่ปฏิเสธ
      expect(await page.content()).not.toContain('"correct"')
    })

    test(`${route}: ผู้ไม่ล็อกอินก็เข้าไม่ได้`, async ({ playwright, baseURL }) => {
      const anon = await playwright.request.newContext({
        baseURL: baseURL!,
        storageState: { cookies: [], origins: [] },
      })
      const res = await anon.get(route, { maxRedirects: 0 })
      expect(res.status()).toBe(404)
      expect(await res.text().catch(() => '')).not.toContain('"correct"')
      await anon.dispose()
    })
  }

  test('ไม่มีลิงก์ไปคลังข้อสอบภายในบนหน้าที่ผู้เรียนเห็น', async ({ page }) => {
    // ซ่อนลิงก์ไม่ใช่การควบคุมสิทธิ์ (ตัวกันจริงคือ middleware) แต่ลิงก์ที่ยังอยู่
    // แปลว่าเรากำลังชวนผู้เรียนไปชนกำแพง — และเคยเป็นทางที่พาเขาเข้าไปได้จริง
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: 'Open practice' })).toHaveCount(0)
    await expect(page.locator('a[href="/player"]')).toHaveCount(0)
  })
})
