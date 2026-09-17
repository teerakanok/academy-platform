import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

// Migration 0040 against a real local Supabase Postgres (npx supabase start).
// The same checks were run in-process against PGlite for the lane evidence
// because Docker was unavailable; keep both in step.

const ISSUER = 'https://free-enrolment.test'
const SUBJECTS = {
  active: '71111111-1111-4111-8111-111111111111',
  pending: '72222222-2222-4222-8222-222222222222',
  revoked: '73333333-3333-4333-8333-333333333333',
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

async function asRole(db: Client, role: string, sql: string, values: unknown[] = []) {
  await db.query('begin')
  try {
    await db.query(`set local role ${role}`)
    const result = await db.query(sql, values)
    await db.query('commit')
    return { ok: true as const, rows: result.rows }
  } catch (error) {
    await db.query('rollback')
    const failure = error as { code?: string; message?: string }
    return { ok: false as const, code: failure.code, message: failure.message }
  }
}

async function createUser(db: Client, subject: string, activation: string | null): Promise<string> {
  const { rows } = await db.query(
    `insert into academy.users(issuer, subject, email) values ($1, $2, $3) returning id`,
    [ISSUER, subject, `${subject}@example.com`],
  )
  if (activation) {
    await db.query(
      `insert into academy.service_activation(user_id, status, revision) values ($1, $2, 1)`,
      [rows[0].id, activation],
    )
  }
  return rows[0].id
}

async function cleanup() {
  await withDb(async (db) => {
    const users = await db.query(`select id from academy.users where issuer = $1`, [ISSUER])
    const ids = users.rows.map((row) => row.id)
    if (ids.length === 0) return
    await db.query(`delete from academy.course_entitlement_audit where account_id = any($1::uuid[])`, [ids])
    await db.query(`delete from academy.course_entitlement where user_id = any($1::uuid[])`, [ids])
    await db.query(`delete from academy.service_activation where user_id = any($1::uuid[])`, [ids])
    await db.query(`delete from academy.users where id = any($1::uuid[])`, [ids])
  })
}

beforeAll(cleanup)
afterAll(cleanup)

describe('academy.enrol_free_course', () => {
  it('enforces the database free offer, activation, idempotency, audit and privileges', async () => {
    await withDb(async (db) => {
      const active = await createUser(db, SUBJECTS.active, 'active')
      const pending = await createUser(db, SUBJECTS.pending, 'pending')
      const revoked = await createUser(db, SUBJECTS.revoked, 'active')
      const enrol = (id: string, slug: string) =>
        asRole(db, 'academy_runtime', `select academy.enrol_free_course($1, $2) as result`, [id, slug])

      const notFree = await enrol(active, 'cissp')
      expect(notFree).toMatchObject({ ok: false, code: '42501' })

      expect(await enrol(pending, 'git-essentials')).toMatchObject({ ok: false, code: '55000' })

      const first = await enrol(active, 'git-essentials')
      expect(first).toMatchObject({ ok: true, rows: [{ result: { enrolled: true, changed: true, source: 'free' } }] })
      const repeat = await enrol(active, 'git-essentials')
      expect(repeat).toMatchObject({ ok: true, rows: [{ result: { enrolled: true, changed: false, source: 'free' } }] })

      const audit = await db.query(
        `select action, source, actor_account_id, authorization_reference
           from academy.course_entitlement_audit where account_id = $1`,
        [active],
      )
      expect(audit.rows).toEqual([
        { action: 'granted', source: 'free', actor_account_id: active, authorization_reference: 'self-enrol:free-offer' },
      ])

      await db.query(
        `insert into academy.course_entitlement(user_id, course_slug, source, revoked_at) values ($1, 'assembly', 'grant', now())`,
        [revoked],
      )
      expect(await enrol(revoked, 'assembly')).toMatchObject({ ok: false, code: '42501' })

      for (const role of ['service_role', 'academy_entitlement_operator', 'academy_staff_admin']) {
        expect(await asRole(db, role, `select academy.enrol_free_course($1, 'git-essentials')`, [active]))
          .toMatchObject({ ok: false, code: '42501' })
      }
      expect(await asRole(db, 'academy_runtime', `insert into academy.course_offer(course_slug, model) values ('cissp', 'free')`))
        .toMatchObject({ ok: false, code: '42501' })
    })
  })
})
