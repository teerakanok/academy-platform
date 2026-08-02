import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { findOrCreateUser } from '@/lib/account/users'
import { consumeAttempt, issueAttempt } from '@/lib/course/attempt-db'
import { cryptoPick, type AttemptParams } from '@/lib/course/attempt'
import { gradeSimulation, type SimulationChallenge } from '@/lib/simulation/types'
import { resolveChallenge, rollVariables } from '@/lib/simulation/variables'

// W1 — โจทย์จำลองผูกกับ attempt (เกณฑ์รับงานที่ e2e ทำไม่ได้เพราะชนโควตา)
//
// โควตา 3 ครั้ง/30 นาที ต่อ (user, node) ทำให้ e2e ที่ใช้บัญชีเดียวออก attempt
// หลายตัวไม่ได้ · ที่นี่ล้างแถวได้ระหว่างเทส จึงพิสูจน์เคสที่เหลือได้ครบ:
//   · ส่งค่าที่ถูกของ attempt อื่น → ไม่ผ่าน
//   · attempt ของผู้ใช้คนอื่น / ใช้ซ้ำ / id มั่ว → ถูกปฏิเสธ

const ISS = 'https://attempt-sim-test.local'
const COURSE = 'sim-attempt-course'
const NODE = 'sim-node'
const CHALLENGE_ID = 'checkpoint'

