import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { findOrCreateUser, setDisplayName } from '@/lib/account/users'

// บัญชี + การผูก waitlist — ทดสอบกับ DB จริง (local) เพราะสิ่งที่ต้องพิสูจน์คือ
// constraint และพฤติกรรมของ unique/RLS ซึ่ง mock พิสูจน์ไม่ได้

const ISS = 'https://test-issuer.local'

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function cleanup() {
  await withDb(async (db) => {
    await db.query(`delete from academy.node_progress where user_id in (select id from academy.users where issuer = $1)`, [ISS])
    await db.query(`update academy.leads set user_id = null where email like 'acct-test-%'`)
    await db.query(`delete from academy.users where issuer = $1`, [ISS])
    await db.query(`delete from academy.leads where email like 'acct-test-%'`)
  })
}

beforeAll(cleanup)
afterAll(cleanup)

describe('บัญชี Academy', () => {
  it('สร้างบัญชีใหม่จาก (issuer, subject) แล้วเรียกซ้ำได้บัญชีเดิม', async () => {
    const claims = { issuer: ISS, subject: 'sub-1', email: 'Acct-Test-1@Example.com' }
    const first = await findOrCreateUser(claims)
    expect(first.id).toBeTruthy()
    // อีเมลถูก normalize ก่อนเก็บ — CHECK ใน migration จะปฏิเสธถ้าไม่ normalize
    expect(first.email).toBe('acct-test-1@example.com')

    const second = await findOrCreateUser(claims)
    expect(second.id).toBe(first.id)
  })

  it('subject เดิม + อีเมลใหม่ = คนเดิม (อีเมลไม่ใช่ตัวตน)', async () => {
    const created = await findOrCreateUser({ issuer: ISS, subject: 'sub-2', email: 'acct-test-2@example.com' })
    const renamed = await findOrCreateUser({ issuer: ISS, subject: 'sub-2', email: 'acct-test-2b@example.com' })
    expect(renamed.id).toBe(created.id)
    expect(renamed.email).toBe('acct-test-2b@example.com')
  })

  it('อีเมลเดียวกันแต่ subject ต่างกัน = คนละบัญชี', async () => {
    // นี่คือกรณีที่ทำให้ Forge พลาด: ถ้า join ด้วยอีเมล สองคนนี้จะกลายเป็นคนเดียวกัน
    const a = await findOrCreateUser({ issuer: ISS, subject: 'sub-3a', email: 'acct-test-3@example.com' })
    const b = await findOrCreateUser({ issuer: ISS, subject: 'sub-3b', email: 'acct-test-3@example.com' })
    expect(b.id).not.toBe(a.id)
  })

  it('ผูก waitlist lead ที่ใช้อีเมลเดียวกัน ครั้งเดียวตอนสมัคร', async () => {
    const email = 'acct-test-4@example.com'
    await withDb((db) =>
      db.query(
        `insert into academy.leads (email, consent_at, consent_text_version) values ($1, now(), 'v1')`,
        [email],
      ),
    )
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-4', email })
    const linked = await withDb((db) => db.query(`select user_id from academy.leads where email = $1`, [email]))
    expect(linked.rows[0].user_id).toBe(user.id)
  })

  it('ชื่อบนใบรับรองว่างได้ตอนสมัคร แล้วค่อยเติม', async () => {
    // อย่ากั้นการสมัครด้วยฟิลด์ที่ยังไม่จำเป็น — ขอตอนจะออกใบก็ทันเวลา
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-5', email: 'acct-test-5@example.com' })
    expect(user.displayName).toBeNull()
    await setDisplayName(user.id, '  Songpon Teerakanok  ')
    const row = await withDb((db) => db.query(`select display_name from academy.users where id = $1`, [user.id]))
    expect(row.rows[0].display_name).toBe('Songpon Teerakanok')
  })

  it('ชื่อว่างล้วนถูกปฏิเสธ', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-6', email: 'acct-test-6@example.com' })
    await expect(setDisplayName(user.id, '   ')).rejects.toThrow()
  })
})

describe('RLS ของตารางใหม่ — default deny เหมือน leads', () => {
  it.each(['users', 'node_progress'])('%s เปิด RLS และมี policy = 0', async (table) => {
    const res = await withDb((db) =>
      db.query(
        `select c.relrowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = $1`,
        [table],
      ),
    )
    expect(res.rows[0].relrowsecurity).toBe(true)
    expect(Number(res.rows[0].policies)).toBe(0)
  })

  it.each(['users', 'node_progress'])('%s ไม่ให้สิทธิ์ anon/authenticated', async (table) => {
    const res = await withDb((db) =>
      db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'academy' and table_name = $1
            and grantee in ('anon', 'authenticated')`,
        [table],
      ),
    )
    expect(res.rows).toEqual([])
  })
})
