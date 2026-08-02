import openNextHandler from './.open-next/worker.js'

// Worker entry ของจริง — ห่อ handler ที่ OpenNext สร้าง แล้วเพิ่ม `scheduled`
//
// ทำไมต้องมีไฟล์นี้: Cloudflare เรียกงานตามเวลาผ่าน `scheduled()` ไม่ใช่ `fetch()`
// และ handler ที่ OpenNext สร้างมีแต่ `fetch` · การเพิ่ม endpoint ให้ cron ยิงแทน
// จะกลายเป็นพื้นผิวสาธารณะใหม่ที่ต้องเฝ้าเอง — ทางนี้ไม่เปิดอะไรเพิ่มเลย
//
// ⚠️ ทุก export ของ handler เดิมต้องถูกส่งต่อ ไม่งั้น Durable Object / cache
// ที่ OpenNext ประกาศไว้จะหายไปตอน deploy
export * from './.open-next/worker.js'

/** เก็บ attempt ที่หมดอายุไว้กี่วันก่อนกวาด — เหตุผลของค่านี้อยู่ใน migration 0011 */
const RETAIN_DAYS = 30
/** ลบทีละก้อน กัน DELETE ก้อนโตล็อกตารางนาน — วนจนกว่าจะไม่มีอะไรให้ลบ */
const BATCH = 5000
/** เพดานรอบต่อการทำงานหนึ่งครั้ง — งานที่เหลือรอรอบหน้า ดีกว่าค้างจนโดนตัด */
const MAX_ROUNDS = 20

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

/**
 * กวาด attempt ที่หมดอายุเกินระยะเก็บรักษา
 *
 * เรียก RPC ของฐานข้อมูลตรงๆ แทนการเรียกผ่าน route ของแอป เพราะงานนี้ไม่ควรมี
 * ทางเข้าจากภายนอกเลย · ตัวฟังก์ชันฝั่ง DB เป็นคนตัดสินว่าแถวไหนลบได้ (ไม่แตะของที่
 * ยังใช้ได้ ไม่แตะช่วงที่โควตายังนับอยู่ — ดู 0011) ที่นี่ทำแค่วนเรียกจนหมด
 */
async function purgeExpiredAttempts(env: Env): Promise<{ rounds: number; deleted: number }> {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // ไม่ตั้ง env = ยังไม่พร้อมทำงานนี้ · เงียบไม่ได้ ต้องเห็นใน log ว่าไม่ได้ทำ
    console.error('[cron/purge-attempts] ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return { rounds: 0, deleted: 0 }
  }

  let deleted = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const res = await fetch(`${url}/rest/v1/rpc/purge_expired_attempts`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        // สคีมาของ Academy ไม่ใช่ public — ต้องบอก PostgREST ทุกครั้ง
        'content-profile': 'academy',
        'accept-profile': 'academy',
      },
      body: JSON.stringify({ p_retain_days: RETAIN_DAYS, p_limit: BATCH }),
    })
    if (!res.ok) {
      console.error(`[cron/purge-attempts] เรียกไม่สำเร็จ (${res.status})`)
      return { rounds: round, deleted }
    }
    const removed = Number(await res.json())
    deleted += Number.isFinite(removed) ? removed : 0
    if (!removed) return { rounds: round, deleted }
  }
  // ยังไม่หมดใน MAX_ROUNDS — ไม่ใช่ error แต่ต้องรู้ว่ามีของค้างมากผิดปกติ
  console.warn(`[cron/purge-attempts] ยังกวาดไม่หมดใน ${MAX_ROUNDS} รอบ (ลบไปแล้ว ${deleted})`)
  return { rounds: MAX_ROUNDS, deleted }
}

export default {
  fetch: openNextHandler.fetch,

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // `waitUntil` เพื่อให้งานเดินจนจบแม้ handler คืนค่าไปแล้ว
    ctx.waitUntil(
      purgeExpiredAttempts(env).then(({ rounds, deleted }) => {
        console.log(`[cron/purge-attempts] ลบ ${deleted} แถว ใน ${rounds} รอบ`)
      }),
    )
  },
} satisfies ExportedHandler<Env>
