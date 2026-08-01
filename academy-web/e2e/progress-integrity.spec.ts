import { test, expect } from '@playwright/test'

// ใบรับรองจะไม่มีความหมายเลย ถ้า client ประกาศเองได้ว่า "ผ่านแล้ว"
//
// เคยเป็นแบบนั้นจริง: POST /api/progress รับ status:'completed' มาตรงๆ ยิง 10 request
// ก็ได้ครบทั้งคอร์สโดยไม่ตอบคำถามสักข้อ (พิสูจน์แล้ว 10/10 ก่อนแก้)
// เทสชุดนี้คือด่านที่กันไม่ให้ย้อนกลับไปแบบนั้น

// ใช้บทของคอร์ส demo ที่ spec อื่นไม่แตะ — e2e ทั้งชุดใช้บัญชีเดียวกัน ถ้าไปใช้บท
// ที่ spec อื่นเรียนจบไปแล้ว การยืนยันว่า 'สถานะไม่ขยับ' จะตกด้วยเหตุผลที่ไม่เกี่ยวกัน
const COURSE = 'content-formats-demo'
const NODE = 'formats-references'

test.describe('ความสมบูรณ์ของหลักฐานการเรียน', () => {
  test('client ประกาศเองว่าผ่านไม่ได้', async ({ request }) => {
    for (const status of ['completed', 'tested-out']) {
      const res = await request.post('/api/progress', {
        data: { slug: COURSE, nodeId: NODE, status, checkpointResults: { 'cp-1': true } },
      })
      // schema ใหม่ไม่มี field `status` เลย จึงถูกปฏิเสธตั้งแต่ชั้น validation
      expect(res.status(), `ยังรับ status=${status} จาก client อยู่`).toBe(400)
    }
  })

  test('ส่งคำตอบผิดแล้วไม่ผ่าน และสถานะไม่ขยับ', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: NODE, action: 'checkpoint', mode: 'test-out', answers: { 'cp-1': ['A'], 'cp-2': ['B'] } },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.passed).toBe(false)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.testedOut).not.toContain(NODE)
    expect(after.record.completed).not.toContain(NODE)
  })

  test('node ที่ไม่มีอยู่จริงถูกปฏิเสธ ไม่สร้างแถวขยะ', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: 'ไม่มีบทนี้', action: 'open' },
    })
    expect(res.status()).toBe(404)
  })

  test('capstone ข้ามไม่ได้แม้จะยิง API ตรงๆ', async ({ request }) => {
    // กติกาของคอร์สต้องบังคับที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
    const res = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: 'formats-hands-on', action: 'skip' },
    })
    expect(res.status()).toBe(409)
  })

  test('ตอบถูกครบยังผ่านได้ตามปกติ', async ({ request }) => {
    // ปิดช่องโหว่แล้วต้องไม่ปิดทางคนที่ทำจริงด้วย
    const lesson = await request.get(`/courses/${COURSE}/lessons/${NODE}`)
    expect(lesson.ok()).toBeTruthy()

    const res = await request.post('/api/progress', {
      data: {
        slug: COURSE,
        nodeId: NODE,
        action: 'checkpoint',
        mode: 'learn',
        answers: { 'cp-1': ['B'], 'cp-2': ['A'] },
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // mode 'learn' บทปกติ: ตอบครบก็ผ่าน (ความถูกผิดใช้สอน ไม่ใช่ด่าน)
    expect(body.passed).toBe(true)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).toContain(NODE)
  })
})
