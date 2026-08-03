import { test, expect } from '@playwright/test'
import { answersFor } from './support/capstone'
import { prepareNodeAccess } from './support/access'

// W1 (สไลซ์ปิดท้าย) — โจทย์จำลองผูกกับ attempt และค่าเป้าหมายสุ่มต่อครั้ง
//
// เกณฑ์รับงานที่แผน §5 W1 ระบุไว้ตรงๆ:
//   · ส่งสถานะที่ถูกของ **attempt อื่น** → ไม่ผ่าน (พารามิเตอร์คนละชุด)
//   · ใช้ `attempt_id` ของ **ผู้ใช้คนอื่น** → ถูกปฏิเสธ
//     (เทส ownership/replay/expiry ระดับ DB อยู่ใน attempt-db.test.ts แล้ว ไม่ทำซ้ำ)
//
// สิ่งที่การสุ่มพิสูจน์: ผู้เรียนต้องอ่านโจทย์ของตัวเองแล้วคิดเอง — คำตอบแชร์กันไม่ได้
// สิ่งที่มัน **ไม่** พิสูจน์: ว่าเขาลงมือทำจริง (แผนยอมรับข้อจำกัดนี้ไว้)

const COURSE = 'content-formats-demo'
const CAPSTONE = 'formats-hands-on'

interface AttemptResponse {
  attemptId: string
  questions: { id: string; prompt: string; choices: Record<string, string> }[]
  simulations: { id: string; challenge: { brief: string } }[]
}

async function newAttempt(request: import('@playwright/test').APIRequestContext): Promise<AttemptResponse> {
  const res = await request.post('/api/attempts', { data: { slug: COURSE, nodeId: CAPSTONE } })
  expect(res.ok(), 'ขอ attempt ไม่สำเร็จ').toBeTruthy()
  return res.json()
}

/** ค่าเป้าหมายของ attempt นี้ อ่านจาก brief ที่เซิร์ฟเวอร์ส่งมา (เหมือนที่ผู้เรียนอ่าน) */
function targetIpOf(attempt: AttemptResponse): string {
  const brief = attempt.simulations[0].challenge.brief
  const found = /192\.168\.10\.(\d+)/.exec(brief)
  expect(found, `brief ไม่มีค่าเป้าหมาย: ${brief}`).toBeTruthy()
  return found![0]
}

function stateFor(ip: string) {
  return {
    addressMode: 'static',
    ipv4: ip,
    subnet: '255.255.255.0',
    gateway: '192.168.10.1',
    applied: true,
  }
}

async function submit(
  request: import('@playwright/test').APIRequestContext,
  attempt: AttemptResponse,
  attemptId: string | undefined,
  ip: string,
) {
  const res = await request.post('/api/progress', {
    data: {
      slug: COURSE,
      nodeId: CAPSTONE,
      action: 'checkpoint',
      mode: 'learn',
      answers: answersFor(attempt),
      simulations: { 'sim-1': stateFor(ip) },
      attemptId,
    },
  })
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> }
}

test.describe('โจทย์จำลองผูกกับ attempt', () => {
  test.beforeEach(async () => {
    await prepareNodeAccess(COURSE, CAPSTONE)
  })

  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}&operationId=${crypto.randomUUID()}`)
  })

  test('attempt ออกโจทย์ที่มีค่าเป้าหมายจริง และไม่พากติกาการตรวจมาด้วย', async ({ request }) => {
    const attempt = await newAttempt(request)
    expect(attempt.simulations).toHaveLength(1)
    const brief = attempt.simulations[0].challenge.brief
    // ค่าถูกแทนแล้ว ไม่ใช่ข้อความดิบ
    expect(brief).not.toContain('{{')
    expect(brief).toMatch(/192\.168\.10\.\d+/)
    // กติกาการตรวจต้องไม่ติดมา
    const payload = JSON.stringify(attempt)
    expect(payload).not.toContain('"operator"')
    expect(payload).not.toContain('"field"')
  })

  test('ทำตามโจทย์ของ attempt ตัวเอง → ผ่าน', async ({ request }) => {
    const attempt = await newAttempt(request)
    const { body } = await submit(request, attempt, attempt.attemptId, targetIpOf(attempt))
    expect(body.passed).toBe(true)
  })

  test('🔴 ไม่ส่ง attemptId มาเลย → ถูกปฏิเสธ (ไม่ใช่ตรวจด้วยค่าจากไฟล์)', async ({ request }) => {
    const attempt = await newAttempt(request)
    const { status } = await submit(request, attempt, undefined, targetIpOf(attempt))
    expect(status).toBe(400)
  })

  // ⚠️ เทสที่ต้องออก attempt หลายตัว (ค่าของ attempt อื่น · ใช้ซ้ำ · ของคนอื่น ·
  // id มั่ว) อยู่ใน tests/integration/attempt-simulation.test.ts แทน — โควตา
  // 3 ครั้ง/30 นาที ต่อ (user, node) ทำให้ e2e ที่ใช้บัญชีเดียวชนกันเอง และการ
  // เปิดทางให้ reset คืนโควตาจะกลายเป็นช่องเลี่ยงโควตาในการใช้งานจริง
})
