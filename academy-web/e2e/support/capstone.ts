import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type APIRequestContext } from '@playwright/test'

// ตัวช่วยสำหรับ capstone ของคอร์ส demo — ใช้ร่วมกันหลาย spec
//
// ตั้งแต่ W0-0b โจทย์ของ capstone **ทั้งชุด** มาจาก attempt ไม่ใช่จากไฟล์:
//   · MCQ ถูก remap key ต่อ attempt — ตัวอักษร "B" ของคนละ attempt คือคนละตัวเลือก
//   · ด่านจำลองมีค่าเป้าหมายที่สุ่มต่อ attempt
// เทสจึงเขียนคำตอบตายตัวไม่ได้อีก · วิธีที่ถูกคือทำอย่างที่ผู้เรียนทำ: อ่านโจทย์ของ
// attempt ตัวเอง แล้วเลือก "ตัวเลือกที่ถูก" จาก **ข้อความ** ซึ่งเทสรู้ได้จากไฟล์เนื้อหา

export const DEMO_COURSE = 'content-formats-demo'
export const DEMO_CAPSTONE = 'formats-hands-on'

interface AttemptQuestion {
  id: string
  prompt: string
  choices: Record<string, string>
}

interface AttemptResponse {
  attemptId: string
  questions: AttemptQuestion[]
  simulations: { id: string; challenge: { brief: string } }[]
}

/** เฉลยของ capstone คอร์ส demo ในรูป "ข้อความของตัวเลือกที่ถูก" */
function correctChoiceTexts(): Record<string, string[]> {
  return correctTextsOf(DEMO_COURSE, DEMO_CAPSTONE)
}

/** แปลงเฉลย (ข้อความ) เป็น key ฝั่ง client ของ attempt นี้ */
export function answersFor(attempt: { questions: AttemptQuestion[] }): Record<string, string[]> {
  const wanted = correctChoiceTexts()
  const answers: Record<string, string[]> = {}
  for (const question of attempt.questions) {
    const texts = wanted[question.id]
    expect(texts, `ไม่รู้เฉลยของข้อ ${question.id}`).toBeTruthy()
    answers[question.id] = texts.map((text) => {
      const key = Object.keys(question.choices).find((k) => question.choices[k] === text)
      expect(key, `ตัวเลือกของข้อ ${question.id} ไม่มีข้อความที่เป็นเฉลย`).toBeTruthy()
      return key!
    })
  }
  return answers
}

/** เลือกตัวเลือกที่ **ผิด** หนึ่งตัวต่อข้อ — ใช้พิสูจน์ว่าตอบผิดแล้วไม่ผ่านจริง */
export function wrongAnswersFor(attempt: { questions: AttemptQuestion[] }): Record<string, string[]> {
  const right = answersFor(attempt)
  const answers: Record<string, string[]> = {}
  for (const question of attempt.questions) {
    const wrong = Object.keys(question.choices).find((k) => !right[question.id].includes(k))
    expect(wrong, `ข้อ ${question.id} ไม่มีตัวเลือกผิดให้เลือก`).toBeTruthy()
    answers[question.id] = [wrong!]
  }
  return answers
}

/** ขอ attempt ของ capstone แล้วคืนทุกอย่างที่ต้องใช้ตอบให้ถูก */
export async function startCapstoneAttempt(request: APIRequestContext) {
  const res = await request.post('/api/attempts', {
    data: { slug: DEMO_COURSE, nodeId: DEMO_CAPSTONE },
  })
  expect(res.ok(), `ขอ attempt ไม่สำเร็จ (${res.status()}) — โควตาอาจเต็ม`).toBeTruthy()
  const attempt = (await res.json()) as AttemptResponse

  const brief = attempt.simulations[0]?.challenge.brief ?? ''
  const targetIp = /192\.168\.10\.\d+/.exec(brief)?.[0]
  expect(targetIp, `brief ไม่มีค่าเป้าหมาย: ${brief}`).toBeTruthy()

  return {
    attemptId: attempt.attemptId,
    questions: attempt.questions,
    targetIp: targetIp!,
    /** คำตอบ MCQ ที่ถูก ในรูป key ของ attempt นี้ */
    answers: answersFor(attempt),
    /** คำตอบ MCQ ที่ผิด (ข้อละหนึ่งตัว) */
    wrongAnswers: wrongAnswersFor(attempt),
    /** สถานะหน้าจอที่ถูกต้องสำหรับ attempt นี้ */
    correctState: {
      addressMode: 'static',
      ipv4: targetIp!,
      subnet: '255.255.255.0',
      gateway: '192.168.10.1',
      applied: true,
    },
  }
}