const CHALLENGE: SimulationChallenge = {
  id: 'sim-1',
  title: 'ตั้งค่าที่อยู่คงที่',
  brief: 'ต้องเข้าถึงได้ที่ {{targetIp}} เสมอ',
  surface: 'network-interface',
  initial: { addressMode: 'dhcp' },
  variables: { targetIp: { kind: 'ipv4-host', network: '192.168.10', min: 40, max: 60 } },
  requirements: [
    { id: 'r-mode', label: 'คงที่', field: 'addressMode', operator: 'equals', value: 'static' },
    { id: 'r-ip', label: 'ที่อยู่ {{targetIp}}', field: 'ipv4', operator: 'equals', value: '{{targetIp}}' },
  ],
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

let learner: { id: string }
let other: { id: string }

async function cleanup() {
  await withDb(async (db) => {
    await db.query(`delete from academy.attempt where course_slug = $1`, [COURSE])
    await db.query(`delete from academy.users where issuer = $1`, [ISS])
  })
}

beforeAll(async () => {
  await cleanup()
  learner = await findOrCreateUser({ issuer: ISS, subject: 'learner', email: 'sim-learner@example.com' })
  other = await findOrCreateUser({ issuer: ISS, subject: 'other', email: 'sim-other@example.com' })
})
afterAll(cleanup)

// ล้าง attempt ก่อนทุกเทส — โควตานับจากแถวใน DB จึงต้องเริ่มจากศูนย์ทุกครั้ง
beforeEach(async () => {
  await withDb((db) => db.query(`delete from academy.attempt where course_slug = $1`, [COURSE]))
})

function ctx(userId = learner.id) {
  return { userId, courseSlug: COURSE, nodeId: NODE, challengeId: CHALLENGE_ID }
}

/** ออก attempt ที่ snapshot โจทย์ทั้งชิ้นหลังแทนค่า เหมือนที่ `/api/attempts` ทำ */
async function issueWithVars(userId = learner.id) {
  const vars = rollVariables(CHALLENGE.variables, cryptoPick)
  const challenge = resolveChallenge(CHALLENGE, vars)
  expect(challenge, 'แทนค่าตัวแปรไม่ครบ').not.toBeNull()
  const params: AttemptParams = {
    questionIds: [],
    keyMaps: {},
    answerKeys: {},
    simulations: [{ id: 'sim-1', challenge: challenge! }],
  }
  const issued = await issueAttempt(ctx(userId), params, 'v1')
  expect(issued).not.toBeNull()
  return { attemptId: issued!.attemptId, targetIp: vars.targetIp }
}

/** ตรวจเหมือนที่ `/api/progress` ทำ: consume แล้วใช้ **โจทย์ที่ attempt ถือเอง** */
async function gradeWithAttempt(attemptId: string, submittedIp: string, userId = learner.id) {
  const consumed = await consumeAttempt(ctx(userId), attemptId)
  if (!consumed) return { rejected: true as const }
  const snapshot = consumed.params.simulations?.find((s) => s.id === 'sim-1')
  if (!snapshot) return { rejected: true as const }
  const verdict = gradeSimulation(snapshot.challenge, { addressMode: 'static', ipv4: submittedIp })
  return { rejected: false as const, passed: verdict.passed }
}

describe('โจทย์จำลองผูกกับ attempt', () => {
  it('ทำตามโจทย์ของ attempt ตัวเอง → ผ่าน', async () => {
    const mine = await issueWithVars()
    expect(await gradeWithAttempt(mine.attemptId, mine.targetIp)).toEqual({ rejected: false, passed: true })
  })

  it('🔴 ส่งค่าที่ถูกของ attempt อื่น → ไม่ผ่าน (พารามิเตอร์คนละชุด)', async () => {
    // ออกจนได้สอง attempt ที่ค่าเป้าหมายต่างกันจริง (ช่วงสุ่ม 21 ค่า)
    const mine = await issueWithVars()
    let theirs = await issueWithVars()
    for (let i = 0; i < 10 && theirs.targetIp === mine.targetIp; i++) {
      await withDb((db) => db.query(`delete from academy.attempt where attempt_id = $1`, [theirs.attemptId]))
      theirs = await issueWithVars()
    }
    expect(theirs.targetIp, 'สุ่มไม่เคยได้ค่าต่างเลย — ตัวสุ่มน่าจะพัง').not.toBe(mine.targetIp)

    // ใช้ attempt ของตัวเอง แต่ตั้งค่าตามโจทย์ของ attempt อื่น
    expect(await gradeWithAttempt(mine.attemptId, theirs.targetIp)).toEqual({ rejected: false, passed: false })
  })

  it('🔴 attempt ของผู้ใช้คนอื่นใช้ไม่ได้ และไม่ถูกเผาทิ้ง', async () => {
    const mine = await issueWithVars()
    expect(await gradeWithAttempt(mine.attemptId, mine.targetIp, other.id)).toEqual({ rejected: true })
    // เจ้าของยังใช้ได้ตามปกติ
    expect(await gradeWithAttempt(mine.attemptId, mine.targetIp)).toEqual({ rejected: false, passed: true })
  })

  it('🔴 attempt ใช้ซ้ำไม่ได้', async () => {
    const mine = await issueWithVars()
    expect((await gradeWithAttempt(mine.attemptId, mine.targetIp)).rejected).toBe(false)
    expect(await gradeWithAttempt(mine.attemptId, mine.targetIp)).toEqual({ rejected: true })
  })

  it('🔴 attempt id ที่มั่วขึ้นเอง → ถูกปฏิเสธ', async () => {
    await issueWithVars()
    expect(await gradeWithAttempt('00000000-0000-4000-8000-000000000000', '192.168.10.50')).toEqual({
      rejected: true,
    })
  })

  it('ค่าที่สุ่มถูกเก็บใน attempt จริง ไม่ได้คำนวณใหม่ตอนตรวจ', async () => {
    const mine = await issueWithVars()
    const row = await withDb((db) =>
      db.query(`select params from academy.attempt where attempt_id = $1`, [mine.attemptId]),
    )
    // โจทย์ทั้งชิ้นถูกเก็บไว้ ไม่ใช่แค่ค่าตัวแปร — กติกาการตรวจจึงไม่ขึ้นกับไฟล์ปัจจุบัน
    const stored = row.rows[0].params.simulations[0]
    expect(stored.id).toBe('sim-1')
    expect(stored.challenge.brief).toContain(mine.targetIp)
    expect(stored.challenge.requirements.find((r: { id: string }) => r.id === 'r-ip').value).toBe(
      mine.targetIp,
    )
  })
})
