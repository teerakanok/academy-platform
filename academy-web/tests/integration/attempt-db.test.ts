import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { requiredEnv } from './setup'
import { findOrCreateUser } from '@/lib/account/users'
import {
  consumeAttempt,
  commitAttemptResult,
  finalizeAttempt,
  inspectAttempt,
  issueAttempt,
  loadPassedAttemptExplanations,
  attemptQuota,
  ATTEMPT_WINDOW_MINUTES,
  ATTEMPT_TTL_MINUTES,
} from '@/lib/course/attempt-db'
import type { AttemptParams } from '@/lib/course/attempt'
import { captureProgressEpoch, commitNodeEvent, recordNodeEvent } from '@/lib/course/progress-db'

// โครง attempt (W0-0) — ทดสอบกับ DB จริงเพราะสิ่งที่ต้องพิสูจน์คือพฤติกรรม atomic
// ของคำสั่งเดียวใน DB (race, replay, โควตา) ซึ่ง mock พิสูจน์ไม่ได้โดยนิยาม
//
// เทสเขียนแบบ "สคริปต์โจมตี" ตามแผน §8: ยิงซ้ำ ยิงพร้อมกัน ใช้ของคนอื่น ใช้ของหมดอายุ

// โควตาที่โค้ดใช้จริง (env ทับได้) — ยึดค่าคงที่ตรงๆ แล้วเทสจะแดงเพราะคอนฟิก
// ไม่ใช่เพราะพฤติกรรมผิด
const QUOTA = attemptQuota()

const ISS = 'https://attempt-test.local'
const COURSE = 'attempt-test-course'
const SAMPLE_PARAMS: AttemptParams = {
  questionIds: ['q1'],
  questions: [],
  keyMaps: { q1: { A: 'B', B: 'A' } },
  answerKeys: { q1: ['B'] },
  assessment: { assessed: true },
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: requiredEnv('TEST_DATABASE_URL'),
  })
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
  owner = await findOrCreateUser({
    issuer: ISS,
    subject: 'owner',
    email: 'attempt-owner@example.com',
  })
  stranger = await findOrCreateUser({
    issuer: ISS,
    subject: 'stranger',
    email: 'attempt-stranger@example.com',
  })
  await withDb(async (db) => {
    await db.query(
      `insert into academy.service_activation (user_id, status, revision)
       values ($1, 'active', 1)`,
      [owner.id],
    )
    await db.query(
      `insert into academy.course_entitlement (user_id, course_slug, source)
       values ($1, $2, 'grant')`,
      [owner.id, COURSE],
    )
  })
})
afterAll(cleanup)

/** แต่ละเทสใช้ node ของตัวเอง — โควตานับต่อ (user, course, node) จะได้ไม่รบกวนกันเอง */
function ctx(nodeId: string, userId = owner.id) {
  return { userId, courseSlug: COURSE, nodeId, challengeId: 'checkpoint' }
}

