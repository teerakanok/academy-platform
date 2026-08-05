import openNextHandler from './.open-next/worker.js'
import { servePrivateMedia, type MediaWorkerEnv } from './src/lib/media/worker-delivery'

// Worker entry ของหน้าร้าน Academy. งาน retention อยู่ใน Worker แยกเพื่อให้
// capability ลบข้อมูลไม่อยู่ร่วมกับ request handler ที่รับ traffic จากผู้เรียน.
// ส่งต่อ export ของ OpenNext ให้ครบ ไม่เช่นนั้น Durable Object/cache ที่มันประกาศจะหาย.
export * from './.open-next/worker.js'

export default {
  async fetch(request, env, ctx) {
    const media = await servePrivateMedia(request, env)
    return media ?? openNextHandler.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<MediaWorkerEnv>
