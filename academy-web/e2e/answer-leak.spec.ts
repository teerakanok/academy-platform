import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
  priorNodeIds: string[]
  explanations: string[]
  operators: string[]
  hints: string[]
}

function lessonsWithSecrets(): LessonFixture[] {
  const out: LessonFixture[] = []
  for (const slug of readdirSync(contentRoot)) {
    const structure = JSON.parse(readFileSync(join(contentRoot, slug, 'course.json'), 'utf8')) as {
      nodes: { id: string }[]
    }
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
        priorNodeIds: structure.nodes.slice(0, structure.nodes.findIndex((node) => node.id === lesson.nodeId)).map((node) => node.id),
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

function serviceDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('E2E ต้องมี local Supabase env ตาม .env.example')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
}

let cachedLearnerId: string | null = null
async function prepareLessonAccess(fixture: LessonFixture): Promise<void> {
  const db = serviceDb()
  if (!cachedLearnerId) {
    const email = readFileSync(join(__dirname, '..', 'test-results', '.auth', 'learner-email.txt'), 'utf8').trim()
    const account = await db.from('users').select('id').eq('email', email).single()
    if (account.error || !account.data) throw new Error('ไม่พบบัญชี E2E learner')
    cachedLearnerId = account.data.id as string
  }

  const cleared = await db.from('node_progress').delete().eq('user_id', cachedLearnerId).eq('course_slug', fixture.slug)
  if (cleared.error) throw new Error('ล้าง prerequisite fixture ไม่สำเร็จ')
  if (fixture.priorNodeIds.length === 0) return
  const inserted = await db.from('node_progress').insert(
    fixture.priorNodeIds.map((nodeId) => ({
      user_id: cachedLearnerId,
      course_slug: fixture.slug,
      node_id: nodeId,
      status: 'skipped',
    })),
  )
  if (inserted.error) throw new Error('เตรียม prerequisite fixture ไม่สำเร็จ')
}

// ⚠️ spec ทั้งชุดใช้บัญชีเดียวกัน (auth.setup) — การเปิดหน้าบทเรียนยิง action 'open'
// ซึ่งทำให้บทนั้นกลายเป็น in-progress · เทสนี้เปิด **ทุกบทรวมบทที่ควรล็อก** จึงต้อง
// คืนสภาพเมื่อจบ ไม่งั้น spec ที่ยืนยันสถานะ 'locked' จะตกด้วยเหตุผลที่ไม่เกี่ยวกัน
test.afterAll(async ({ playwright, baseURL }, testInfo) => {
  const api = await playwright.request.newContext({
    baseURL: baseURL!,
    storageState: testInfo.project.use.storageState as string,
    extraHTTPHeaders: { origin: baseURL! },
  })
  for (const slug of new Set(fixtures.map((f) => f.slug))) {
    await api.post(`/api/progress/reset?slug=${encodeURIComponent(slug)}&operationId=${crypto.randomUUID()}`)
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
      await prepareLessonAccess(fixture)
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

test.describe('ด่านวัดผล — ชุด key จริงของตัวเลือกต้องไม่ติดไปกับหน้า', () => {
  // รูที่ข้อนี้ปิด (RIL cross-model รอบ 2 เดินเคสให้ดูตรงๆ):
  // หน้า capstone เคยส่ง `lesson.checkpoint` ที่มี `choices` ชุด **key จริง** มาด้วย
  // แม้ UI จะแสดงชุดที่ remap แล้วจาก attempt · คนที่ผ่านแล้วบอกเพื่อนว่า "B, C, B"
  // เพื่อนเทียบข้อความระหว่างหน้ากับ `/api/attempts` แล้วแปลงเป็น key ของ attempt
  // ตัวเองได้ทันที → ผ่านโดยไม่ต้องรู้เนื้อหาเลย และ remap ก็ไม่เหลือความหมาย
  //
  // ยิงหน้าแบบไม่รัน JS (request.get) เพื่อดูเฉพาะสิ่งที่เซิร์ฟเวอร์ส่งมากับหน้า —
  // ถ้าใช้ page.goto ข้อความของตัวเลือกจะมาจาก /api/attempts ซึ่งถูกต้องแล้วที่จะมี
  const CAPSTONES = [
    { slug: 'content-formats-demo', node: 'formats-hands-on' },
    { slug: 'basic-os-linux', node: 'permissions' },
    { slug: 'basic-os-linux', node: 'pipes-and-logs' },
  ]

  for (const { slug, node } of CAPSTONES) {
    test(`${slug}/${node}: ข้อความตัวเลือกไม่อยู่ใน payload ของหน้า`, async ({ request }) => {
      const res = await request.get(`/courses/${slug}/lessons/${node}`)
      expect(res.ok()).toBeTruthy()
      const html = await res.text()

      const lesson = JSON.parse(
        readFileSync(join(contentRoot, slug, 'locales', 'en', 'lessons', `${node}.json`), 'utf8'),
      ) as { checkpoint: { kind?: string; id: string; choices?: Record<string, string> }[] }

      // ตรวจ **การจับคู่ key จริง → ข้อความ** ไม่ใช่ตัวข้อความลอยๆ
      //
      // ข้อความของตัวเลือกบางอันปรากฏในเนื้อบทเรียนเองได้ตามธรรมชาติ (เช่นคำสั่ง
      // `sort | uniq -c` ที่สอนอยู่ในบท) — สิ่งที่เป็นอันตรายคือคู่ `"B":"ข้อความ"`
      // ซึ่งบอกว่า key ไหนคือข้อความไหน · payload ของ Next escape เป็น \"B\":\"...\"
      let checked = 0
      for (const item of lesson.checkpoint) {
        if (item.kind === 'simulation' || !item.choices) continue
        for (const [key, text] of Object.entries(item.choices)) {
          const pair = `\\"${key}\\":\\"${text}\\"`
          expect(html, `การจับคู่ key จริงของ ${item.id} ติดมากับหน้า`).not.toContain(pair)
          checked += 1
        }
      }
      // กันเทสกลวง: ถ้าไฟล์ไม่มีตัวเลือกให้ตรวจเลย แปลว่าเทสนี้ไม่ได้พิสูจน์อะไร
      expect(checked, 'ไม่มีตัวเลือกให้ตรวจ — fixture เปลี่ยนไปแล้ว').toBeGreaterThan(3)
    })
  }
})