describe('issue_attempt', () => {
  it('สัญญาโควตาตามแผน W0-1 ถูกตรึงเป็นตัวเลข — เปลี่ยนค่าคงที่แล้วเทสนี้ต้องแดงให้คนตัดสินใจ', () => {
    // ถ้าเทสอ้างค่าคงที่เดียวกับ production ล้วนๆ เพดานพิมพ์ผิดเป็น 4 ก็เขียวหมด (RIL จับ)
    expect(QUOTA).toBe(3)
    expect(ATTEMPT_WINDOW_MINUTES).toBe(30)
    expect(ATTEMPT_TTL_MINUTES).toBe(60)
  })

  it('ออก attempt ผูกกับผู้ใช้ เป็น uuid ที่ไม่ซ้ำ และหมดอายุใน ~60 นาที', async () => {
    const a = await issueAttempt(ctx('n-issue'), SAMPLE_PARAMS, '1.0.0')
    // ใบใหม่จะออกก็ต่อเมื่อใบเดิมถูกใช้ไปแล้ว (0010 — เปิดหน้าซ้ำไม่กินโควตา)
    await consumeAttempt(ctx('n-issue'), a!.attemptId)
    const b = await issueAttempt(ctx('n-issue'), SAMPLE_PARAMS, '1.0.0')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.attemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(b!.attemptId).not.toBe(a!.attemptId)

    const ttlMs = Date.parse(a!.expiresAt) - Date.now()
    expect(ttlMs).toBeGreaterThan(55 * 60_000)
    expect(ttlMs).toBeLessThan(65 * 60_000)

    // ตรวจแถวของใบที่ **ยังไม่ถูกใช้** (b) — ใบ a ถูก consume ไปแล้วในเทสนี้เอง
    const row = await withDb((db) =>
      db.query(`select user_id, challenge_version, consumed_at from academy.attempt where attempt_id = $1`, [
        b!.attemptId,
      ]),
    )
    expect(row.rows[0].user_id).toBe(owner.id)
    expect(row.rows[0].challenge_version).toBe('1.0.0')
    expect(row.rows[0].consumed_at).toBeNull()
  })

  it(`โควตา: ครั้งที่ ${QUOTA + 1} ในหน้าต่างเวลาถูกปฏิเสธ — และตัวนับอยู่ใน DB ไม่ใช่ memory`, async () => {
    // ⚠️ ต้อง consume ระหว่างทาง เพราะตั้งแต่ 0010 ใบที่ยังไม่ถูกใช้จะถูกคืนซ้ำ
    // (เปิดหน้าซ้ำไม่กินโควตา) · หนึ่งช่องโควตา = หนึ่งชุดโจทย์ที่ **ถูกใช้จริง**
    for (let i = 0; i < QUOTA; i++) {
      const issued = await issueAttempt(ctx('n-quota'), SAMPLE_PARAMS, '1.0.0')
      expect(issued).not.toBeNull()
      await consumeAttempt(ctx('n-quota'), issued!.attemptId)
    }
    // แต่ละ call ของ issueAttempt สร้าง client ใหม่ (academyDb() ต่อใหม่ทุกครั้ง) —
    // การที่ครั้งที่ 4 ยังถูกปฏิเสธพิสูจน์ว่าตัวนับอยู่ในแถวของ DB ไม่ใช่ state ของ process
    expect(await issueAttempt(ctx('n-quota'), SAMPLE_PARAMS, '1.0.0')).toBeNull()
    // คนละ node = คนละโควตา ต้องไม่ถูกหางเลข
    expect(await issueAttempt(ctx('n-quota-other'), SAMPLE_PARAMS, '1.0.0')).not.toBeNull()
  })

  it('ยิงขอพร้อมกันหลายเส้น → ได้ใบเดียวกันทุกเส้น ไม่ใช่คนละใบ', async () => {
    // สองแท็บเปิดพร้อมกันคือเคสจริง · ก่อน 0010 แต่ละเส้นได้ใบของตัวเองและกินคนละช่อง
    // (สาม refresh = โควตาหมด ทั้งที่ยังไม่เคยกดส่ง) · ตอนนี้ทุกเส้นต้องได้ใบเดียวกัน
    const results = await Promise.all(
      Array.from({ length: QUOTA + 3 }, () => issueAttempt(ctx('n-quota-race'), SAMPLE_PARAMS, '1.0.0')),
    )
    const ids = new Set(results.filter((r) => r !== null).map((r) => r!.attemptId))
    expect(results.every((r) => r !== null)).toBe(true)
    expect(ids.size, 'ขอพร้อมกันแล้วต้องได้ใบเดียว').toBe(1)
  })

  it('โควตากันยิงพร้อมกัน: ใช้ครบเพดานแล้วขอใหม่พร้อมกันต้องไม่ทะลุ', async () => {
    for (let i = 0; i < QUOTA; i++) {
      const issued = await issueAttempt(ctx('n-quota-burn'), SAMPLE_PARAMS, '1.0.0')
      await consumeAttempt(ctx('n-quota-burn'), issued!.attemptId)
    }
    const after = await Promise.all(
      Array.from({ length: 3 }, () => issueAttempt(ctx('n-quota-burn'), SAMPLE_PARAMS, '1.0.0')),
    )
    expect(after.filter((r) => r !== null)).toHaveLength(0)
  })

  it('หน้าต่างเวลาเลื่อนจริง: attempt ที่แก่กว่า 30 นาทีไม่ถูกนับ โควตาเปิดใหม่', async () => {
    for (let i = 0; i < QUOTA; i++) {
      const issued = await issueAttempt(ctx('n-window'), SAMPLE_PARAMS, '1.0.0')
      expect(issued).not.toBeNull()
      await consumeAttempt(ctx('n-window'), issued!.attemptId)
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
    expect((await consumeAttempt(ctx('n-replay'), a.attemptId))?.claimState).toBe('claimed')
    expect((await consumeAttempt(ctx('n-replay'), a.attemptId))?.claimState).toBe('in-progress')
  })

  it('race: ยิง attempt_id เดียวกันพร้อมกันสองเส้น → claim ได้หนึ่ง อีกเส้นรู้ว่ากำลังทำงาน', async () => {
    const a = await issued('n-race')
    const [first, second] = await Promise.all([
      consumeAttempt(ctx('n-race'), a.attemptId),
      consumeAttempt(ctx('n-race'), a.attemptId),
    ])
    expect([first?.claimState, second?.claimState].sort()).toEqual(['claimed', 'in-progress'])
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
    'academy.inspect_attempt(uuid, uuid, text, text, text)',
    'academy.consume_attempt(uuid, uuid, text, text, text)',
    // ลายเซ็นใหม่ตั้งแต่ 0008 (เพิ่มตัวชี้ว่าผ่านด้วย attempt ไหน) — รุ่นเก่าถูก drop ทิ้ง
    'academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)',
    'academy.status_rank(text)',
    'academy.has_course_entitlement(uuid, text)',
    'academy.finalize_attempt(uuid, uuid, uuid, jsonb)',
    'academy.capture_progress_epoch(uuid, text)',
    'academy.progress_write_allowed(uuid, text, bigint)',
    'academy.commit_attempt_result(uuid, uuid, uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb)',
    'academy.commit_node_progress(uuid, text, text, text, bigint, jsonb, jsonb, jsonb)',
    'academy.reset_course_progress(uuid, text)',
    'academy.reset_course_progress(uuid, text, uuid)',
    'academy.sync_service_activation(uuid, text, integer)',
    'academy.open_attempt_appeal(uuid, uuid, text, timestamptz)',
    'academy.resolve_attempt_appeal(text, timestamptz)',
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

  it('attempt_appeal เปิด RLS, ไม่มี policy และไม่ให้สิทธิ์ browser roles', async () => {
    const res = await withDb((db) =>
      db.query(
        `select c.relrowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
                has_table_privilege('anon', 'academy.attempt_appeal', 'select') as anon_select,
                has_table_privilege('authenticated', 'academy.attempt_appeal', 'insert') as authed_insert
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = 'attempt_appeal'`,
      ),
    )
    expect(res.rows[0]).toEqual({
      relrowsecurity: true,
      policies: '0',
      anon_select: false,
      authed_insert: false,
    })
  })
})

// ── W1: หลักฐานของด่านจำลอง ──────────────────────────────────────────────────
//
// ใบรับรอง (W4) จะอ้างอิงหลักฐานนี้ จึงต้องเก็บ **ผลราย requirement + เวอร์ชันโจทย์**
// ไม่ใช่ boolean รวม — ไม่งั้นตอบไม่ได้ว่าผ่านด้วยอะไร ณ โจทย์รุ่นไหน
describe('simulation evidence ใน node_progress', () => {
  const COURSE_SIM = 'evidence-test-course'

  it('บันทึกผลราย requirement + เวอร์ชัน และรวมกับของเดิมโดยไม่ทับ', async () => {
    const { recordNodeEvent } = await import('@/lib/course/progress-db')

    await recordNodeEvent(owner.id, {
      slug: COURSE_SIM,
      nodeId: 'n1',
      status: 'in-progress',
      simulationEvidence: {
        'sim-a': {
          passed: false,
          requirements: [
            { id: 'r1', met: true },
            { id: 'r2', met: false },
          ],
          challengeVersion: '1.0.0',
          at: '2026-08-02T00:00:00.000Z',
        },
      },
    })

    // ส่งด่านที่สองมาทีหลัง — ของเดิมต้องไม่หาย
    await recordNodeEvent(owner.id, {
      slug: COURSE_SIM,
      nodeId: 'n1',
      status: 'completed',
      simulationEvidence: {
        'sim-b': {
          passed: true,
          requirements: [{ id: 'r9', met: true }],
          challengeVersion: '1.1.0',
          at: '2026-08-02T01:00:00.000Z',
        },
      },
    })

    const row = await withDb((db) =>
      db.query(
        `select simulation_evidence from academy.node_progress
          where user_id = $1 and course_slug = $2 and node_id = 'n1'`,
        [owner.id, COURSE_SIM],
      ),
    )
    const evidence = row.rows[0].simulation_evidence
    expect(Object.keys(evidence).sort()).toEqual(['sim-a', 'sim-b'])
    expect(evidence['sim-a'].requirements).toEqual([
      { id: 'r1', met: true },
      { id: 'r2', met: false },
    ])
    expect(evidence['sim-a'].challengeVersion).toBe('1.0.0')
    expect(evidence['sim-b'].passed).toBe(true)

    await withDb((db) =>
      db.query(`delete from academy.node_progress where user_id = $1 and course_slug = $2`, [owner.id, COURSE_SIM]),
    )
  })
})

// ── W1 (RIL รอบ 2): ตรรกะ merge ต้องมีเทสที่เรียก SQL ตรงๆ ────────────────────
//
// เทส e2e จับ mutation ของ merge ได้เฉพาะเมื่อ migration กลายพันธุ์ถูก apply ลง DB
// ใหม่ — บน DB ที่ apply ไปแล้ว การแก้ไฟล์ .sql ไม่กระทบอะไรเลย จึงต้องมีเทสที่
// เรียกฟังก์ชันจริงในฐานข้อมูล
describe('merge_simulation_evidence — หลักฐานเลื่อนขึ้นอย่างเดียว', () => {
  async function merge(existing: unknown, incoming: unknown) {
    const res = await withDb((db) =>
      db.query('select academy.merge_simulation_evidence($1::jsonb, $2::jsonb) as merged', [
        JSON.stringify(existing),
        JSON.stringify(incoming),
      ]),
    )
    return res.rows[0].merged as Record<string, { passed: boolean; v?: number }>
  }

  it('ครั้งแรก: รับของใหม่ตามปกติ', async () => {
    expect(await merge({}, { a: { passed: true, v: 1 } })).toEqual({
      a: { passed: true, v: 1 },
    })
  })

  it('🔴 ผ่านแล้วส่งผลไม่ผ่านมาทีหลัง → คงของเดิมไว้', async () => {
    // นี่คือกรณีที่ทำให้ "สถานะบอกว่าผ่าน แต่หลักฐานบอกว่าไม่ผ่าน"
    expect(await merge({ a: { passed: true, v: 1 } }, { a: { passed: false, v: 2 } })).toEqual({
      a: { passed: true, v: 1 },
    })
  })

  it('ยังไม่ผ่าน → รับผลใหม่ได้ตามปกติ (ทั้งผ่านและไม่ผ่าน)', async () => {
    expect(await merge({ a: { passed: false, v: 1 } }, { a: { passed: true, v: 2 } })).toEqual({
      a: { passed: true, v: 2 },
    })
    expect(await merge({ a: { passed: false, v: 1 } }, { a: { passed: false, v: 2 } })).toEqual({
      a: { passed: false, v: 2 },
    })
  })

  it('ผ่านแล้วทำใหม่ให้ผ่านอีก → อัปเดตได้ (เช่นโจทย์เวอร์ชันใหม่)', async () => {
    expect(await merge({ a: { passed: true, v: 1 } }, { a: { passed: true, v: 2 } })).toEqual({
      a: { passed: true, v: 2 },
    })
  })

  it('ด่านอื่นไม่กระทบกัน และด่านที่ไม่ได้ส่งมาต้องไม่หาย', async () => {
    expect(await merge({ a: { passed: true, v: 1 } }, { b: { passed: false, v: 1 } })).toEqual({
      a: { passed: true, v: 1 },
      b: { passed: false, v: 1 },
    })
  })

  it('null/ว่าง ไม่ทำให้ของเดิมหาย', async () => {
    expect(await merge({ a: { passed: true, v: 1 } }, {})).toEqual({
      a: { passed: true, v: 1 },
    })
    const res = await withDb((db) =>
      db.query(`select academy.merge_simulation_evidence('{"a":{"passed":true}}'::jsonb, null) as merged`),
    )
    expect(res.rows[0].merged).toEqual({ a: { passed: true } })
  })
})

describe('ตัวชี้ว่าผ่านด้วย attempt ไหน (0008)', () => {
  // ใบรับรอง (W4) snapshot หลักฐาน ณ วันออก · ถ้าไม่มีตัวชี้นี้ คำถาม "ใบนี้ออกจาก
  // อะไร" ตอบได้แค่ "บทนี้ completed" ซึ่งไม่บอกว่าโจทย์ชุดไหน กติกาเวอร์ชันไหน
  // (RIL cross-model รอบ 2)

  const NODE = 'n-passing-pointer'

  async function pointerOf(nodeId: string) {
    return withDb(async (db) => {
      const res = await db.query(
        `select passed_attempt_id, passed_challenge_version
           from academy.node_progress
          where user_id = $1 and course_slug = $2 and node_id = $3`,
        [owner.id, COURSE, nodeId],
      )
      return res.rows[0] ?? null
    })
  }

  it('🔴 ผ่านแล้วบันทึกว่า attempt ไหน/เวอร์ชันไหน', async () => {
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-pass')
    expect(issued).not.toBeNull()
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'completed',
      passedAttemptId: issued!.attemptId,
      passedChallengeVersion: 'v-pass',
    })
    expect(await pointerOf(NODE)).toEqual({
      passed_attempt_id: issued!.attemptId,
      passed_challenge_version: 'v-pass',
    })
  })

  it('🔴 การส่งครั้งหลังที่ไม่ได้ทำให้ผ่าน ต้องไม่ลบตัวชี้ทิ้ง', async () => {
    const before = await pointerOf(NODE)
    expect(before.passed_attempt_id).toBeTruthy()

    // กดทำซ้ำแล้วไม่ผ่าน — route ไม่ส่งตัวชี้มา (null) · DB ต้องคงของเดิมไว้
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'in-progress',
    })
    expect(await pointerOf(NODE)).toEqual(before)
  })

  it('บทที่ผ่านโดยไม่มี attempt (บทสอนทั่วไป) → ตัวชี้เป็น null ไม่ใช่ค่ามั่ว', async () => {
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: 'n-plain',
      status: 'completed',
    })
    expect(await pointerOf('n-plain')).toEqual({
      passed_attempt_id: null,
      passed_challenge_version: null,
    })
  })
})

