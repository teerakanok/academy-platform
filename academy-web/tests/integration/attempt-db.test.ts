import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { findOrCreateUser } from '@/lib/account/users'
import {
  consumeAttempt,
  issueAttempt,
  ATTEMPT_MAX_PER_WINDOW,
  ATTEMPT_WINDOW_MINUTES,
  ATTEMPT_TTL_MINUTES,
} from '@/lib/course/attempt-db'
import type { AttemptParams } from '@/lib/course/attempt'

// โครง attempt (W0-0) — ทดสอบกับ DB จริงเพราะสิ่งที่ต้องพิสูจน์คือพฤติกรรม atomic
// ของคำสั่งเดียวใน DB (race, replay, โควตา) ซึ่ง mock พิสูจน์ไม่ได้โดยนิยาม
//
// เทสเขียนแบบ "สคริปต์โจมตี" ตามแผน §8: ยิงซ้ำ ยิงพร้อมกัน ใช้ของคนอื่น ใช้ของหมดอายุ

const ISS = 'https://attempt-test.local'
const COURSE = 'attempt-test-course'
const SAMPLE_PARAMS: AttemptParams = {
  questionIds: ['q1'],
  keyMaps: { q1: { A: 'B', B: 'A' } },
  answerKeys: { q1: ['B'] },
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

let owner: { id: string }
let stranger: { id: string }

async function cleanup() {
  await withDb(async (db) => {
    await db.query(`delete from academy.attempt where course_slug = $1`, [COURSE])
    await db.query(`delete from academy.users where issuer = $1`, [ISS])
  })
}

beforeAll(async () => {
  await cleanup()
  owner = await findOrCreateUser({ issuer: ISS, subject: 'owner', email: 'attempt-owner@example.com' })
  stranger = await findOrCreateUser({ issuer: ISS, subject: 'stranger', email: 'attempt-stranger@example.com' })
})
afterAll(cleanup)

/** แต่ละเทสใช้ node ของตัวเอง — โควตานับต่อ (user, course, node) จะได้ไม่รบกวนกันเอง */
function ctx(nodeId: string, userId = owner.id) {
  return { userId, courseSlug: COURSE, nodeId, challengeId: 'checkpoint' }
}

describe('issue_attempt', () => {
  it('สัญญาโควตาตามแผน W0-1 ถูกตรึงเป็นตัวเลข — เปลี่ยนค่าคงที่แล้วเทสนี้ต้องแดงให้คนตัดสินใจ', () => {
    // ถ้าเทสอ้างค่าคงที่เดียวกับ production ล้วนๆ เพดานพิมพ์ผิดเป็น 4 ก็เขียวหมด (RIL จับ)
    expect(ATTEMPT_MAX_PER_WINDOW).toBe(3)
    expect(ATTEMPT_WINDOW_MINUTES).toBe(30)
    expect(ATTEMPT_TTL_MINUTES).toBe(60)
  })

  it('ออก attempt ผูกกับผู้ใช้ เป็น uuid ที่ไม่ซ้ำ และหมดอายุใน ~60 นาที', async () => {
    const a = await issueAttempt(ctx('n-issue'), SAMPLE_PARAMS, '1.0.0')
    const b = await issueAttempt(ctx('n-issue'), SAMPLE_PARAMS, '1.0.0')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.attemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(b!.attemptId).not.toBe(a!.attemptId)

    const ttlMs = Date.parse(a!.expiresAt) - Date.now()
    expect(ttlMs).toBeGreaterThan(55 * 60_000)
    expect(ttlMs).toBeLessThan(65 * 60_000)

    const row = await withDb((db) =>
      db.query(`select user_id, challenge_version, consumed_at from academy.attempt where attempt_id = $1`, [
        a!.attemptId,
      ]),
    )
    expect(row.rows[0].user_id).toBe(owner.id)
    expect(row.rows[0].challenge_version).toBe('1.0.0')
    expect(row.rows[0].consumed_at).toBeNull()
  })

  it(`โควตา: ครั้งที่ ${ATTEMPT_MAX_PER_WINDOW + 1} ในหน้าต่างเวลาถูกปฏิเสธ — และตัวนับอยู่ใน DB ไม่ใช่ memory`, async () => {
    for (let i = 0; i < ATTEMPT_MAX_PER_WINDOW; i++) {
      expect(await issueAttempt(ctx('n-quota'), SAMPLE_PARAMS, '1.0.0')).not.toBeNull()
    }
    // แต่ละ call ของ issueAttempt สร้าง client ใหม่ (academyDb() ต่อใหม่ทุกครั้ง) —
    // การที่ครั้งที่ 4 ยังถูกปฏิเสธพิสูจน์ว่าตัวนับอยู่ในแถวของ DB ไม่ใช่ state ของ process
    expect(await issueAttempt(ctx('n-quota'), SAMPLE_PARAMS, '1.0.0')).toBeNull()
    // คนละ node = คนละโควตา ต้องไม่ถูกหางเลข
    expect(await issueAttempt(ctx('n-quota-other'), SAMPLE_PARAMS, '1.0.0')).not.toBeNull()
  })

  it('โควตากันยิงพร้อมกัน: ยิงเกินโควตาพร้อมกันแล้วออกได้ไม่เกินเพดาน', async () => {
    const results = await Promise.all(
      Array.from({ length: ATTEMPT_MAX_PER_WINDOW + 3 }, () =>
        issueAttempt(ctx('n-quota-race'), SAMPLE_PARAMS, '1.0.0'),
      ),
    )
    expect(results.filter((r) => r !== null)).toHaveLength(ATTEMPT_MAX_PER_WINDOW)
  })

  it('หน้าต่างเวลาเลื่อนจริง: attempt ที่แก่กว่า 30 นาทีไม่ถูกนับ โควตาเปิดใหม่', async () => {
    for (let i = 0; i < ATTEMPT_MAX_PER_WINDOW; i++) {
      expect(await issueAttempt(ctx('n-window'), SAMPLE_PARAMS, '1.0.0')).not.toBeNull()
    }
    expect(await issueAttempt(ctx('n-window'), SAMPLE_PARAMS, '1.0.0')).toBeNull()
    // ย้อนเวลาแถวทั้งหมดให้พ้นหน้าต่าง 30 นาที — ครั้งถัดไปต้องออกได้อีก
    await withDb((db) =>
      db.query(
        `update academy.attempt set created_at = created_at - interval '31 minutes'
          where user_id = $1 and course_slug = $2 and node_id = 'n-window'`,
        [owner.id, COURSE],
      ),
    )
    expect(await issueAttempt(ctx('n-window'), SAMPLE_PARAMS, '1.0.0')).not.toBeNull()
  })
})

describe('consume_attempt — เงื่อนไขทั้งหมดใน WHERE เดียว', () => {
  async function issued(nodeId: string) {
    const a = await issueAttempt(ctx(nodeId), SAMPLE_PARAMS, '2.0.0')
    expect(a).not.toBeNull()
    return a!
  }

  it('consume สำเร็จได้ params + เวอร์ชันกลับมา และปิด attempt', async () => {
    const a = await issued('n-consume')
    const consumed = await consumeAttempt(ctx('n-consume'), a.attemptId)
    expect(consumed).not.toBeNull()
    expect(consumed!.params).toEqual(SAMPLE_PARAMS)
    expect(consumed!.challengeVersion).toBe('2.0.0')

    const row = await withDb((db) =>
      db.query(`select consumed_at from academy.attempt where attempt_id = $1`, [a.attemptId]),
    )
    expect(row.rows[0].consumed_at).not.toBeNull()
  })

  it('replay: attempt เดิมใช้ซ้ำไม่ได้', async () => {
    const a = await issued('n-replay')
    expect(await consumeAttempt(ctx('n-replay'), a.attemptId)).not.toBeNull()
    expect(await consumeAttempt(ctx('n-replay'), a.attemptId)).toBeNull()
  })

  it('race: ยิง attempt_id เดียวกันพร้อมกันสองเส้น → ผ่านได้อย่างมากหนึ่งเส้น', async () => {
    const a = await issued('n-race')
    const [first, second] = await Promise.all([
      consumeAttempt(ctx('n-race'), a.attemptId),
      consumeAttempt(ctx('n-race'), a.attemptId),
    ])
    const succeeded = [first, second].filter((r) => r !== null)
    expect(succeeded).toHaveLength(1)
  })

  it('attempt ของคนอื่นใช้ไม่ได้ — และการพยายามนั้นต้องไม่เผา attempt ของเจ้าของ', async () => {
    const a = await issued('n-owner')
    expect(await consumeAttempt(ctx('n-owner', stranger.id), a.attemptId)).toBeNull()
    // ownership อยู่ใน WHERE เดียวกับ update — คนอื่น "consume ทิ้ง" ของเราไม่ได้
    expect(await consumeAttempt(ctx('n-owner'), a.attemptId)).not.toBeNull()
  })

  it('บริบทไม่ตรง (คนละ node / คนละคอร์ส / คนละ challenge) → ถูกปฏิเสธ', async () => {
    const a = await issued('n-context')
    expect(await consumeAttempt({ ...ctx('n-context-wrong') }, a.attemptId)).toBeNull()
    expect(await consumeAttempt({ ...ctx('n-context'), courseSlug: 'another-course' }, a.attemptId)).toBeNull()
    expect(await consumeAttempt({ ...ctx('n-context'), challengeId: 'simulation' }, a.attemptId)).toBeNull()
    // ยิงถูกบริบทยังใช้ได้ปกติ
    expect(await consumeAttempt(ctx('n-context'), a.attemptId)).not.toBeNull()
  })

  it('attempt หมดอายุใช้ไม่ได้', async () => {
    const a = await issued('n-expired')
    await withDb((db) =>
      db.query(`update academy.attempt set expires_at = now() - interval '1 second' where attempt_id = $1`, [
        a.attemptId,
      ]),
    )
    expect(await consumeAttempt(ctx('n-expired'), a.attemptId)).toBeNull()
  })

  it('attempt_id มั่วถูกปฏิเสธเฉยๆ ไม่ throw (ไม่บอกใบ้ว่ามีอยู่จริงไหม)', async () => {
    expect(await consumeAttempt(ctx('n-ghost'), '00000000-0000-4000-8000-000000000000')).toBeNull()
  })
})

describe('RLS ของ attempt — default deny เหมือนตารางอื่นในสคีมา', () => {
  it('attempt เปิด RLS และมี policy = 0', async () => {
    const res = await withDb((db) =>
      db.query(
        `select c.relrowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = 'attempt'`,
      ),
    )
    expect(res.rows[0].relrowsecurity).toBe(true)
    expect(Number(res.rows[0].policies)).toBe(0)
  })

  it('attempt ไม่ให้สิทธิ์ anon/authenticated', async () => {
    const res = await withDb((db) =>
      db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'academy' and table_name = 'attempt'
            and grantee in ('anon', 'authenticated')`,
      ),
    )
    expect(res.rows).toEqual([])
  })

  // Postgres แจก EXECUTE ให้ PUBLIC กับฟังก์ชันใหม่โดยปริยาย — migration 0005 ถอนทิ้ง
  // ทั้งสคีมา (anon สืบสิทธิ์จาก PUBLIC ดังนั้น anon=false พิสูจน์ว่า PUBLIC ถูกถอนด้วย)
  const FUNCTIONS = [
    'academy.issue_attempt(uuid, text, text, text, jsonb, text, int, int, int)',
    'academy.consume_attempt(uuid, uuid, text, text, text)',
    'academy.record_node_progress(uuid, text, text, text, jsonb, jsonb)',
    'academy.status_rank(text)',
    'academy.has_course_entitlement(uuid, text)',
  ]
  it.each(FUNCTIONS)('%s ไม่เปิด execute ให้ anon/authenticated', async (fn) => {
    const res = await withDb((db) =>
      db.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') as authed`,
        [fn],
      ),
    )
    expect(res.rows[0].anon).toBe(false)
    expect(res.rows[0].authed).toBe(false)
  })
})
