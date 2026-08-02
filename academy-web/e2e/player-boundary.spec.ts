import { test, expect } from '@playwright/test'

// `/player` — INTERNAL ONLY (CAS-005 fixture)
//
// เครื่องข้อสอบใน `/player` ยังตรวจคำตอบฝั่ง client (`src/lib/player/scoring.ts`)
// และรับเฉลยไปทั้งชุด ซึ่งเป็นพื้นผิวที่สี่ของ F1 · แผน 2026-08-02 §5 W0-1 **ล็อกว่า
// ไม่แก้ในเฟสนี้** เพราะไม่ได้เปิดให้ผู้เรียนทั่วไป — แต่การยกเว้นจะปลอดภัยก็ต่อเมื่อ
// "ไม่เปิดให้คนนอก" เป็นสิ่งที่มีเทสเฝ้าอยู่จริง ไม่ใช่ข้อตกลงที่จำกันเอาเอง
//
// วันใดที่เส้นทางนี้เปิดสาธารณะ เทสนี้จะแดงก่อน — และนั่นคือสัญญาณว่าต้องย้ายการตรวจ
// ไปฝั่งเซิร์ฟเวอร์ก่อนเปิด

const INTERNAL_ROUTES = ['/player', '/player/module/cas005-module-1', '/player/exam/cas005-full-practice-02']

test.describe('/player เข้าไม่ได้จากภายนอก', () => {
  for (const route of INTERNAL_ROUTES) {
    test(`${route}: ผู้ไม่ล็อกอินถูกกันออก และไม่ได้เนื้อหาข้อสอบติดมือไป`, async ({ playwright, baseURL }) => {
      const anon = await playwright.request.newContext({
        baseURL: baseURL!,
        storageState: { cookies: [], origins: [] },
        // ไม่ตาม redirect — ต้องเห็นคำตอบชั้นแรกของเซิร์ฟเวอร์ตรงๆ
        extraHTTPHeaders: {},
      })
      const res = await anon.get(route, { maxRedirects: 0 })

      // middleware ต้องเด้งไปหน้าเข้าสู่ระบบ ไม่ใช่เสิร์ฟหน้าให้
      expect([302, 307, 308], `${route} ตอบ ${res.status()} แทนที่จะเด้งไป sign-in`).toContain(res.status())
      expect(res.headers()['location'] ?? '').toContain('/sign-in')

      // และต้องไม่มีเนื้อหาข้อสอบติดมากับ response ที่ปฏิเสธ
      const body = await res.text().catch(() => '')
      expect(body).not.toContain('"correct"')

      await anon.dispose()
    })
  }
})
