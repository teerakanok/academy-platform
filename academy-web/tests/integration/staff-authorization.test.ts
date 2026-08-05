import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

const ISSUER = 'https://staff-auth.test'

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
    const users = await db.query(`select id from academy.users where issuer = $1`, [ISSUER])
    const ids = users.rows.map((row) => row.id)
    if (ids.length > 0) {
      await db.query(`delete from academy.staff_role_audit where account_id = any($1::uuid[]) or actor_account_id = any($1::uuid[])`, [ids])
      await db.query(`delete from academy.staff_role_assignment where account_id = any($1::uuid[])`, [ids])
      await db.query(`delete from academy.users where id = any($1::uuid[])`, [ids])
    }
  })
}

async function createUser(subject: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query(
      `insert into academy.users(issuer, subject, email)
       values ($1, $2, $3) returning id`,
      [ISSUER, subject, `${subject}@example.com`],
    )
    return result.rows[0].id
  })
}

async function asStaffAdmin<T>(db: Client, query: string, values: unknown[] = []): Promise<T> {
  await db.query('begin')
  try {
    await db.query('set local role academy_staff_admin')
    const result = await db.query(query, values)
    await db.query('commit')
    return result.rows[0] as T
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

beforeAll(cleanup)
afterAll(cleanup)

describe('Academy staff authorization', () => {
  it('bootstrap owner, role grant/revoke, owner inheritance, and audit are enforced', async () => {
    const owner = await createUser('owner')
    const support = await createUser('support')

    await withDb(async (db) => {
      await expect(asStaffAdmin(db, `select academy.set_staff_role($1, $2, 'content-ops', true, 'TEST-BOOTSTRAP-DENY')`, [support, support]))
        .rejects.toThrow(/first assignment/)

      expect((await asStaffAdmin<{ changed: boolean }>(db, `select academy.set_staff_role($1, $1, 'owner', true, 'TEST-BOOTSTRAP-OWNER') as changed`, [owner])).changed).toBe(true)
      expect((await db.query(`select academy.has_staff_role($1, 'privacy-officer') as allowed`, [owner])).rows[0].allowed).toBe(true)

      expect((await asStaffAdmin<{ changed: boolean }>(db, `select academy.set_staff_role($1, $2, 'learner-support', true, 'TEST-GRANT-SUPPORT') as changed`, [owner, support])).changed).toBe(true)
      expect((await db.query(`select academy.has_staff_role($1, 'learner-support') as allowed`, [support])).rows[0].allowed).toBe(true)
      expect((await db.query(`select academy.has_staff_role($1, 'privacy-officer') as allowed`, [support])).rows[0].allowed).toBe(false)

      await expect(asStaffAdmin(db, `select academy.set_staff_role($1, $2, 'content-ops', true, 'TEST-NONOWNER-DENY')`, [support, support]))
        .rejects.toThrow(/owner role required/)
      await expect(asStaffAdmin(db, `select academy.set_staff_role($1, $1, 'owner', false, 'TEST-SELF-REVOKE')`, [owner]))
        .rejects.toThrow(/cannot revoke own owner role/)

      expect((await asStaffAdmin<{ changed: boolean }>(db, `select academy.set_staff_role($1, $2, 'owner', false, 'TEST-ABSENT-OWNER') as changed`, [owner, support])).changed).toBe(false)

      expect((await asStaffAdmin<{ changed: boolean }>(db, `select academy.set_staff_role($1, $2, 'learner-support', false, 'TEST-REVOKE-SUPPORT') as changed`, [owner, support])).changed).toBe(true)
      expect((await asStaffAdmin<{ changed: boolean }>(db, `select academy.set_staff_role($1, $2, 'learner-support', false, 'TEST-REVOKE-REPEAT') as changed`, [owner, support])).changed).toBe(false)
      expect((await db.query(`select academy.has_staff_role($1, 'learner-support') as allowed`, [support])).rows[0].allowed).toBe(false)

      const audit = await db.query(
        `select action from academy.staff_role_audit where account_id in ($1, $2) order by event_id`,
        [owner, support],
      )
      expect(audit.rows.map((row) => row.action)).toEqual(['granted', 'granted', 'revoked'])

      await db.query(`update academy.users set last_seen_at = now() - interval '3 years' where id = $1`, [owner])
      await db.query(`select academy.purge_inactive_users(2, 500)`)
      expect((await db.query(`select count(*)::int as count from academy.users where id = $1`, [owner])).rows[0].count).toBe(1)

      await db.query(`update academy.staff_role_audit set occurred_at = now() - interval '5 years' where account_id = $1 and action = 'granted'`, [support])
      const recentRevocationPurge = await db.query(`select academy.purge_expired_staff_authorization_history(3, 500) as deleted`)
      expect(recentRevocationPurge.rows[0].deleted).toBe(0)
      expect((await db.query(`select count(*)::int as count from academy.staff_role_audit where account_id = $1`, [support])).rows[0].count).toBe(2)

      await db.query(`update academy.staff_role_assignment set revoked_at = now() - interval '3 years 1 day' where account_id = $1 and role = 'learner-support'`, [support])
      await db.query(`update academy.staff_role_audit set occurred_at = now() - interval '3 years 1 day' where account_id = $1`, [support])
      await db.query(`update academy.staff_role_audit set occurred_at = now() - interval '3 years 1 day' where account_id = $1`, [owner])
      const purge = await db.query(`select academy.purge_expired_staff_authorization_history(3, 500) as deleted`)
      expect(purge.rows[0].deleted).toBe(3)
      expect((await db.query(`select count(*)::int as count from academy.staff_role_assignment where account_id = $1`, [support])).rows[0].count).toBe(0)
      expect((await db.query(`select count(*)::int as count from academy.staff_role_audit where account_id = $1`, [support])).rows[0].count).toBe(0)
      expect((await db.query(`select count(*)::int as count from academy.staff_role_audit where account_id = $1`, [owner])).rows[0].count).toBe(1)
    })
  })

  it('browser and runtime roles cannot mutate staff authorization', async () => {
    await withDb(async (db) => {
      const result = await db.query(`
        select
          has_table_privilege('anon', 'academy.staff_role_assignment', 'select') as anon_select,
          has_table_privilege('authenticated', 'academy.staff_role_audit', 'select') as authenticated_select,
          has_function_privilege('anon', 'academy.has_staff_role(uuid, text)', 'execute') as anon_has,
          has_function_privilege('authenticated', 'academy.set_staff_role(uuid, uuid, text, boolean, text)', 'execute') as authenticated_set,
          has_function_privilege('service_role', 'academy.set_staff_role(uuid, uuid, text, boolean, text)', 'execute') as service_set,
          has_function_privilege('academy_staff_admin', 'academy.set_staff_role(uuid, uuid, text, boolean, text)', 'execute') as control_set
      `)
      expect(result.rows[0]).toEqual({
        anon_select: false,
        authenticated_select: false,
        anon_has: false,
        authenticated_set: false,
        service_set: false,
        control_set: true,
      })
    })
  })
})