describe('ล้มกลางทางแล้วต้องไม่กินสิทธิ์ (0009)', () => {
  // การส่งคำตอบมีสองขั้นที่ไม่ atomic ต่อกัน: consume แล้วจึงบันทึกความคืบหน้า ·
  // ถ้าขั้นหลังล้ม ผู้เรียนได้ 500 ไม่ได้บันทึกอะไร และเสียสิทธิ์หนึ่งครั้งจากสาม
  // (RIL cross-model รอบ W1 ข้อ 6)

  async function ageClaim(attemptId: string, seconds: number) {
    await withDb((db) =>
      db.query(
        `update academy.attempt set consumed_at = now() - make_interval(secs => $2)
          where attempt_id = $1`,
        [attemptId, seconds],
      ),
    )
  }

  it('🔴 consume แล้วบันทึกล้ม (ไม่ได้ finalize) → ส่งใหม่ด้วย attempt เดิมได้', async () => {
    const NODE = 'n-finalize-crash'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    expect(await consumeAttempt(ctx(NODE), issued!.attemptId)).not.toBeNull()
    // จำลองว่าคำขอแรกตายหลัง consume — เวลาผ่านไปพอที่จะรู้ว่าไม่ใช่การยิงซ้ำ
    await ageClaim(issued!.attemptId, 60)

    const again = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(again, 'attempt ที่ค้างไม่มีผลต้องกลับมาใช้ได้').not.toBeNull()
    expect(again!.outcome).toBeNull()
  })

  it('🔴 ยิงซ้ำทันที (ยังไม่ค้างนาน) → ยังถูกปฏิเสธเหมือนเดิม', async () => {
    const NODE = 'n-finalize-replay'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    expect(await consumeAttempt(ctx(NODE), issued!.attemptId)).not.toBeNull()
    // ไม่มีการเลื่อนเวลา — นี่คือ replay/ยิงคู่ ไม่ใช่การล้มกลางทาง
    expect((await consumeAttempt(ctx(NODE), issued!.attemptId))?.claimState).toBe('in-progress')
  })

  it('🔴 finalize แล้ว → ส่งซ้ำได้ผลเดิม ไม่ใช่ตรวจใหม่', async () => {
    const NODE = 'n-finalize-idempotent'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    await finalizeAttempt(owner.id, issued!.attemptId, claimed!.claimToken!, {
      passed: true,
    })
    await ageClaim(issued!.attemptId, 60)

    const again = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(again, 'attempt ที่จบแล้วต้องคืนผลเดิมให้ route ตัดสินใจ').not.toBeNull()
    expect(again!.outcome).toEqual({ passed: true })
  })

  it('🔴 finalize เขียนได้ครั้งเดียว — ผลที่บันทึกไว้แล้วทับไม่ได้', async () => {
    const NODE = 'n-finalize-once'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(
      await finalizeAttempt(owner.id, issued!.attemptId, claimed!.claimToken!, {
        passed: false,
      }),
    ).toBe(true)
    expect(
      await finalizeAttempt(owner.id, issued!.attemptId, claimed!.claimToken!, {
        passed: true,
      }),
    ).toBe(false)

    const row = await withDb((db) =>
      db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId]),
    )
    expect(row.rows[0].outcome).toEqual({ passed: false })
  })

  it('🔴 finalize ของคนอื่นไม่มีผล', async () => {
    const NODE = 'n-finalize-owner'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(await finalizeAttempt(stranger.id, issued!.attemptId, claimed!.claimToken!, { passed: true })).toBe(false)

    const row = await withDb((db) =>
      db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId]),
    )
    expect(row.rows[0].outcome).toBeNull()
  })
})

