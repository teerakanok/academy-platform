import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// F1 — "เปิด view-source แล้วเห็นคำตอบ" คือช่องที่ไม่ต้องปลอมผลก็ผ่านได้
//
// เทสชุดนี้ยิงหน้าจริงที่ production build เสิร์ฟ แล้วอ่าน **ทุกอย่างที่ browser
// ได้รับ**: HTML + RSC payload + JS chunk ทุกก้อนที่หน้านั้นโหลด — ไม่ใช่แค่ HTML
// ชั้นแรก เพราะเนื้อหาที่ถูกส่งแบบ streamed จะไม่อยู่ใน HTML ก้อนแรกเสมอไป
//
// ⚠️ ตัวชี้วัดคือ `explanation` ไม่ใช่ค่าเฉลย — เฉลย MCQ คือตัวอักษรเดี่ยว "A"/"B"
// ซึ่งเป็น key ของ choices ที่ **ต้อง** อยู่ใน payload อยู่แล้ว assert ด้วยมันไม่ได้

const contentRoot = join(__dirname, '..', 'content', 'courses')

interface SimChallenge {
  requirements: { operator: string }[]
  hints?: string[]
}

interface LessonFixture {
  slug: string
  nodeId: string
  explanations: string[]
  operators: string[]
  hints: string[]
}

function lessonsWithSecrets(): LessonFixture[] {
  const out: LessonFixture[] = []
  for (const slug of readdirSync(contentRoot)) {
    const lessonsDir = join(contentRoot, slug, 'locales', 'en', 'lessons')
    for (const name of readdirSync(lessonsDir)) {
      const lesson = JSON.parse(readFileSync(join(lessonsDir, name), 'utf8')) as {
        nodeId: string
        // ด่านท้ายบทมีได้ทั้ง MCQ (ไม่มี `kind` ในไฟล์) และ simulation (W1)
        checkpoint: { kind?: string; explanation?: string; challenge?: SimChallenge }[]
        videoCueQuestions?: { explanation: string }[]
        blocks: { kind: string; challenge?: SimChallenge }[]
      }
      // โจทย์จำลองอยู่ได้ทั้งในบล็อกเนื้อหาและในด่านท้ายบท — ต้องตรวจทั้งสองที่
      const sims = [
        ...lesson.blocks.filter((b) => b.kind === 'simulation'),
        ...lesson.checkpoint.filter((c) => c.kind === 'simulation'),
      ]
      out.push({
        slug,
        nodeId: lesson.nodeId,
        explanations: [
          ...lesson.checkpoint.flatMap((q) => (q.explanation ? [q.explanation] : [])),
          ...(lesson.videoCueQuestions ?? []).map((q) => q.explanation),
        ],
        operators: sims.flatMap((b) => b.challenge?.requirements.map((r) => r.operator) ?? []),
        hints: sims.flatMap((b) => b.challenge?.hints ?? []),
      })
    }
  }
  return out
}

const fixtures = lessonsWithSecrets()

// ⚠️ spec ทั้งชุดใช้บัญชีเดียวกัน (auth.setup) — การเปิดหน้าบทเรียนยิง action 'open'
// ซึ่งทำให้บทนั้นกลายเป็น in-progress · เทสนี้เปิด **ทุกบทรวมบทที่ควรล็อก** จึงต้อง
// คืนสภาพเมื่อจบ ไม่งั้น spec ที่ยืนยันสถานะ 'locked' จะตกด้วยเหตุผลที่ไม่เกี่ยวกัน
test.afterAll(async ({ playwright, baseURL }, testInfo) => {
  const api = await playwright.request.newContext({
    baseURL: baseURL!,
    storageState: testInfo.project.use.storageState as string,
  })
  for (const slug of new Set(fixtures.map((f) => f.slug))) {
    await api.post(`/api/progress/reset?slug=${encodeURIComponent(slug)}`)
  }
  await api.dispose()
})

test.describe('เฉลยต้องไม่ออกไปถึง browser', () => {
  test('มีบทเรียนให้ตรวจจริง (กันเทสผ่านเพราะลูปว่าง)', () => {
    expect(fixtures.length).toBeGreaterThan(5)
    expect(fixtures.some((f) => f.explanations.length > 0)).toBe(true)
  })

  for (const fixture of fixtures) {
    test(`${fixture.slug}/${fixture.nodeId}: ไม่มี explanation ในสิ่งที่ browser ได้รับ`, async ({ page }) => {
      // เก็บทุก response ที่เป็นข้อความ — HTML, RSC flight, JS chunk
      const bodies: string[] = []
      page.on('response', async (res) => {
        const type = res.headers()['content-type'] ?? ''
        if (!/javascript|html|text\/x-component|text\/plain/.test(type)) return
        bodies.push(await res.text().catch(() => ''))
      })

      await page.goto(`/courses/${fixture.slug}/lessons/${fixture.nodeId}`)
      await expect(page.getByTestId('checkpoint')).toBeVisible()
      // รอให้ chunk ที่โหลดตามมาถึงครบก่อนตรวจ
      await page.waitForLoadState('networkidle')

      const received = bodies.join('\n')
      expect(received.length, 'ไม่ได้ response ที่เป็นข้อความเลย — เทสนี้จะเขียวปลอม').toBeGreaterThan(1000)

      for (const explanation of fixture.explanations) {
        expect(received, `explanation รั่วไปถึง browser: ${explanation.slice(0, 60)}…`).not.toContain(explanation)
      }
      for (const hint of fixture.hints) {
        expect(received, `hint รั่วไปถึง browser: ${hint.slice(0, 60)}…`).not.toContain(hint)
      }
      for (const operator of fixture.operators) {
        expect(received, 'กติกาการตรวจ (operator) รั่วไปถึง browser').not.toContain(`"operator":"${operator}"`)
      }
    })
  }
})
