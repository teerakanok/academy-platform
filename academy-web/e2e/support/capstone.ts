import { expect, type APIRequestContext } from '@playwright/test'

// ตัวช่วยสำหรับ capstone ของคอร์ส demo — ใช้ร่วมกันหลาย spec
//
// ตั้งแต่ W1 ด่านจำลองของ capstone มีค่าเป้าหมาย **สุ่มต่อ attempt** จึงเขียนค่า
// ตายตัวลงในเทสไม่ได้อีก · ทุก spec ที่ต้องทำ capstone ให้ผ่านต้องขอ attempt ก่อน
// แล้วอ่านค่าจาก brief เหมือนที่ผู้เรียนอ่าน

export const DEMO_COURSE = 'content-formats-demo'
export const DEMO_CAPSTONE = 'formats-hands-on'
/** เฉลย MCQ ของ capstone — ส่วนค่าของด่านจำลองมาจาก attempt */
export const CAPSTONE_MCQ = { 'cp-1': ['B'], 'cp-2': ['C'], 'cp-3': ['B'] }

interface AttemptResponse {
  attemptId: string
  simulations: { id: string; challenge: { brief: string } }[]
}

/** ขอ attempt ของ capstone แล้วคืน id พร้อมค่าเป้าหมายที่ต้องตั้ง */
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
    targetIp: targetIp!,
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
      answers: CAPSTONE_MCQ,
      simulations: { 'sim-1': attempt.correctState },
      attemptId: attempt.attemptId,
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { passed: boolean }
  expect(body.passed, 'ทำ capstone ถูกครบแล้วแต่ไม่ผ่าน').toBe(true)
  return body
}