describe('retention ของตาราง attempt (0011, 0017)', () => {
  // ตารางโตทางเดียว (~2–3 KB/แถวรวม index) · แต่การกวาดต้องไม่แตะสองอย่าง:
  // แถวที่ผู้เรียนกำลังใช้อยู่ และแถวที่ยังทำหน้าที่เป็นสมุดนับโควตา
  // (การคืนโควตาให้ฟรีคือบั๊กเดียวกับที่ reset เคยทำแล้วถูก RIL จับ)

  async function purge(retainDays = 90) {
    return withDb(async (db) => {
      const res = await db.query(`select academy.purge_expired_attempts($1, 5000) as deleted`, [retainDays])
      return res.rows[0].deleted as number
    })
  }

  async function ageAttempt(attemptId: string, days: number) {
    await withDb((db) =>
      db.query(
        `update academy.attempt
            set created_at = now() - make_interval(days => $2),
                expires_at = now() - make_interval(days => $2)
          where attempt_id = $1`,
        [attemptId, days],
      ),
    )
  }

  it('🔴 ไม่แตะ attempt ที่ยังใช้ได้อยู่', async () => {
    const live = await issueAttempt(ctx('n-retain-live'), SAMPLE_PARAMS, '1.0.0')
    expect(await purge()).toBe(0)
    expect(await consumeAttempt(ctx('n-retain-live'), live!.attemptId)).not.toBeNull()
  })

  it('🔴 ไม่แตะแถวที่หมดอายุแต่ยังอยู่ในระยะเก็บรักษา (สมุดนับโควตา)', async () => {
    const recent = await issueAttempt(ctx('n-retain-recent'), SAMPLE_PARAMS, '1.0.0')
    await ageAttempt(recent!.attemptId, 3)
    expect(await purge()).toBe(0)
  })

  it('🔴 กวาดแถวที่หมดอายุเกินระยะเก็บรักษา', async () => {
    const old = await issueAttempt(ctx('n-retain-old'), SAMPLE_PARAMS, '1.0.0')
    await ageAttempt(old!.attemptId, 91)
    expect(await purge()).toBe(1)
    expect(await purge()).toBe(0)
  })

  it('🔴 attempt ที่ไม่ได้เป็นหลักฐาน กวาดได้ และแถวความคืบหน้าไม่กระทบ', async () => {
    // ⚠️ เทสรุ่นแรกของข้อนี้ยืนยันว่า "กวาดใบที่เป็นหลักฐานได้ ตราบใดที่ตัวชี้ยังอยู่"
    // ซึ่ง **ผิด** — RIL ทั้งสองเลนชี้ว่าเหลือแต่ UUID ที่ชี้ไปยังแถวที่ไม่มีอยู่ จึง
    // ตอบไม่ได้ว่าผ่านด้วยโจทย์ชุดไหน · ตอนนี้ใบที่เป็นหลักฐานถูกกันไว้ (0012) และ
    // ข้อนี้เหลือหน้าที่พิสูจน์ว่าใบ **อื่น** ยังกวาดได้ตามปกติ
    const spent = await issueAttempt(ctx('n-retain-spent'), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx('n-retain-spent'), spent!.attemptId)
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: 'n-retain-spent',
      status: 'in-progress',
    })
    await ageAttempt(spent!.attemptId, 91)

    expect(await purge()).toBe(1)
    const row = await withDb((db) =>
      db.query(
        `select status from academy.node_progress
          where user_id = $1 and course_slug = $2 and node_id = 'n-retain-spent'`,
        [owner.id, COURSE],
      ),
    )
    expect(row.rows[0].status).toBe('in-progress')
  })

  it('ค่า default เก็บ attempt ที่ไม่เป็นหลักฐาน 90 วัน', async () => {
    const recent = await issueAttempt(ctx('n-retain-default-89'), SAMPLE_PARAMS, 'v-retain')
    const old = await issueAttempt(ctx('n-retain-default-91'), SAMPLE_PARAMS, 'v-retain')
    await ageAttempt(recent!.attemptId, 89)
    await ageAttempt(old!.attemptId, 91)

    expect(await purge()).toBe(1)
    const rows = await withDb((db) =>
      db.query(`select attempt_id from academy.attempt where attempt_id = any($1::uuid[])`, [
        [recent!.attemptId, old!.attemptId],
      ]),
    )
    expect(rows.rows.map((row) => row.attempt_id)).toEqual([recent!.attemptId])
  })

  it('appeal เปิดภายใน 30 วันพักการลบจน resolve แล้วจึงกวาดได้', async () => {
    const NODE = 'n-retain-appeal'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-appeal')
    const claim = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(claim?.claimToken).toBeTruthy()
    expect(await finalizeAttempt(owner.id, issued!.attemptId, claim!.claimToken!, { passed: false })).toBe(true)

    await withDb((db) =>
      db.query(
        `update academy.attempt
            set created_at = now() - interval '121 days',
                expires_at = now() - interval '120 days',
                result_recorded_at = now() - interval '100 days'
          where attempt_id = $1`,
        [issued!.attemptId],
      ),
    )
    const appealId = await withDb(async (db) => {
      const result = await db.query(
        `select academy.open_attempt_appeal($1, $2, $3, now() - interval '90 days') as id`,
        [issued!.attemptId, owner.id, `ACA-${randomUUID()}`],
      )
      return result.rows[0].id as string
    })
    expect(appealId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await purge()).toBe(0)

    const resolved = await withDb(async (db) => {
      const ref = await db.query(`select case_reference from academy.attempt_appeal where appeal_id = $1`, [appealId])
      const result = await db.query(`select academy.resolve_attempt_appeal($1, now()) as ok`, [ref.rows[0].case_reference])
      return result.rows[0].ok as boolean
    })
    expect(resolved).toBe(true)
    expect(await purge()).toBe(1)
  })

  it('appeal หลังผลออกเกิน 30 วันถูกปฏิเสธและไม่สร้าง retention hold', async () => {
    const NODE = 'n-retain-late-appeal'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-appeal')
    const claim = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(await finalizeAttempt(owner.id, issued!.attemptId, claim!.claimToken!, { passed: false })).toBe(true)
    await withDb((db) =>
      db.query(`update academy.attempt set result_recorded_at = now() - interval '31 days' where attempt_id = $1`, [
        issued!.attemptId,
      ]),
    )

    const result = await withDb((db) =>
      db.query(`select academy.open_attempt_appeal($1, $2, $3, now()) as id`, [
        issued!.attemptId,
        owner.id,
        `ACA-${randomUUID()}`,
      ]),
    )
    expect(result.rows[0].id).toBeNull()
  })
})

