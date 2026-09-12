import { beforeEach, describe, expect, it } from 'vitest'
import * as robotsModule from '@/app/robots'

const robots = (robotsModule as unknown as { default: () => Record<string, unknown> }).default

// Regression guard ของ production incident 2026-09-12: /robots.txt ถูก prerender
// ตอน build โดย env ยังไม่เปิดสวิตช์ จนเสิร์ฟ `Disallow: /` ตลอดเวอร์ชัน ขณะที่
// sitemap (force-dynamic) ประกาศ URL จาก env runtime — สองไฟล์ตัดสินต่างกัน.
// robots ต้อง dynamic เหมือน sitemap เพื่อให้ค่าตอน deploy ของ
// NEXT_PUBLIC_SEARCH_INDEXING เป็นตัวตัดสินจริง.
describe('robots launch switch', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SEARCH_INDEXING
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('renders at request time so the deploy-time switch decides, like sitemap', () => {
    expect((robotsModule as { dynamic?: string }).dynamic).toBe('force-dynamic')
  })

  it('fails closed with a total block before the launch switch is on', () => {
    expect(robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] })
  })

  it('opens the storefront and the founder-chosen AI crawler channel when the switch is on', () => {
    process.env.NEXT_PUBLIC_SEARCH_INDEXING = 'on'
    const result = robots()

    const rules = result.rules as Array<Record<string, unknown>>
    const everyone = rules.find((rule) => rule.userAgent === '*')
    expect(everyone?.allow).toBe('/')
    expect(everyone?.disallow).toContain('/courses/*/lessons/')

    // มติ founder 2026-08-01: AI crawler อ่านหน้าร้านได้ — กลุ่มเฉพาะต้องอนุญาต
    for (const crawler of ['GPTBot', 'ClaudeBot', 'Google-Extended']) {
      const group = rules.find((rule) => rule.userAgent === crawler)
      expect(group?.allow, `${crawler} must be allowed`).toBe('/')
    }

    expect(result.sitemap).toBe('https://academy.cyberskills.co.th/sitemap.xml')
  })
})
