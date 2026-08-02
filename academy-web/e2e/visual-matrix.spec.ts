import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Visual state matrix (แผน §4-M2-9):
// {landing, module list, quiz กลางชุด, PBQ ทั้ง 3 kind, results, review} × {1440, 390}
// PBQ-010 มีครบทั้ง checks/select/order ในตัวเดียว + PBQ-009 สำหรับ exhibit
//
// ⚠️ ขอบเขตของ suite นี้ = "เก็บหลักฐานภาพให้ครบทุก state" เท่านั้น —
// ผลเขียวไม่ใช่คำรับรองว่าไม่มี visual defect; การตัดสิน defect เป็นขั้น
// review ภาพโดยคน/agent แยกต่างหาก (บันทึกผลใน completed_log/handoff)

// ⚠️ ทุก state ในเมทริกซ์นี้ (ยกเว้น landing) อยู่บน `/player` ซึ่งเป็นพื้นผิว
// **ภายใน** ที่ปิดโดยค่าตั้งต้นตั้งแต่ W0-1 (internal-surface.ts) — รันด้วย
// `INTERNAL_SURFACES=on npm run test:e2e` เมื่อต้องการเก็บหลักฐานภาพชุดนี้ใหม่
test.skip(
  process.env.INTERNAL_SURFACES?.trim() !== 'on',
  'พื้นผิวภายในปิดอยู่ — รันด้วย INTERNAL_SURFACES=on เพื่อเก็บภาพ /player',
)

const ARTIFACT_DIR = join(__dirname, '..', '..', 'artifacts', 'oneshot-2026-07-31', 'm2')
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

async function shoot(
  page: Page,
  state: string,
  viewport: (typeof VIEWPORTS)[number],
  options: { fullPage?: boolean } = {},
) {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  await page.screenshot({
    path: join(ARTIFACT_DIR, `${state}-${viewport.name}.png`),
    fullPage: options.fullPage ?? true,
    // กันภาพค้างกลาง CSS transition (เคยทำ nav highlight ดูสลับ state)
    animations: 'disabled',
  })
}

async function gotoPbq(page: Page, pbqId: string) {
  for (let n = 86; n <= 90; n++) {
    await page.getByTestId(`nav-q-${n}`).click()
    const container = page.locator('[data-testid^="pbq-PBQ-"]').first()
    const id = (await container.getAttribute('data-testid'))!.replace('pbq-', '')
    if (id === pbqId) return
  }
  throw new Error(`ไม่พบ ${pbqId} ใน nav ท้าย`)
}

for (const viewport of VIEWPORTS) {
  test.describe(`visual matrix ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test(`ทุก state ถูกเก็บภาพ (${viewport.name})`, async ({ page }) => {
      test.setTimeout(120_000)

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'landing', viewport)

      await page.goto('/player')
      await expect(page.getByTestId('exam-link-cas005-full-practice-02')).toBeVisible()
      await shoot(page, 'module-list', viewport)

      // quiz กลางชุด: exam running MCQ + ตอบไปหนึ่งข้อให้ nav มี state
      await page.goto('/player/exam/cas005-full-practice-02')
      await page.getByTestId('start-exam-button').click()
      await page.locator('[data-testid^="mcq-"] input').first().check()
      await page.getByTestId('nav-q-2').click()
      await shoot(page, 'quiz-mid', viewport)

      // PBQ ครบ 3 kind (PBQ-010) + exhibit (PBQ-009)
      await gotoPbq(page, 'PBQ-010')
      await shoot(page, 'pbq-all-kinds', viewport)
      await gotoPbq(page, 'PBQ-009')
      await expect(page.getByTestId('pbq-exhibit-PBQ-009')).toBeVisible()
      await shoot(page, 'pbq-exhibit', viewport)

      // results + review (ส่งแบบตอบบางส่วน — state จริง)
      await page.getByTestId('submit-exam-button').click()
      await expect(page.getByTestId('results-screen')).toBeVisible()
      await shoot(page, 'results', viewport)

      await page.getByTestId('review-wrong-button').click()
      await expect(page.getByTestId('review-screen')).toBeVisible()
      // review หลัง partial submit ยาวมาก (ข้อผิดเกือบทั้งชุด) → เก็บเฉพาะ viewport
      await shoot(page, 'review', viewport, { fullPage: false })
    })
  })
}
