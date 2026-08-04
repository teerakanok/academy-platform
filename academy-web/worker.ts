import openNextHandler from './.open-next/worker.js'
import { servePrivateMedia, type MediaWorkerEnv } from './src/lib/media/worker-delivery'

// Worker entry ของจริง — ห่อ handler ที่ OpenNext สร้าง แล้วเพิ่ม `scheduled`
//
// ทำไมต้องมีไฟล์นี้: Cloudflare เรียกงานตามเวลาผ่าน `scheduled()` ไม่ใช่ `fetch()`
// และ handler ที่ OpenNext สร้างมีแต่ `fetch` · การเพิ่ม endpoint ให้ cron ยิงแทน
// จะกลายเป็นพื้นผิวสาธารณะใหม่ที่ต้องเฝ้าเอง — ทางนี้ไม่เปิดอะไรเพิ่มเลย
//
// ⚠️ ทุก export ของ handler เดิมต้องถูกส่งต่อ ไม่งั้น Durable Object / cache
// ที่ OpenNext ประกาศไว้จะหายไปตอน deploy
export * from './.open-next/worker.js'

/** ลบทีละก้อน กัน DELETE ก้อนโตล็อกตารางนาน — วนจนกว่าจะไม่มีอะไรให้ลบ */
const DEFAULT_BATCH = 5000
/** เพดานรอบต่อการทำงานหนึ่งครั้ง — งานที่เหลือรอรอบหน้า ดีกว่าค้างจนโดนตัด */
const MAX_ROUNDS = 20

interface Env extends MediaWorkerEnv {
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
type PurgeJob = {
  name: string
  rpc: string
  args: Record<string, number>
}

const RETENTION_JOBS: PurgeJob[] = [
  { name: 'attempts', rpc: 'purge_expired_attempts', args: { p_retain_days: 90, p_limit: DEFAULT_BATCH } },
  { name: 'waitlist', rpc: 'purge_expired_leads', args: { p_retain_years: 3, p_limit: DEFAULT_BATCH } },
  { name: 'accounts', rpc: 'purge_inactive_users', args: { p_inactive_years: 2, p_limit: 500 } },
  { name: 'privacy-requests', rpc: 'purge_expired_privacy_requests', args: { p_retain_years: 3, p_limit: 500 } },
  { name: 'staff-authorization', rpc: 'purge_expired_staff_authorization_history', args: { p_retain_years: 3, p_limit: 500 } },
]

async function runPurgeJob(env: Env, job: PurgeJob): Promise<{ rounds: number; deleted: number }> {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  // ⚠️ ต้อง throw ไม่ใช่ return เงียบๆ — Cloudflare นับ invocation ที่ไม่ reject ว่า
  // สำเร็จ · ของเดิม log error แล้วคืน 0 ทำให้ cron ที่พังทุกวันดูเหมือนทำงานปกติ
  // (RIL ข้อ 4) · งานเบื้องหลังที่ล้มเงียบคือสิ่งที่ไม่มีใครรู้จนกว่าจะสาย
  if (!url || !key) {
    throw new Error(`[cron/purge-${job.name}] ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`)
  }

  let deleted = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const res = await fetch(`${url}/rest/v1/rpc/${job.rpc}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        // สคีมาของ Academy ไม่ใช่ public — ต้องบอก PostgREST ทุกครั้ง
        'content-profile': 'academy',
        'accept-profile': 'academy',
      },
      body: JSON.stringify(job.args),
    })
    if (!res.ok) {
      throw new Error(`[cron/purge-${job.name}] เรียกไม่สำเร็จ (${res.status}) หลังลบไปแล้ว ${deleted} แถว`)
    }
    const removed = Number(await res.json())
    deleted += Number.isFinite(removed) ? removed : 0
    if (!removed) return { rounds: round, deleted }
  }
  // ยังไม่หมดใน MAX_ROUNDS — ไม่ใช่ error แต่ต้องรู้ว่ามีของค้างมากผิดปกติ
  console.warn(`[cron/purge-${job.name}] ยังกวาดไม่หมดใน ${MAX_ROUNDS} รอบ (ลบไปแล้ว ${deleted})`)
  return { rounds: MAX_ROUNDS, deleted }
}

async function runRetention(env: Env): Promise<void> {
  const failures: string[] = []
  for (const job of RETENTION_JOBS) {
    try {
      const { rounds, deleted } = await runPurgeJob(env, job)
      console.log(`[cron/purge-${job.name}] ลบ ${deleted} แถว ใน ${rounds} รอบ`)
    } catch (error) {
      failures.push(`${job.name}: ${error instanceof Error ? error.message : 'unknown failure'}`)
    }
  }
  if (failures.length) throw new Error(`[cron/retention] ${failures.join('; ')}`)
}

export default {
  async fetch(request, env, ctx) {
    const media = await servePrivateMedia(request, env)
    return media ?? openNextHandler.fetch(request, env, ctx)
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // `waitUntil` เพื่อให้งานเดินจนจบแม้ handler คืนค่าไปแล้ว
    ctx.waitUntil(
      runRetention(env),
    )
  },
} satisfies ExportedHandler<Env>
