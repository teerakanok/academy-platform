import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { findOrCreateUser } from '@/lib/account/users'
import {
  consumeAttempt,
  finalizeAttempt,
  issueAttempt,
  attemptQuota,
  ATTEMPT_WINDOW_MINUTES,
  ATTEMPT_TTL_MINUTES,
} from '@/lib/course/attempt-db'
import type { AttemptParams } from '@/lib/course/attempt'
import { recordNodeEvent } from '@/lib/course/progress-db'

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
    expect(QUOTA).toBe(3)
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

  it(`โควตา: ครั้งที่ ${QUOTA + 1} ในหน้าต่างเวลาถูกปฏิเสธ — และตัวนับอยู่ใน DB ไม่ใช่ memory`, async () => {
    for (let i = 0; i < QUOTA; i++) {
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
      Array.from({ length: QUOTA + 3 }, () =>
        issueAttempt(ctx('n-quota-race'), SAMPLE_PARAMS, '1.0.0'),
      ),
    )
    expect(results.filter((r) => r !== null)).toHaveLength(QUOTA)
  })

  it('หน้าต่างเวลาเลื่อนจริง: attempt ที่แก่กว่า 30 นาทีไม่ถูกนับ โควตาเปิดใหม่', async () => {
    for (let i = 0; i < QUOTA; i++) {
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
    // ลายเซ็นใหม่ตั้งแต่ 0008 (เพิ่มตัวชี้ว่าผ่านด้วย attempt ไหน) — รุ่นเก่าถูก drop ทิ้ง
    'academy.record_node_progress(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text)',
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
        'sim-b': { passed: true, requirements: [{ id: 'r9', met: true }], challengeVersion: '1.1.0', at: '2026-08-02T01:00:00.000Z' },
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
    expect(await merge({}, { a: { passed: true, v: 1 } })).toEqual({ a: { passed: true, v: 1 } })
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
    expect(await merge({ a: { passed: true, v: 1 } }, {})).toEqual({ a: { passed: true, v: 1 } })
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
    await recordNodeEvent(owner.id, { slug: COURSE, nodeId: NODE, status: 'in-progress' })
    expect(await pointerOf(NODE)).toEqual(before)
  })

  it('บทที่ผ่านโดยไม่มี attempt (บทสอนทั่วไป) → ตัวชี้เป็น null ไม่ใช่ค่ามั่ว', async () => {
    await recordNodeEvent(owner.id, { slug: COURSE, nodeId: 'n-plain', status: 'completed' })
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
    expect(await consumeAttempt(ctx(NODE), issued!.attemptId)).toBeNull()
  })

  it('🔴 finalize แล้ว → ส่งซ้ำได้ผลเดิม ไม่ใช่ตรวจใหม่', async () => {
    const NODE = 'n-finalize-idempotent'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx(NODE), issued!.attemptId)
    await finalizeAttempt(owner.id, issued!.attemptId, { passed: true })
    await ageClaim(issued!.attemptId, 60)

    const again = await consumeAttempt(ctx(NODE), issued!.attemptId)
    expect(again, 'attempt ที่จบแล้วต้องคืนผลเดิมให้ route ตัดสินใจ').not.toBeNull()
    expect(again!.outcome).toEqual({ passed: true })
  })

  it('🔴 finalize เขียนได้ครั้งเดียว — ผลที่บันทึกไว้แล้วทับไม่ได้', async () => {
    const NODE = 'n-finalize-once'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx(NODE), issued!.attemptId)
    await finalizeAttempt(owner.id, issued!.attemptId, { passed: false })
    await finalizeAttempt(owner.id, issued!.attemptId, { passed: true })

    const row = await withDb((db) =>
      db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId]),
    )
    expect(row.rows[0].outcome).toEqual({ passed: false })
  })

  it('🔴 finalize ของคนอื่นไม่มีผล', async () => {
    const NODE = 'n-finalize-owner'
    const issued = await issueAttempt(ctx(NODE), SAMPLE_PARAMS, 'v1')
    await consumeAttempt(ctx(NODE), issued!.attemptId)
    await finalizeAttempt(stranger.id, issued!.attemptId, { passed: true })

    const row = await withDb((db) =>
      db.query(`select outcome from academy.attempt where attempt_id = $1`, [issued!.attemptId]),
    )
    expect(row.rows[0].outcome).toBeNull()
  })
})