/** ทำ capstone ให้ผ่านจริงทั้งด่าน (MCQ + ด่านจำลองของ attempt ตัวเอง) */
export async function passCapstone(request: APIRequestContext) {
  const attempt = await startCapstoneAttempt(request)
  const res = await request.post('/api/progress', {
    data: {
      slug: DEMO_COURSE,
      nodeId: DEMO_CAPSTONE,
      action: 'checkpoint',
      mode: 'learn',
      answers: attempt.answers,
      simulations: { 'sim-1': attempt.correctState },
      attemptId: attempt.attemptId,
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { passed: boolean }
  expect(body.passed, 'ทำ capstone ถูกครบแล้วแต่ไม่ผ่าน').toBe(true)
  return body
}

/** เฉลยของ capstone ใดๆ ในรูป "ข้อความของตัวเลือกที่ถูก" (อ่านจากไฟล์เนื้อหา) */
export function correctTextsOf(course: string, node: string): Record<string, string[]> {
  const file = join(__dirname, '..', '..', 'content', 'courses', course, 'locales', 'en', 'lessons', `${node}.json`)
  const lesson = JSON.parse(readFileSync(file, 'utf8')) as {
    checkpoint: { kind?: string; id: string; choices?: Record<string, string>; correct?: string[] }[]
  }
  const texts: Record<string, string[]> = {}
  for (const item of lesson.checkpoint) {
    if (item.kind === 'simulation' || !item.choices || !item.correct) continue
    texts[item.id] = item.correct.map((key) => item.choices![key])
  }
  return texts
}

/**
 * ตอบ MCQ บนหน้าจอเหมือนผู้เรียนจริง — เลือกจาก **ข้อความ** ไม่ใช่ตัวอักษร
 *
 * ตัวอักษรของตัวเลือกถูก remap ต่อ attempt ตั้งแต่ W0-0b · เทสที่คลิก
 * `input[value="B"]` จึงไม่ได้แปลว่า "เลือกคำตอบที่ถูก" อีกต่อไป — และที่แย่กว่านั้น
 * มันจะเขียวเองประมาณ 1 ใน 4 ครั้งแบบสุ่ม ซึ่งอ่านไม่ออกว่าพังหรือโชคดี
 */
export async function answerOnPage(
  page: import('@playwright/test').Page,
  course: string,
  node: string,
  options: { wrongFor?: string[] } = {},
): Promise<void> {
  const wanted = correctTextsOf(course, node)
  for (const [questionId, texts] of Object.entries(wanted)) {
    const question = page.getByTestId(`checkpoint-q-${questionId}`)
    await expect(question).toBeVisible()
    const shouldBeWrong = options.wrongFor?.includes(questionId) ?? false
    if (shouldBeWrong) {
      // เลือกตัวที่ไม่ใช่เฉลยหนึ่งตัว — หาโดยเทียบข้อความเช่นกัน
      const labels = question.locator('label')
      const count = await labels.count()
      for (let i = 0; i < count; i++) {
        const label = labels.nth(i)
        const text = (await label.textContent()) ?? ''
        if (!texts.some((t) => text.includes(t))) {
          await label.locator('input').check()
          break
        }
      }
      continue
    }
    for (const text of texts) {
      await question.locator('label').filter({ hasText: text }).locator('input').check()
    }
  }
}
