import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M2 fast suite — hub/module nav/practice/resume/a11y (แผน §4-M2-5/-6/-8)
//
// ⚠️ `/player` เป็นพื้นผิว **ภายใน** ที่ปิดโดยค่าตั้งต้น (W0-1 · internal-surface.ts)
// เทสชุดนี้จึงทำงานเฉพาะเมื่อเปิด flag: `INTERNAL_SURFACES=on npm run test:e2e`
// — ไม่ลบทิ้งเพราะ fixture ยังใช้งานภายในจริง แต่จะไม่บังคับให้เซิร์ฟเวอร์เปิด
// พื้นผิวนี้ทุกครั้งที่รัน acceptance ซึ่งจะขัดกับนโยบาย fail-closed ที่เพิ่งตั้ง
test.skip(
  process.env.INTERNAL_SURFACES?.trim() !== 'on',
  'พื้นผิวภายในปิดอยู่ — รันด้วย INTERNAL_SURFACES=on เพื่อทดสอบ /player',
)

const MODULE_SLUG = 'module-1-governance-risk-compliance'

async function expectNoSeriousViolations(page: Page) {
  // ตัด transition/animation ก่อน sample สี — กัน color-contrast flake ตอนอยู่กลาง transition
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  expect(
    serious.map((v) => `${v.impact}:${v.id} → ${v.nodes[0]?.target}`),
    'axe ต้องไม่มี violation ระดับ critical/serious',
  ).toEqual([])
}

test.describe('player hub + module nav', () => {
  test('hub แสดง module + full-length พร้อม metadata และ axe ผ่าน', async ({ page }) => {
    await page.goto('/player')
    await expect(page.getByTestId(`module-link-${MODULE_SLUG}`)).toContainText('150 ข้อ')
    await expect(page.getByTestId('exam-link-cas005-full-practice-02')).toContainText('85 MCQ + 5 PBQ')
    await expectNoSeriousViolations(page)
  })

  test('module nav ใช้ได้จริง: hub → module → ฝึก → ตอบ → เห็น explanation → progress อัปเดต → กลับ hub เห็น progress', async ({ page }) => {
    await page.goto('/player')
    await page.getByTestId(`module-link-${MODULE_SLUG}`).click()
    await page.getByTestId('start-practice-button').click()

    // ตอบข้อแรก (เลือกตัวเลือกแรก — ถูกหรือผิดไม่สำคัญกับ flow นี้)
    const card = page.locator('[data-testid^="mcq-M1-"]').first()
    await expect(card).toBeVisible()
    const mcqId = (await card.getAttribute('data-testid'))!.replace('mcq-', '')
    await card.locator('input').first().check()
    await page.getByTestId('check-answer-button').click()
    await expect(page.getByTestId(`mcq-explanation-${mcqId}`)).toBeVisible()
    await expect(page.getByTestId('answered-count')).toHaveText('1')

    // ข้อถัดไป → explanation หาย, ตัวนับยังอยู่
    await page.getByTestId('practice-next').click()
    await expect(page.locator('[data-testid^="mcq-explanation-"]')).toHaveCount(0)

    // กลับ hub → เห็น progress ของ module
    await page.goto('/player')
    await expect(page.getByTestId(`module-progress-${MODULE_SLUG}`)).toContainText('ตอบแล้ว 1')
  })

  test('practice retake = เริ่มรอบใหม่ (ตัวนับกลับศูนย์) และ attempt เดิมไม่ถูกทับ', async ({ page }) => {
    await page.goto(`/player/module/${MODULE_SLUG}`)
    await page.getByTestId('start-practice-button').click()
    await page.locator('[data-testid^="mcq-M1-"] input').first().check()
    await expect(page.getByTestId('answered-count')).toHaveText('1')

    await page.getByTestId('practice-retake-button').click()
    await expect(page.getByTestId('answered-count')).toHaveText('0')

    const attempts = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.includes(`module:${'module-1-governance-risk-compliance'}`)),
    )
    expect(attempts.length).toBe(2)
  })

  test('practice a11y: axe ผ่านระหว่างฝึก (โจทย์ + เฉลย)', async ({ page }) => {
    await page.goto(`/player/module/${MODULE_SLUG}`)
    await page.getByTestId('start-practice-button').click()
    await page.locator('[data-testid^="mcq-M1-"] input').first().check()
    await page.getByTestId('check-answer-button').click()
    await expect(page.locator('[data-testid^="mcq-explanation-"]')).toBeVisible()
    await expectNoSeriousViolations(page)
  })
})

