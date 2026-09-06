import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { requiredEnv } from './setup'

const ISSUER = 'https://entitlement-hardening.test'
const ACTOR_SUBJECT = '11111111-1111-4111-8111-111111111111'
const LEARNER_SUBJECT = '22222222-2222-4222-8222-222222222222'

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function createUser(subject: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query(
      `insert into academy.users(issuer, subject, email) values ($1, $2, $3) returning id`,
      [ISSUER, subject, `${subject}@example.com`],
    )
    return result.rows[0].id
  })
}

async function asOperator<T>(db: Client, query: string, values: unknown[] = []): Promise<T> {
  await db.query('begin')
  try {
    await db.query('set local role academy_entitlement_operator')
    const result = await db.query(query, values)
    await db.query('commit')
    return result.rows[0] as T
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

async function cleanup() {
  await withDb(async (db) => {
    const users = await db.query(`select id from academy.users where issuer = $1`, [ISSUER])
    const ids = users.rows.map((row) => row.id)
    if (ids.length === 0) return
    await db.query(
      `delete from academy.course_entitlement_audit
        where account_id = any($1::uuid[]) or actor_account_id = any($1::uuid[])`,
      [ids],
    )
    await db.query(`delete from academy.course_entitlement where user_id = any($1::uuid[])`, [ids])
    await db.query(
      `delete from academy.staff_role_audit where account_id = any($1::uuid[]) or actor_account_id = any($1::uuid[])`,
      [ids],
    )
    await db.query(`delete from academy.staff_role_assignment where account_id = any($1::uuid[])`, [ids])
    await db.query(`delete from academy.users where id = any($1::uuid[])`, [ids])
  })
}

beforeAll(cleanup)
afterAll(cleanup)

describe('audited course entitlement operator', () => {
  it('grants and revokes idempotently with owner authorization and audit', async () => {
    const owner = await createUser(ACTOR_SUBJECT)
    const learner = await createUser(LEARNER_SUBJECT)

    await withDb(async (db) => {
      await db.query('begin')
      await db.query('set local role academy_staff_admin')
      await db.query(`select academy.set_staff_role($1, $1, 'owner', true, 'TEST-ENTITLEMENT-OWNER')`, [owner])
      await db.query('commit')

      const resolved = await asOperator<{ account_id: string }>(
        db,
        `select academy.resolve_entitlement_account($1, $2, $3)::text as account_id`,
        [ISSUER, LEARNER_SUBJECT, `${LEARNER_SUBJECT}@example.com`],
      )
      expect(resolved.account_id).toBe(learner)

      expect((await asOperator<{ changed: boolean }>(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', null, 'TEST-ENTITLEMENT-GRANT') as changed`,
        [owner, learner],
      )).changed).toBe(true)
      expect((await asOperator<{ changed: boolean }>(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', null, 'TEST-ENTITLEMENT-REPEAT') as changed`,
        [owner, learner],
      )).changed).toBe(false)
      expect((await db.query(`select academy.has_course_entitlement($1, 'setup-and-environment') as allowed`, [learner])).rows[0].allowed).toBe(true)

      expect((await asOperator<{ changed: boolean }>(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', false, 'grant', null, 'TEST-ENTITLEMENT-REVOKE') as changed`,
        [owner, learner],
      )).changed).toBe(true)
      expect((await asOperator<{ changed: boolean }>(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', false, 'grant', null, 'TEST-ENTITLEMENT-REVOKE-REPEAT') as changed`,
        [owner, learner],
      )).changed).toBe(false)
      expect((await db.query(`select academy.has_course_entitlement($1, 'setup-and-environment') as allowed`, [learner])).rows[0].allowed).toBe(false)

      const audit = await db.query(
        `select action, authorization_reference from academy.course_entitlement_audit
          where account_id = $1 and actor_account_id = $2 order by event_id`,
        [learner, owner],
      )
      expect(audit.rows).toEqual([
        { action: 'granted', authorization_reference: 'TEST-ENTITLEMENT-GRANT' },
        { action: 'revoked', authorization_reference: 'TEST-ENTITLEMENT-REVOKE' },
      ])
    })
  })

  it('rejects an entitlement change after a concurrent owner revocation commits', async () => {
    const actor = await createUser(randomUUID())
    const revoker = await createUser(randomUUID())
    const learner = await createUser(randomUUID())
    await withDb(async (db) => {
      await db.query(`insert into academy.staff_role_assignment(account_id, role, granted_by)
        values ($1, 'owner', $1), ($2, 'owner', $2)`, [actor, revoker])
      await withDb(async (grantDb) => {
        const pid = (await grantDb.query('select pg_backend_pid() as pid')).rows[0].pid
        await db.query('begin')
        let pending: Promise<{ changed?: boolean; error?: unknown }> | undefined
        try {
          await db.query('set local role academy_staff_admin')
          await db.query(`select academy.set_staff_role($1, $2, 'owner', false, 'TEST-CONCURRENT-REVOKE')`, [revoker, actor])
          let settled = false
          pending = asOperator<{ changed: boolean }>(grantDb,
            `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', null, 'TEST-CONCURRENT-GRANT') as changed`,
            [actor, learner]).then(value => { settled = true; return value }, error => { settled = true; return { error } })
          // Observe the competing query waiting, rather than relying on a sleep race.
          await withDb(async monitor => {
            for (let attempt = 0; attempt < 100 && !settled; attempt++) {
              const state = await monitor.query('select wait_event_type from pg_stat_activity where pid = $1', [pid])
              if (state.rows[0]?.wait_event_type === 'Lock') return
              await new Promise(resolve => setTimeout(resolve, 20))
            }
          })
          await db.query('commit')
          const outcome = await pending
          expect(outcome.error).toBeInstanceOf(Error)
          expect(String(outcome.error)).toMatch(/owner staff role required/)
          const result = await db.query('select count(*)::int as count from academy.course_entitlement where user_id = $1', [learner])
          expect(result.rows[0].count).toBe(0)
        } finally {
          await db.query('rollback')
          if (pending) await pending
        }
      })
    })
  })

  it('keeps entitlement evidence when account purge deletes actor and target', async () => {
    const owner = await createUser(randomUUID())
    const learner = await createUser(randomUUID())
    await withDb(async (db) => {
      await db.query(`insert into academy.staff_role_assignment(account_id, role, granted_by)
        values ($1, 'owner', $1)`, [owner])
      await asOperator(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', null, 'TEST-PURGE-ACTOR-TARGET')`,
        [owner, learner],
      )
      await db.query(
        `update academy.users set last_seen_at = now() - interval '3 years' where id = any($1::uuid[])`,
        [[owner, learner]],
      )
      await db.query(`update academy.staff_role_assignment set revoked_at = now(), revoked_by = $1 where account_id = $1 and role = 'owner'`, [owner])
      expect((await db.query(`select academy.purge_inactive_users(2, 500) as deleted`)).rows[0].deleted).toBe(2)
      const audit = await db.query(
        `select account_id, actor_account_id, action from academy.course_entitlement_audit
          where authorization_reference = 'TEST-PURGE-ACTOR-TARGET'`,
      )
      expect(audit.rows).toEqual([{ account_id: learner, actor_account_id: owner, action: 'granted' }])
      await db.query(`delete from academy.course_entitlement_audit where authorization_reference = 'TEST-PURGE-ACTOR-TARGET'`)
    })
  })

  it.each(['revoked_at', 'expires_at'])('holds entitlement evidence until the retention boundary after %s', async (endingColumn) => {
    const owner = await createUser(randomUUID())
    const learner = await createUser(randomUUID())
    await withDb(async (db) => {
      await db.query(`insert into academy.staff_role_assignment(account_id, role, granted_by)
        values ($1, 'owner', $1)`, [owner])
      await asOperator(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', null, 'TEST-EXPIRE-ENTITLEMENT')`,
        [owner, learner],
      )
      const auditId = (await db.query(
        `select event_id from academy.course_entitlement_audit where authorization_reference = 'TEST-EXPIRE-ENTITLEMENT'`,
      )).rows[0].event_id

      await db.query(
        `update academy.course_entitlement_audit set occurred_at = now() - interval '3 years 1 day' where event_id = $1`,
        [auditId],
      )
      await db.query('begin')
      try {
        await db.query('set local role academy_entitlement_operator')
        await expect(db.query(`select academy.purge_expired_course_entitlement_history(3, 500)`))
          .rejects.toThrow(/permission denied/)
      } finally {
        await db.query('rollback')
      }
      expect((await db.query(`select count(*)::int as count from academy.course_entitlement_audit where event_id = $1`, [auditId])).rows[0].count).toBe(1)

      const purge = async () => {
        await db.query('begin')
        try {
          await db.query('set local role academy_retention')
          const result = await db.query(`select academy.run_retention_course_entitlement_history() as deleted`)
          await db.query('commit')
          return result.rows[0].deleted
        } catch (error) { await db.query('rollback'); throw error }
      }
      // Match existing staff authorization history: active and recently ended authority is held.
      expect(await purge()).toBe(0)
      await db.query(`update academy.course_entitlement set ${endingColumn} = now() where user_id = $1`, [learner])
      expect(await purge()).toBe(0)
      await db.query(`update academy.course_entitlement set ${endingColumn} = now() - interval '3 years 1 day' where user_id = $1`, [learner])
      expect(await purge()).toBe(1)
      expect((await db.query(`select count(*)::int as count from academy.course_entitlement_audit where event_id = $1`, [auditId])).rows[0].count).toBe(0)
    })
  })

  it('rejects an expired grant timestamp without writing entitlement or audit evidence', async () => {
    const owner = await createUser(randomUUID())
    const learner = await createUser(randomUUID())
    await withDb(async (db) => {
      await db.query(`insert into academy.staff_role_assignment(account_id, role, granted_by)
        values ($1, 'owner', $1)`, [owner])
      await expect(asOperator(
        db,
        `select academy.set_course_entitlement($1, $2, 'setup-and-environment', true, 'grant', now() - interval '1 second', 'TEST-EXPIRED-GRANT-DENY')`,
        [owner, learner],
      )).rejects.toThrow(/invalid course entitlement input/)
      expect((await db.query(`select count(*)::int as count from academy.course_entitlement where user_id = $1`, [learner])).rows[0].count).toBe(0)
      expect((await db.query(`select count(*)::int as count from academy.course_entitlement_audit where account_id = $1`, [learner])).rows[0].count).toBe(0)
    })
  })

  it('refuses a colliding operator role before adopting or changing it', async () => {
    const migration = readFileSync(new URL('../../supabase/migrations/0030_least_privilege_course_entitlement.sql', import.meta.url), 'utf8')
    const roleSetup = migration.split('-- Migration 0018')[0]
    await withDb(async db => {
      await db.query('begin')
      try {
        await db.query('alter role academy_entitlement_operator rename to entitlement_test_original')
        await db.query('create role academy_entitlement_operator nologin createrole')
        await expect(db.query(roleSetup)).rejects.toThrow(/operator role already exists/)
      } finally {
        await db.query('rollback')
      }
    })
  })

  it('refuses unexpected existing staff administrator authority', async () => {
    const migration = readFileSync(new URL('../../supabase/migrations/0030_least_privilege_course_entitlement.sql', import.meta.url), 'utf8')
    await withDb(async db => {
      await db.query('begin')
      try {
        await db.query('alter role academy_entitlement_operator rename to entitlement_test_original')
        await db.query('alter role academy_staff_admin login createrole')
        await expect(db.query(migration.split('-- Migration 0018')[0])).rejects.toThrow(/unexpected staff administrator role state/)
      } finally {
        await db.query('rollback')
      }
    })
  })

  it('clears any subsequently provisioned staff credential on rollback', async () => {
    const rollback = readFileSync(new URL('../../supabase/rollbacks/0030_least_privilege_course_entitlement.rollback.sql', import.meta.url), 'utf8')
    await withDb(async db => {
      await db.query('begin')
      try {
        // Disposable fixture credential; only presence is inspected.
        await db.query(`alter role academy_staff_admin password '${randomUUID()}'`)
        await db.query(rollback.replace(/^\s*(?:begin|commit);\s*$/gmi, ''))
        const state = await db.query(`select rolcanlogin as login, rolpassword is null as cleared
          from pg_authid where rolname = 'academy_staff_admin'`)
        expect(state.rows[0]).toEqual({ login: false, cleared: true })
      } finally {
        await db.query('rollback')
      }
    })
  })

  it('keeps direct mutation and privileged RPCs unavailable to runtime and service roles', async () => {
    await withDb(async (db) => {
      const result = await db.query(`
        select
          has_table_privilege('academy_runtime', 'academy.course_entitlement', 'insert') as runtime_insert,
          has_table_privilege('academy_runtime', 'academy.course_entitlement', 'update') as runtime_update,
          has_table_privilege('service_role', 'academy.course_entitlement', 'insert') as service_insert,
          has_table_privilege('service_role', 'academy.course_entitlement', 'update') as service_update,
          has_table_privilege('service_role', 'academy.course_entitlement', 'select') as service_select,
          has_function_privilege('academy_runtime', 'academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)', 'execute') as runtime_set,
          has_function_privilege('service_role', 'academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)', 'execute') as service_set,
          has_function_privilege('service_role', 'academy.has_staff_role(uuid, text)', 'execute') as service_staff,
          has_function_privilege('service_role', 'academy.sync_service_activation(uuid, text, integer)', 'execute') as service_sync,
          has_function_privilege('academy_runtime', 'academy.sync_service_activation(uuid, text, integer)', 'execute') as runtime_sync
      `)
      expect(result.rows[0]).toEqual({
        runtime_insert: false,
        runtime_update: false,
        service_insert: false,
        service_update: false,
        service_select: false,
        runtime_set: false,
        service_set: false,
        service_staff: false,
        service_sync: false,
        runtime_sync: true,
      })
    })
  })
})