describe('ปิดรูที่ RIL สองเลนชี้ตรงกัน (0012)', () => {
  async function ageClaimTo(attemptId: string, seconds: number) {
    await withDb((db) =>
      db.query(`update academy.attempt set consumed_at = now() - make_interval(secs => $2) where attempt_id = $1`, [
        attemptId,
        seconds,
      ]),
    )
  }

  it('🔴 claim ค้างแล้วยิงพร้อมกันหลายเส้น → ยึดได้เส้นเดียว', async () => {
    // รูเดิม: `consumed_at = coalesce(consumed_at, now())` ไม่ต่ออายุ claim ·
    // พอเลย 30 วินาที ทุกเส้นที่ยิงพร้อมกันผ่านเงื่อนไขหมด = ตรวจได้หลายชุดคำตอบ
    // จากโควตาช่องเดียว (RIL ทั้งสองเลนเดินเคสให้ดู)
    const NODE = 'n-stale-race'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx(NODE), issued!.attemptId)
    await ageClaimTo(issued!.attemptId, 60)

    const racers = await Promise.all(Array.from({ length: 5 }, () => consumeAttempt(ctx(NODE), issued!.attemptId)))
    expect(
      racers.filter((r) => r?.claimState === 'claimed'),
      'ยึดพร้อมกันต้องผ่านได้เส้นเดียว',
    ).toHaveLength(1)
    expect(racers.filter((r) => r?.claimState === 'in-progress')).toHaveLength(4)
  })

  it('🔴 ยึดสำเร็จแล้วต้องต่ออายุ claim (เส้นถัดไปเห็นของสด)', async () => {
    const NODE = 'n-stale-renew'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx(NODE), issued!.attemptId)
    await ageClaimTo(issued!.attemptId, 60)

    expect((await consumeAttempt(ctx(NODE), issued!.attemptId))?.claimState).toBe('claimed')
    // ยึดรอบสองไปแล้ว → รอบสามต้องถูกปฏิเสธทันที เพราะ claim ถูกต่ออายุ
    expect((await consumeAttempt(ctx(NODE), issued!.attemptId))?.claimState).toBe('in-progress')
  })

  it('🔴 ผ่านแล้ว ผลรายข้อถูกทับไม่ได้อีก (หลักฐานถูกแช่แข็งทั้งชุด)', async () => {
    // สถานะกับตัวชี้ถูกกันไม่ให้ถอยอยู่แล้ว แต่ `checkpoint_results` ยังใช้ `||` ·
    // ผ่านแล้วขอ attempt ใหม่แล้วตอบมั่ว = บทที่ระบบบอกว่าผ่าน มีผลรายข้อว่าผิดหมด
    const NODE = 'n-frozen-evidence'
    const first = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-pass')
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'completed',
      checkpointResults: { q1: true },
      simulationEvidence: {
        'sim-1': {
          passed: true,
          requirements: [],
          challengeVersion: 's1',
          at: 'now',
        },
      },
      passedAttemptId: first!.attemptId,
      passedChallengeVersion: 'v-pass',
    })

    // ทำซ้ำแล้วตอบผิด — ระบบยังรับการทำซ้ำได้ แต่ต้องไม่แตะหลักฐาน
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'in-progress',
      checkpointResults: { q1: false },
      simulationEvidence: {
        'sim-1': {
          passed: false,
          requirements: [],
          challengeVersion: 's1',
          at: 'later',
        },
      },
    })

    const row = await withDb((db) =>
      db.query(
        `select status, checkpoint_results, simulation_evidence, passed_attempt_id
           from academy.node_progress where user_id = $1 and course_slug = $2 and node_id = $3`,
        [owner.id, COURSE, NODE],
      ),
    )
    expect(row.rows[0].status).toBe('completed')
    expect(row.rows[0].checkpoint_results.q1, 'ผลรายข้อของการผ่านถูกทับ').toBe(true)
    expect(row.rows[0].simulation_evidence['sim-1'].passed).toBe(true)
    expect(row.rows[0].passed_attempt_id).toBe(first!.attemptId)
  })

  it('🔴 ตัวกวาดต้องไม่ลบ attempt ที่เป็นหลักฐานของการผ่าน', async () => {
    // ตัวชี้ตั้งใจไม่มี FK (retention ต้องกวาดได้) กติกาจึงต้องอยู่ในตัวกวาดเอง
    // ไม่งั้นเหลือแต่ UUID ที่ชี้ไปยังแถวที่ไม่มีอยู่
    const NODE = 'n-purge-protected'
    const passed = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-cert')
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'completed',
      passedAttemptId: passed!.attemptId,
      passedChallengeVersion: 'v-cert',
    })
    await withDb((db) =>
      db.query(
        `update academy.attempt set created_at = now() - interval '90 days',
                                    expires_at = now() - interval '89 days'
          where attempt_id = $1`,
        [passed!.attemptId],
      ),
    )

    await withDb((db) => db.query(`select academy.purge_expired_attempts(30, 5000)`))

    const still = await withDb((db) =>
      db.query(`select params from academy.attempt where attempt_id = $1`, [passed!.attemptId]),
    )
    expect(still.rows, 'โจทย์ที่ใช้พิสูจน์ต้องยังอยู่').toHaveLength(1)
  })
})