test.describe('exam resume + timer', () => {
  test('ตอบไปบางส่วน → reload → คำตอบ + attempt เดิมกลับมา (deadline-based)', async ({ page }) => {
    await page.goto('/player/exam/cas005-full-practice-02')
    await page.getByTestId('start-exam-button').click()
    await expect(page.getByTestId('exam-timer')).toBeVisible()

    // ตอบ 2 ข้อแรก
    for (const n of [1, 2]) {
      await page.getByTestId(`nav-q-${n}`).click()
      await page.locator('[data-testid^="mcq-"] input').first().check()
    }

    const endsAtBefore = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('cas005-full-practice-02'))!
      return (JSON.parse(window.localStorage.getItem(key)!) as { endsAt: number }).endsAt
    })

    await page.reload()
    // resume: ไม่ต้องกดเริ่มใหม่ — เข้าโหมด running ทันที
    await expect(page.getByTestId('exam-timer')).toBeVisible()
    await expect(page.getByTestId('nav-q-1')).toHaveClass(/bg-cs-accent/)

    const endsAtAfter = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('cas005-full-practice-02'))!
      return (JSON.parse(window.localStorage.getItem(key)!) as { endsAt: number }).endsAt
    })
    expect(endsAtAfter).toBe(endsAtBefore) // deadline คงเดิม — เวลาไม่ reset

    const answered = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('cas005-full-practice-02'))!
      const rec = JSON.parse(window.localStorage.getItem(key)!) as { answers: { mcq: Record<string, string[]> } }
      return Object.values(rec.answers.mcq).filter((a) => a?.length).length
    })
    expect(answered).toBe(2)
  })

  test('attempt หมดเวลาระหว่างปิดหน้า → reload แล้ว finalize เป็น submitted + แสดงผลทันที', async ({ page }) => {
    await page.goto('/player/exam/cas005-full-practice-02')
    await page.getByTestId('start-exam-button').click()
    await page.locator('[data-testid^="mcq-"] input').first().check()

    // จำลองเวลาหมดระหว่างปิดหน้า: เขียน endsAt ให้เป็นอดีตตรงๆ ใน storage
    await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('cas005-full-practice-02'))!
      const rec = JSON.parse(window.localStorage.getItem(key)!) as { endsAt: number }
      rec.endsAt = Date.now() - 60_000
      window.localStorage.setItem(key, JSON.stringify(rec))
    })
    await page.reload()

    await expect(page.getByTestId('results-screen')).toBeVisible()
    const status = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('cas005-full-practice-02'))!
      return (JSON.parse(window.localStorage.getItem(key)!) as { status: string }).status
    })
    expect(status).toBe('submitted')
  })

  test('exam running + results: axe ผ่าน และ PBQ-009 exhibit render', async ({ page }) => {
    // เทสนี้รัน axe 3 รอบบนหน้าที่มีปุ่มนำทาง 90 ปุ่ม ใช้เวลาราว 25 วินาทีเมื่อ
    // เครื่องว่าง และเกิน 30 วินาทีเมื่อรันต่อท้ายเทสอื่น — ตั้งเพดานตามความจริง
    // ดีกว่าปล่อยให้เป็นเทสที่แดงสลับเขียวโดยไม่มีอะไรพังจริง
    test.setTimeout(90_000)
    await page.goto('/player/exam/cas005-full-practice-02')
    await page.getByTestId('start-exam-button').click()
    await expectNoSeriousViolations(page)

    // ไป PBQ-009 (อยู่ในห้า nav ท้าย) — หา nav ที่แสดง PBQ-009
    for (let i = 86; i <= 90; i++) {
      await page.getByTestId(`nav-q-${i}`).click()
      const pbq = page.locator('[data-testid^="pbq-PBQ-"]').first()
      const id = (await pbq.getAttribute('data-testid'))!.replace('pbq-', '')
      if (id === 'PBQ-009') break
    }
    await expect(page.getByTestId('pbq-exhibit-PBQ-009')).toBeVisible()
    await expectNoSeriousViolations(page)

    // ส่งเลย (ตอบไม่ครบ = ผิดตาม spec) → results + review ต้องทำงาน + axe ผ่าน
    await page.getByTestId('submit-exam-button').click()
    await expect(page.getByTestId('results-screen')).toBeVisible()
    await expect(page.getByTestId('score-units')).toContainText('/106')
    await expectNoSeriousViolations(page)

    await page.getByTestId('review-wrong-button').click()
    await expect(page.getByTestId('review-screen')).toBeVisible()
    await expectNoSeriousViolations(page)
  })
})
