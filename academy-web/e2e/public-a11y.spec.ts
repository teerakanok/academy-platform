import { expect, test, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility baseline ของ public surface — สแกนหกพื้นผิวสาธารณะด้วย axe-core
// ภายใต้ default public suite (`npm run test:e2e:public`) ซึ่งรัน offline ทั้งหมด
// และทำงานในทั้งสอง project: public-chromium (desktop 1280x900) และ public-mobile
// (Pixel 5) — รวม 6 surface x 2 viewport = 12 สแกนต่อการรัน
//
// ใช้แพทเทิร์นเดียวกับ e2e/player.spec.ts (expectNoSeriousViolations) — ห้ามอ่อน
// threshold: ถ้าหน้าไหนมี violation ระดับ critical/serious จริง ให้เก็บรายการ
// (impact:rule → selector + helpUrl) ไว้เป็น backlog จาก red run ไม่ใช่ปิด assertion

type PublicSurface = {
  name: string
  path: string
  ready: (page: Page) => Promise<void>
}

async function h1Visible(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

const PUBLIC_SURFACES: readonly PublicSurface[] = [
  { name: 'home', path: '/', ready: h1Visible },
  { name: 'course catalog', path: '/courses', ready: h1Visible },
  // legacy slug ของคอร์สสาธารณะ — 308 ไป canonical `/en` ตอนผู้เยี่ยมยังไม่มีค่ากำหนดภาษา
  {
    name: 'course detail',
    path: '/courses/basic-os-linux',
    ready: async (page) => {
      await expect(page.getByTestId('public-course-syllabus')).toBeVisible()
    },
  },
  { name: 'privacy notice', path: '/privacy', ready: h1Visible },
  { name: 'sign-in', path: '/sign-in', ready: h1Visible },
  { name: 'unsubscribe', path: '/unsubscribe', ready: h1Visible },
]

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo) {
  // ตัด transition/animation ก่อน sample สี — กัน color-contrast flake ตอนอยู่กลาง transition
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  if (serious.length > 0) {
    // ทำให้ red run เป็น backlog ที่ทำงานได้ทันที: ทุก node + helpUrl ของทุก rule
    const backlog = serious.flatMap((violation) => [
      `${violation.impact}:${violation.id} — ${violation.help} (${violation.helpUrl})`,
      ...violation.nodes.map(
        (node) => `  → ${node.target.join(' ')}${node.html ? ` :: ${node.html.slice(0, 120)}` : ''}`,
      ),
    ])
    const report = backlog.join('\n')
    console.error(`[axe] critical/serious violations:\n${report}`)
    await testInfo.attach('axe-serious-violations', {
      body: report,
      contentType: 'text/plain',
    })
  }

  expect(
    serious.map((v) => `${v.impact}:${v.id} → ${v.nodes[0]?.target}`),
    'axe ต้องไม่มี violation ระดับ critical/serious',
  ).toEqual([])
}

test.describe('public surface accessibility baseline', () => {
  for (const surface of PUBLIC_SURFACES) {
    test(`axe: ${surface.name} (${surface.path}) ไม่มี critical/serious violation`, async (
      { page },
      testInfo,
    ) => {
      const response = await page.goto(surface.path)
      expect(response?.status(), `HTTP status ของ ${surface.path}`).toBeLessThan(400)
      await surface.ready(page)
      await expectNoSeriousViolations(page, testInfo)
    })
  }
})
