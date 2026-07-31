import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// เก็บหลักฐานภาพของประสบการณ์คอร์ส — suite นี้ "เก็บภาพ" ไม่ใช่ "ตัดสินว่าสวย"
// การตัดสิน defect เป็นขั้น review ที่คนดูภาพจริง (บันทึกผลไว้นอก test)

const ARTIFACT_DIR = join(__dirname, '..', '..', 'artifacts', 'oneshot-2026-07-31', 'course')
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

async function shoot(page: Page, state: string, vp: string, fullPage = true) {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  await page.screenshot({ path: join(ARTIFACT_DIR, `${state}-${vp}.png`), fullPage, animations: 'disabled' })
}

for (const vp of VIEWPORTS) {
  test.describe(`course visuals ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`capture every course surface (${vp.name})`, async ({ page }) => {
      test.setTimeout(120_000)

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'landing-light', vp.name)

      await page.goto('/dashboard')
      await expect(page.getByTestId('course-card-basic-os-linux')).toBeVisible()
      await expect(page.getByTestId('global-radar')).toBeVisible()
      await shoot(page, 'dashboard', vp.name)

      await page.goto('/courses/basic-os-linux')
      await expect(page.getByTestId('roadmap-graph')).toBeVisible()
      await shoot(page, 'course-roadmap', vp.name)

      await page.goto('/courses/basic-os-linux/lessons/os-what-it-does')
      await expect(page.getByTestId('interactive-video')).toBeVisible()
      await shoot(page, 'lesson-with-video', vp.name)

      // คำถามกลางวิดีโอ — กระโดดไปหลัง cue แรก แล้วรอ overlay
      await page.evaluate(() => {
        const el = document.querySelector<HTMLVideoElement>('[data-testid="lesson-video"]')
        if (el) el.currentTime = 16
      })
      await expect(page.getByTestId('video-quiz')).toBeVisible({ timeout: 15_000 })
      await shoot(page, 'video-popquiz', vp.name, false)

      await page.goto('/courses/basic-os-linux/lessons/permissions')
      await expect(page.getByTestId('checkpoint')).toBeVisible()
      await shoot(page, 'capstone-lesson', vp.name)

      // dark theme บนหน้าแผนที่
      await page.goto('/courses/basic-os-linux')
      await page.getByTestId('theme-toggle').click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await shoot(page, 'course-roadmap-dark', vp.name)
    })
  })
}
