import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// เดินเส้นทางผู้เรียนจริงตั้งแต่ต้น: เรียน → ตอบคำถามกลางวิดีโอ → ผ่าน checkpoint
// → พิสูจน์ข้ามบท (test out) → ข้ามบทพร้อมสรุป → กลับมาดูแผนที่ที่สถานะเปลี่ยนจริง
//
// ทดสอบพฤติกรรมที่ founder ขอโดยตรง: pop quiz บนวิดีโอ, กันกรอข้าม, node สถานะ
// ต่างๆ บนแผนที่, capstone ที่ข้ามไม่ได้ และ spider chart ที่ขยับตามของจริง

const COURSE = '/courses/basic-os-linux'
const ARTIFACT_DIR = join(__dirname, '..', '..', 'artifacts', 'oneshot-2026-07-31', 'course')

test.describe('learner journey through a course', () => {
  test('video pop quiz fires at its cue and blocks seeking past an unanswered question', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/os-what-it-does`)
    await expect(page.getByTestId('interactive-video')).toBeVisible()
    await expect(page.getByTestId('video-cue-progress')).toContainText('0/3')

    // พยายามกรอข้ามคำถามแรก (cue อยู่ที่ 15s) ไปที่ 120s
    await page.evaluate(() => {
      const el = document.querySelector<HTMLVideoElement>('[data-testid="lesson-video"]')!
      el.currentTime = 120
    })

    // ต้องถูกดึงกลับมาที่คำถาม ไม่ใช่ปล่อยให้ข้ามไป
    await expect(page.getByTestId('video-quiz')).toBeVisible({ timeout: 15_000 })
    const clampedTime = await page.evaluate(
      () => document.querySelector<HTMLVideoElement>('[data-testid="lesson-video"]')!.currentTime,
    )
    expect(clampedTime).toBeLessThan(20)

    // ตอบผิดก็ต้องไปต่อได้ (หลัก user override) แต่ต้องเห็นคำอธิบายก่อน
    await page.getByTestId('video-quiz').locator('input[type="radio"]').first().check()
    await page.getByTestId('video-quiz-submit').click()
    await expect(page.getByTestId('video-quiz-explanation')).toBeVisible()
    await page.getByTestId('video-quiz-continue').click()
    await expect(page.getByTestId('video-quiz')).toBeHidden()
    await expect(page.getByTestId('video-cue-progress')).toContainText('1/3')
  })

  test('full route: learn → test out → skip, and the map + radar reflect all three', async ({ page }) => {
    test.setTimeout(180_000)

    // 1) บทแรก: เรียนจบผ่าน checkpoint
    await page.goto(`${COURSE}/lessons/os-what-it-does`)
    for (const q of ['cp-1', 'cp-2', 'cp-3']) {
      await expect(page.getByTestId(`checkpoint-q-${q}`)).toBeVisible()
    }
    // ตอบให้ถูกทุกข้อ (เฉลย: B / A,B,C,D / B)
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    for (const letter of ['A', 'B', 'C', 'D']) {
      await page.getByTestId('checkpoint-q-cp-2').locator(`input[value="${letter}"]`).check()
    }
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-score')).toContainText('3/3')
    await page.getByTestId('checkpoint-continue').click()
    await expect(page.getByTestId('lesson-status')).toContainText('Done')
    await expect(page.getByTestId('cheatsheet')).toBeVisible()

    // 2) บทที่สอง: พิสูจน์ว่ารู้แล้ว (test out) → ต้องได้สถานะ Proven
    await page.goto(`${COURSE}/lessons/linux-and-distros`)
    await page.getByTestId('test-out').click()
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="C"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="A"]').check()
    await page.getByTestId('checkpoint-submit').click()
    await page.getByTestId('checkpoint-continue').click()
    await expect(page.getByTestId('lesson-status')).toContainText('Proven')

    // 3) บทที่สาม: ข้ามพร้อมรับสรุป
    await page.goto(`${COURSE}/lessons/get-a-linux`)
    await page.getByTestId('skip-lesson').click()
    await expect(page.getByTestId('lesson-status')).toContainText('Skipped')
    await expect(page.getByTestId('cheatsheet')).toBeVisible()

    // 4) แผนที่ต้องสะท้อนทั้งสามสถานะ และปลดล็อกบทถัดไป
    await page.goto(COURSE)
    await expect(page.getByTestId('node-os-what-it-does')).toHaveAttribute('data-status', 'completed')
    await expect(page.getByTestId('node-linux-and-distros')).toHaveAttribute('data-status', 'tested-out')
    await expect(page.getByTestId('node-get-a-linux')).toHaveAttribute('data-status', 'skipped')
    await expect(page.getByTestId('node-filesystem-tree')).toHaveAttribute('data-status', 'available')
    // บทที่ยังไม่ถึงต้องยังล็อกอยู่
    await expect(page.getByTestId('node-permissions')).toHaveAttribute('data-status', 'locked')

    // การข้ามไม่นับเป็น "พิสูจน์แล้ว" — 2 จาก 10
    await expect(page.getByTestId('course-summary')).toContainText('2/10 proven')
    await expect(page.getByTestId('course-summary')).toContainText('1 skipped')

    // radar ต้องมีข้อมูลแล้ว (ไม่ใช่สถานะว่างเปล่า)
    await expect(page.getByTestId('course-radar')).not.toContainText('Nothing recorded yet')

    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'course-roadmap-in-progress-desktop-1440.png'),
      fullPage: true,
      animations: 'disabled',
    })

    // 5) dashboard ต้องเห็นความคืบหน้าและปุ่มเรียนต่อ
    await page.goto('/dashboard')
    await expect(page.getByTestId('resume-card')).toBeVisible()
    await expect(page.getByTestId('course-progress-basic-os-linux')).toContainText('20% proven')
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'dashboard-in-progress-desktop-1440.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('a capstone cannot be skipped and demands every answer', async ({ page }) => {
    // ปลดล็อกทางไปถึง capstone ด้วยการข้ามบทก่อนหน้าทั้งหมด (สิทธิ์ของผู้เรียน)
    await page.goto(COURSE)
    for (const nodeId of [
      'os-what-it-does',
      'linux-and-distros',
      'get-a-linux',
      'filesystem-tree',
      'navigate-and-look',
      'files-and-safety',
      'users-and-root',
    ]) {
      await page.goto(`${COURSE}/lessons/${nodeId}`)
      await page.getByTestId('skip-lesson').click()
      await expect(page.getByTestId('lesson-status')).toContainText('Skipped')
    }

    await page.goto(`${COURSE}/lessons/permissions`)
    // ด่านบังคับ: ไม่มีปุ่มข้าม และไม่มีทางลัด
    await expect(page.getByTestId('skip-lesson')).toHaveCount(0)
    await expect(page.getByTestId('test-out')).toHaveCount(0)
    await expect(page.getByTestId('checkpoint')).toContainText('Required checkpoint')

    // ตอบผิดหนึ่งข้อ → ต้องไม่ผ่าน
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-4').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-5').locator('input[value="A"]').check()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-not-passed')).toBeVisible()
    await expect(page.getByTestId('checkpoint-continue')).toHaveCount(0)

    // แก้ให้ถูกครบแล้วจึงผ่าน
    await page.getByTestId('checkpoint-retry').click()
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="A"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-4').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-5').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-score')).toContainText('5/5')
    await page.getByTestId('checkpoint-continue').click()
    await expect(page.getByTestId('lesson-status')).toContainText('Done')
  })

  test('Thai lesson renders in Thai and untranslated lessons say so', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/os-what-it-does?lang=th`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ระบบปฏิบัติการทำอะไรกันแน่')

    await page.goto(`${COURSE}/lessons/filesystem-tree?lang=th`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The filesystem is one tree')
    await expect(page.getByText('not translated into')).toBeVisible()
  })
})
