import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// หน้า prerender (static/SSG) ต้องมีที่เก็บถึงจะเสิร์ฟได้ตอน production
//
// เจอตอน deploy จริงครั้งแรก: /courses, /sitemap.xml, /sign-in ตอบ 404 ทั้งที่
// build สำเร็จ และใน `wrangler dev --local` ใช้ได้ปกติ — local มีตัวสำรองอ่านจาก
// ดิสก์ให้ ส่วน production ไม่มี จึงเป็นความต่างที่ทดสอบในเครื่องอย่างเดียวไม่เจอ
//
// เลือก staticAssetsIncrementalCache เพราะ:
//   · เนื้อหาคอร์สเปลี่ยนตอน deploy เท่านั้น ไม่ต้อง revalidate ระหว่างทาง
//   · ไม่ต้องเพิ่ม binding หรือ bucket ใดๆ = ไม่มี infra ใหม่ให้ดูแล
// ถ้าวันหน้าต้องอัปเดตเนื้อหาโดยไม่ deploy (เช่น ดึงจาก Crucible แบบสด) ให้ย้ายไป
// r2IncrementalCache ซึ่งต้องมี R2 bucket + binding WORKER_SELF_REFERENCE
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
})