describe('pre-consume validation snapshot (0014)', () => {
  it('อ่านได้เฉพาะ owner/context รุ่นปัจจุบัน และไม่ claim attempt', async () => {
    const NODE = 'n-inspect-readiness'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-inspect')

    await expect(inspectAttempt(ctx(NODE), issued!.attemptId)).resolves.toEqual({
      params: SAMPLE_PARAMS,
      outcome: null,
    })
    await expect(inspectAttempt(ctx(NODE, stranger.id), issued!.attemptId)).resolves.toBeNull()
    await expect(inspectAttempt({ ...ctx(NODE), nodeId: 'another-node' }, issued!.attemptId)).resolves.toBeNull()

    const beforeReset = await withDb((db) =>
      db.query(`select consumed_at, claim_token from academy.attempt where attempt_id = $1`, [issued!.attemptId]),
    )
    expect(beforeReset.rows[0]).toEqual({
      consumed_at: null,
      claim_token: null,
    })

    await withDb((db) => db.query(`select academy.reset_course_progress($1, $2)`, [owner.id, COURSE]))
    await expect(inspectAttempt(ctx(NODE), issued!.attemptId)).resolves.toBeNull()
  })
})

describe('claim fencing + atomic progress/outcome (0013)', () => {
  async function reset(operationId = randomUUID()) {
    return withDb(async (db) => {
      const result = await db.query(`select academy.reset_course_progress($1, $2, $3) as applied`, [
        owner.id,
        COURSE,
        operationId,
      ])
      return result.rows[0].applied as boolean
    })
  }

  async function claim(nodeId: string, attemptId: string) {
    return withDb(async (db) => {
      const res = await db.query(`select * from academy.consume_attempt($1, $2, $3, $4, $5)`, [
        attemptId,
        owner.id,
        COURSE,
        nodeId,
        'checkpoint',
      ])
      return res.rows[0] as { claim_token: string | null; outcome: { passed: boolean } | null } | undefined
    })
  }

  async function commit(nodeId: string, attemptId: string, claimToken: string, passed: boolean) {
    return withDb(async (db) => {
      const res = await db.query(
        `select academy.commit_attempt_result(
           $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, null, null
         ) as committed`,
        [
          attemptId,
          owner.id,
          claimToken,
          COURSE,
          nodeId,
          'checkpoint',
          JSON.stringify({ passed }),
          passed ? 'completed' : 'in-progress',
          JSON.stringify({ q1: passed }),
        ],
      )
      return res.rows[0].committed as boolean
    })
  }

  it('stalled A → B reclaim → A resumes: token ของ A เขียน progress/outcome ไม่ได้', async () => {
    const NODE = 'n-claim-fence'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-fence')
    const claimA = await claim(NODE, issued!.attemptId)
    expect(claimA?.claim_token).toMatch(/^[0-9a-f-]{36}$/)

    await withDb((db) =>
      db.query(`update academy.attempt set consumed_at = now() - interval '60 seconds' where attempt_id = $1`, [
        issued!.attemptId,
      ]),
    )
    const claimB = await claim(NODE, issued!.attemptId)
    expect(claimB?.claim_token).toMatch(/^[0-9a-f-]{36}$/)
    expect(claimB?.claim_token).not.toBe(claimA?.claim_token)

    const [committedB, committedA] = await Promise.all([
      commit(NODE, issued!.attemptId, claimB!.claim_token!, false),
      commit(NODE, issued!.attemptId, claimA!.claim_token!, true),
    ])
    expect(committedB).toBe(true)
    expect(committedA).toBe(false)

    const state = await withDb(async (db) => {
      const attempt = await db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId])
      const progress = await db.query(
        `select status, checkpoint_results from academy.node_progress
          where user_id = $1 and course_slug = $2 and node_id = $3`,
        [owner.id, COURSE, NODE],
      )
      return { outcome: attempt.rows[0].outcome, progress: progress.rows[0] }
    })
    expect(state).toEqual({
      outcome: { passed: false },
      progress: { status: 'in-progress', checkpoint_results: { q1: false } },
    })
  })

  it('production helper commit แบบ atomic และอ่าน explanation จาก attempt snapshot', async () => {
    const NODE = 'n-explanation-snapshot'
    const params = {
      ...SAMPLE_PARAMS,
      explanations: { q1: 'คำอธิบายรุ่นที่ผู้เรียนทำจริง' },
    }
    const issued = await issueAttempt(ctx(NODE), params, 'v-snapshot')
    const consumed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(
      await commitAttemptResult(
        ctx(NODE),
        issued!.attemptId,
        consumed!.claimToken!,
        { passed: true },
        { status: 'completed', checkpointResults: { q1: true } },
      ),
    ).toBe(true)

    await expect(
      loadPassedAttemptExplanations({
        userId: owner.id,
        courseSlug: COURSE,
        nodeId: NODE,
      }),
    ).resolves.toEqual({
      status: 'ready',
      explanations: { q1: 'คำอธิบายรุ่นที่ผู้เรียนทำจริง' },
    })
  })

  it('บทที่ผ่านโดยไม่มี attempt แยกจาก pointer ที่ snapshot หายได้ชัดเจน', async () => {
    const NODE = 'n-no-attempt-snapshot'
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'completed',
    })
    await expect(
      loadPassedAttemptExplanations({
        userId: owner.id,
        courseSlug: COURSE,
        nodeId: NODE,
      }),
    ).resolves.toEqual({ status: 'none' })
  })

  it('finalize payload เสียก็ถูก fencing: token เก่าปิด claim ใหม่ไม่ได้', async () => {
    const NODE = 'n-finalize-fence'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-finalize-fence')
    const claimA = await consumeAttempt(ctx(NODE), issued!.attemptId)
    await withDb((db) =>
      db.query(`update academy.attempt set consumed_at = now() - interval '60 seconds' where attempt_id = $1`, [
        issued!.attemptId,
      ]),
    )
    const claimB = await consumeAttempt(ctx(NODE), issued!.attemptId)

    expect(
      await finalizeAttempt(owner.id, issued!.attemptId, claimA!.claimToken!, {
        passed: false,
      }),
    ).toBe(false)
    expect(
      await finalizeAttempt(owner.id, issued!.attemptId, claimB!.claimToken!, {
        passed: false,
      }),
    ).toBe(true)
  })

  it('outcome ที่ไม่ใช่ {passed:boolean} ถูก reject และ transaction ไม่เปลี่ยน state', async () => {
    const NODE = 'n-invalid-outcome'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-invalid-outcome')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)

    await expect(
      withDb((db) =>
        db.query(
          `select academy.commit_attempt_result(
             $1, $2, $3, $4, $5, 'checkpoint', null::jsonb, 'in-progress', '{"q1":false}', null, null
           )`,
          [issued!.attemptId, owner.id, claimed!.claimToken, COURSE, NODE],
        ),
      ),
    ).rejects.toThrow(/outcome|passed/i)

    const state = await withDb(async (db) => {
      const attempt = await db.query(`select outcome, claim_token from academy.attempt where attempt_id = $1`, [
        issued!.attemptId,
      ])
      const progress = await db.query(
        `select 1 from academy.node_progress where user_id = $1 and course_slug = $2 and node_id = $3`,
        [owner.id, COURSE, NODE],
      )
      return { attempt: attempt.rows[0], progressRows: progress.rowCount }
    })
    expect(state).toEqual({
      attempt: { outcome: null, claim_token: claimed!.claimToken },
      progressRows: 0,
    })
  })

  it('commit ที่ค้างอยู่แพ้ activation suspend ซึ่ง commit ก่อนมัน', async () => {
    const NODE = 'n-access-fence'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-access-fence')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    const control = new Client({
      connectionString: requiredEnv('TEST_DATABASE_URL'),
    })
    await control.connect()
    try {
      await control.query('begin')
      await control.query(
        `update academy.service_activation set status = 'suspended', revision = revision + 1
          where user_id = $1`,
        [owner.id],
      )

      const pending = commit(NODE, issued!.attemptId, claimed!.claimToken!, true)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await control.query('commit')
      await expect(pending).resolves.toBe(false)

      const state = await withDb(async (db) => {
        const attempt = await db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId])
        const progress = await db.query(
          `select 1 from academy.node_progress
            where user_id = $1 and course_slug = $2 and node_id = $3`,
          [owner.id, COURSE, NODE],
        )
        return {
          outcome: attempt.rows[0].outcome,
          progressRows: progress.rowCount,
        }
      })
      expect(state).toEqual({ outcome: null, progressRows: 0 })
    } finally {
      await control.query('rollback').catch(() => undefined)
      await control.end()
      await withDb((db) =>
        db.query(`update academy.service_activation set status = 'active' where user_id = $1`, [owner.id]),
      )
    }
  })

  it('reset generation กัน request ก่อน reset เขียน progress กลับมาทีหลัง', async () => {
    const NODE = 'n-reset-fence'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-reset-fence')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: NODE,
      status: 'in-progress',
    })

    const control = new Client({
      connectionString: requiredEnv('TEST_DATABASE_URL'),
    })
    await control.connect()
    try {
      await control.query('begin')
      await control.query(`select academy.reset_course_progress($1, $2)`, [owner.id, COURSE])

      const pending = commit(NODE, issued!.attemptId, claimed!.claimToken!, true)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await control.query('commit')
      await expect(pending).resolves.toBe(false)
      const state = await withDb(async (db) => {
        const attempt = await db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId])
        const progress = await db.query(`select 1 from academy.node_progress where user_id = $1 and course_slug = $2`, [
          owner.id,
          COURSE,
        ])
        return {
          outcome: attempt.rows[0].outcome,
          progressRows: progress.rowCount,
        }
      })
      expect(state).toEqual({ outcome: null, progressRows: 0 })
    } finally {
      await control.query('rollback').catch(() => undefined)
      await control.end()
    }
  })

  it('completed retry จาก generation ก่อน reset ใช้ซ้ำไม่ได้', async () => {
    const NODE = 'n-completed-reset-fence'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v-completed-reset')
    const claimed = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(
      await finalizeAttempt(owner.id, issued!.attemptId, claimed!.claimToken!, {
        passed: true,
      }),
    ).toBe(true)

    await withDb((db) => db.query(`select academy.reset_course_progress($1, $2)`, [owner.id, COURSE]))
    await expect(consumeAttempt(ctx(NODE), issued!.attemptId)).resolves.toBeNull()
  })

  it('generic open mutation ที่เริ่มก่อน reset เขียน progress กลับมาไม่ได้', async () => {
    const NODE = 'n-generic-reset-fence'
    const epoch = await captureProgressEpoch(owner.id, COURSE)
    const control = new Client({
      connectionString: requiredEnv('TEST_DATABASE_URL'),
    })
    await control.connect()
    try {
      await control.query('begin')
      await control.query(`select academy.reset_course_progress($1, $2)`, [owner.id, COURSE])

      const pending = commitNodeEvent(owner.id, { slug: COURSE, nodeId: NODE, status: 'in-progress' }, epoch)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await control.query('commit')
      await expect(pending).resolves.toBe(false)
      const progress = await withDb((db) =>
        db.query(
          `select 1 from academy.node_progress
            where user_id = $1 and course_slug = $2 and node_id = $3`,
          [owner.id, COURSE, NODE],
        ),
      )
      expect(progress.rowCount).toBe(0)
    } finally {
      await control.query('rollback').catch(() => undefined)
      await control.end()
    }
  })

  it('reset operation ID เดิมเป็น no-op และไม่ลบงานที่เริ่มหลัง reset', async () => {
    const operationId = randomUUID()
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId: 'n-before-idempotent-reset',
      status: 'in-progress',
    })
    await expect(reset(operationId)).resolves.toBe(true)

    const epoch = await captureProgressEpoch(owner.id, COURSE)
    await expect(
      commitNodeEvent(
        owner.id,
        {
          slug: COURSE,
          nodeId: 'n-after-idempotent-reset',
          status: 'in-progress',
        },
        epoch,
      ),
    ).resolves.toBe(true)
    await expect(reset(operationId)).resolves.toBe(true)

    const state = await withDb(async (db) => {
      const currentEpoch = await db.query(
        `select epoch from academy.course_progress_epoch where user_id = $1 and course_slug = $2`,
        [owner.id, COURSE],
      )
      const progress = await db.query(
        `select node_id from academy.node_progress where user_id = $1 and course_slug = $2`,
        [owner.id, COURSE],
      )
      const receipts = await db.query(
        `select 1 from academy.course_progress_reset_operation
          where user_id = $1 and course_slug = $2 and operation_id = $3`,
        [owner.id, COURSE, operationId],
      )
      return {
        epoch: Number(currentEpoch.rows[0].epoch),
        nodes: progress.rows.map((row) => row.node_id),
        receipts: receipts.rowCount,
      }
    })
    expect(state).toEqual({
      epoch,
      nodes: ['n-after-idempotent-reset'],
      receipts: 1,
    })
  })

  it('reset receipts ถูกจำกัดที่ 128 แถวต่อผู้เรียนและคอร์ส', async () => {
    await withDb((db) =>
      db.query(
        `select academy.reset_course_progress($1, $2, gen_random_uuid())
           from generate_series(1, 140)`,
        [owner.id, COURSE],
      ),
    )
    const receipts = await withDb((db) =>
      db.query(
        `select count(*)::int as count
           from academy.course_progress_reset_operation
          where user_id = $1 and course_slug = $2`,
        [owner.id, COURSE],
      ),
    )
    expect(receipts.rows[0].count).toBe(128)
  })

  it('revoke ที่ commit ก่อน RPC lock ทำให้ reset ปฏิเสธโดยไม่ลบ progress', async () => {
    const nodeId = 'n-reset-after-revoke'
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId,
      status: 'in-progress',
    })
    const control = new Client({
      connectionString: requiredEnv('TEST_DATABASE_URL'),
    })
    await control.connect()
    try {
      await control.query('begin')
      await control.query(
        `update academy.course_entitlement set revoked_at = now()
          where user_id = $1 and course_slug = $2`,
        [owner.id, COURSE],
      )
      const pending = reset()
      await new Promise((resolve) => setTimeout(resolve, 100))
      await control.query('commit')
      await expect(pending).resolves.toBe(false)
      await expect(
        withDb((db) => db.query(`select academy.reset_course_progress($1, $2)`, [owner.id, COURSE])),
      ).rejects.toThrow(/course access denied/)

      const progress = await withDb((db) =>
        db.query(
          `select 1 from academy.node_progress
            where user_id = $1 and course_slug = $2 and node_id = $3`,
          [owner.id, COURSE, nodeId],
        ),
      )
      expect(progress.rowCount).toBe(1)
    } finally {
      await control.query('rollback').catch(() => undefined)
      await control.end()
      await withDb((db) =>
        db.query(
          `update academy.course_entitlement set revoked_at = null
            where user_id = $1 and course_slug = $2`,
          [owner.id, COURSE],
        ),
      )
    }
  })

  it('suspend ที่ commit ก่อน RPC lock ทำให้ reset ปฏิเสธโดยไม่ลบ progress', async () => {
    const nodeId = 'n-reset-after-suspend'
    await recordNodeEvent(owner.id, {
      slug: COURSE,
      nodeId,
      status: 'in-progress',
    })
    const control = new Client({
      connectionString: requiredEnv('TEST_DATABASE_URL'),
    })
    await control.connect()
    try {
      await control.query('begin')
      await control.query(
        `update academy.service_activation set status = 'suspended', revision = revision + 1
          where user_id = $1`,
        [owner.id],
      )
      const pending = reset()
      await new Promise((resolve) => setTimeout(resolve, 100))
      await control.query('commit')
      await expect(pending).resolves.toBe(false)

      const progress = await withDb((db) =>
        db.query(
          `select 1 from academy.node_progress
            where user_id = $1 and course_slug = $2 and node_id = $3`,
          [owner.id, COURSE, nodeId],
        ),
      )
      expect(progress.rowCount).toBe(1)
    } finally {
      await control.query('rollback').catch(() => undefined)
      await control.end()
      await withDb((db) =>
        db.query(
          `update academy.service_activation set status = 'active'
            where user_id = $1`,
          [owner.id],
        ),
      )
    }
  })

  it('ลายเซ็น finalize รุ่นเก่าที่ไม่มี fencing token ถูกถอดออกแล้ว', async () => {
    const res = await withDb((db) =>
      db.query(`select to_regprocedure('academy.finalize_attempt(uuid,uuid,jsonb)') as old_signature`),
    )
    expect(res.rows[0].old_signature).toBeNull()
  })
})
