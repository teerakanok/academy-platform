import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// @full-acceptance — ทำ full-length-02 จบจริงผ่าน UI ทั้งชุด (แผน §4-M2-8)
// ตอบถูกทุกหน่วยยกเว้น MCQ 1 ข้อ (เจตนา) → คะแนน deterministic 105/106 = 99.1%
// PBQ ทุก kind (checks/select/order) ถูก grade จริง — ห้ามมี banner ในเส้นทางนี้

interface FixtureMcq {
  id: string
  moduleId: string
  moduleTitle: string
  type: 'single' | 'multi'
  choices: Record<string, string>
  correct: string[]
}
interface FixtureField {
  id: string
  kind: 'checks' | 'select' | 'order'
  options?: string[]
  correct: string | string[]
}
interface FixturePbq {
  id: string
  fields: FixtureField[]
}
interface FixtureFl {
  normalQuestions: FixtureMcq[]
  pbqs: FixturePbq[]
}

const fl = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'fixtures', 'cas005', 'full-length', 'cas005-full-practice-02.json'),
    'utf8',
  ),
) as FixtureFl

const mcqById = new Map(fl.normalQuestions.map((q) => [q.id, q]))
const pbqById = new Map(fl.pbqs.map((p) => [p.id, p]))
// ข้อที่ตั้งใจตอบผิด — deterministic
const WRONG_MCQ_ID = fl.normalQuestions[0].id

async function answerMcq(page: Page, q: FixtureMcq) {
  const card = page.getByTestId(`mcq-${q.id}`)
  if (q.id === WRONG_MCQ_ID) {
    const wrongLetter = Object.keys(q.choices).find((l) => !q.correct.includes(l))!
    await card.locator(`input[value="${wrongLetter}"]`).check()
    return
  }
  for (const letter of q.correct) {
    await card.locator(`input[value="${letter}"]`).check()
  }
}

async function answerPbq(page: Page, p: FixturePbq) {
  // เส้นทางนี้ห้ามมี banner "ยังไม่รองรับ"
  await expect(page.locator(`[data-testid^="pbq-field-unsupported-${p.id}"]`)).toHaveCount(0)
  for (const field of p.fields) {
    const container = page.getByTestId(`pbq-field-${p.id}-${field.id}`)
    if (field.kind === 'checks') {
      for (const option of field.correct as string[]) {
        await container.getByRole('checkbox', { name: option, exact: true }).check()
      }
    } else if (field.kind === 'select') {
      await container.locator('select').selectOption(field.correct as string)
    } else {
      // order: selection sort ด้วยปุ่ม ↑ (keyboard-accessible ตาม requirement)
      const target = field.correct as string[]
      const sim = [...(field.options ?? [])]
      if (sim.join('|') === target.join('|')) {
        // initial ตรงเฉลยพอดี → ขยับไป-กลับหนึ่งครั้งเพื่อบันทึกคำตอบ
        await container.getByRole('button', { name: `เลื่อน "${sim[0]}" ลง` }).click()
        await container.getByRole('button', { name: `เลื่อน "${sim[0]}" ขึ้น` }).click()
        continue
      }
      for (let t = 0; t < target.length; t++) {
        let i = sim.indexOf(target[t])
        while (i > t) {
          await container.getByRole('button', { name: `เลื่อน "${target[t]}" ขึ้น` }).click()
          ;[sim[i - 1], sim[i]] = [sim[i], sim[i - 1]]
          i--
        }
      }
    }
  }
}

test.describe('full-length-02 ทั้งชุดผ่าน UI @full-acceptance', () => {
  test('ทำครบ 85 MCQ + 5 PBQ → 105/106 = 99.1% + breakdown + review ถูกต้อง', async ({ page }) => {
    test.setTimeout(360_000)
    await page.goto('/player/exam/cas005-full-practice-02')
    await page.getByTestId('start-exam-button').click()
    await expect(page.getByTestId('exam-timer')).toBeVisible()

    let exhibitSeen = false
    for (let n = 1; n <= 90; n++) {
      await page.getByTestId(`nav-q-${n}`).click()
      const container = page.locator('[data-testid^="mcq-"], [data-testid^="pbq-PBQ-"]').first()
      const testId = (await container.getAttribute('data-testid'))!
      if (testId.startsWith('mcq-')) {
        const q = mcqById.get(testId.replace('mcq-', ''))!
        await answerMcq(page, q)
      } else {
        const p = pbqById.get(testId.replace('pbq-', ''))!
        if (p.id === 'PBQ-009') {
          // exhibit ต้อง render จริง (assertion เฉพาะตามแผน §4-M2-8)
          await expect(page.getByTestId('pbq-exhibit-PBQ-009')).toBeVisible()
          exhibitSeen = true
        }
        await answerPbq(page, p)
      }
    }
    expect(exhibitSeen).toBe(true)

    await page.getByTestId('submit-exam-button').click()
    await expect(page.getByTestId('results-screen')).toBeVisible()
    await expect(page.getByTestId('score-units')).toContainText('105/106')
    await expect(page.getByTestId('score-percent')).toHaveText('99.1%')

    // module ของข้อที่ตอบผิดต้องเป็น weakest (module อื่น 100%)
    const wrongModule = mcqById.get(WRONG_MCQ_ID)!
    await expect(page.getByTestId('weakest-domain')).toContainText(wrongModule.moduleTitle)
    // PBQ group เต็ม 21/21
    await expect(page.getByTestId('group-pbq')).toContainText('21/21')

    // review: มีข้อผิด 1 ข้อ = ข้อที่ตั้งใจตอบผิด พร้อมเฉลย
    await page.getByTestId('review-wrong-button').click()
    await expect(page.getByTestId('review-screen')).toBeVisible()
    await expect(page.getByTestId(`mcq-${WRONG_MCQ_ID}`)).toBeVisible()
    await expect(page.getByTestId(`mcq-explanation-${WRONG_MCQ_ID}`)).toBeVisible()

    // retake → attempt ใหม่ (intro กลับมา) และ attempt เก่าไม่หาย
    await page.getByTestId('review-screen').getByRole('button', { name: '← กลับหน้าผลคะแนน' }).click()
    await page.getByTestId('retake-button').click()
    await expect(page.getByTestId('start-exam-button')).toBeVisible()
    const stored = await page.evaluate(
      () => Object.keys(window.localStorage).filter((k) => k.includes('cas005-full-practice-02')).length,
    )
    expect(stored).toBe(1) // attempt ที่ submit แล้วยังอยู่
  })
})
