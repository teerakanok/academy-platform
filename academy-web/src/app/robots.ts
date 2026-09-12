import type { MetadataRoute } from 'next'
import { absoluteUrl, searchIndexingEnabled } from '@/lib/seo'

// ต้องอ่าน NEXT_PUBLIC_SEARCH_INDEXING ตอน request ไม่ใช่ตอน build — เหมือน
// sitemap.ts ที่ใช้ force-dynamic อยู่แล้ว. ถ้าปล่อยให้ prerender ตอน build
// (สภาพแวดล้อม build ยังไม่เปิดสวิตช์) /robots.txt จะถูกแช่แข็งเป็น `Disallow: /`
// ตลอดอายุเวอร์ชันนั้น ขณะที่ /sitemap.xml ประกาศ URL เต็มรูปแบบจาก env runtime —
// ขัดกันเองและปิดช่องทาง AI SEO ที่ founder เลือกไว้. เจอจริงบน production
// 2026-09-12 (worker 73cc26e6 จาก source 73ac223): robots เสิร์ฟสาขาปิด
// ทั้งที่ deployed var = on.
export const dynamic = 'force-dynamic'

// AI SEO เป็นหนึ่งในช่องทางที่ founder เลือก (2026-08-01) จึงอนุญาต crawler ของ
// ผู้ช่วย AI ให้อ่านหน้าร้านได้เหมือน search engine ปกติ — ถ้าอยากให้ผู้ช่วย AI
// แนะนำเรา มันต้องอ่านเราได้ก่อน
//
// ⚠️ ชื่อ user-agent ของ crawler เหล่านี้เปลี่ยนบ่อยและเพิ่มรายใหม่เรื่อยๆ —
// ต้อง verify สดจากเอกสารของแต่ละเจ้า ณ วันเปิด index ห้ามเชื่อรายการนี้ว่าครบ
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']

// ต้องมี account ถึงใช้ได้ → ไม่มีเหตุผลให้ crawler เข้า และกัน index หน้าเปล่าที่
// crawler เห็น (มันไม่ได้ login) ซึ่งเป็นสัญญาณคุณภาพที่แย่กับทั้งเว็บ
const PRIVATE_PATHS = ['/api/', '/player', '/dashboard', '/courses/*/lessons/']

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) {
    // ก่อน launch: ปิดหมด — หน้าที่ยังไม่พร้อมแล้วถูก index ไว้ ลบย้อนหลังยากกว่าที่คิด
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: PRIVATE_PATHS })),
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
