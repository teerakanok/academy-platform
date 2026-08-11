import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { AcademyIdentityProfileActivationStore } from '@/lib/identity/profile-activation-store'

const ISSUER = 'https://profile-activation.identity-test.invalid/auth/v1'
const migrationPath = join(process.cwd(), 'supabase/migrations/0024_identity_profile_activation.sql')

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function cleanup(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `delete from academy.course_entitlement where user_id in (
        select id from academy.users where issuer = $1
      )`,
      [ISSUER],
    )
    await client.query(
      `delete from academy.service_activation where user_id in (
        select id from academy.users where issuer = $1
      )`,
      [ISSUER],
    )
    await client.query(`delete from academy.users where issuer = $1`, [ISSUER])
  })
}

function pgRpcClient() {
  return {
    async rpc(functionName: string, parameters: Record<string, unknown>) {
      if (functionName !== 'commit_identity_profile_activation') {
        return { data: null, error: new Error('unexpected RPC') }
      }
      try {
        const result = await withDb((client) => client.query(
          `select academy.commit_identity_profile_activation($1, $2, $3, $4, $5) as account_id`,
          [
            parameters.p_issuer,
            parameters.p_subject,
            parameters.p_verified_email,
            parameters.p_status,
            parameters.p_revision,
          ],
        ))
        return { data: result.rows[0]?.account_id ?? null, error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
  }
}

function input(subject: string, revision = 1, status: 'active' | 'suspended' = 'active') {
  return {
    issuer: ISSUER,
    subject,
    verifiedEmail: `${subject}@example.test`,
    activation: { status, revision },
  }
}

beforeAll(async () => {
  await withDb(async (client) => {
    await client.query(await readFile(migrationPath, 'utf8'))
  })
  await cleanup()
})

afterAll(cleanup)

describe('identity profile activation durable boundary', () => {
  it('atomically creates one profile plus activation and no entitlement or role', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const result = await store.commit(input('profile-only'))

    const state = await withDb(async (client) => {
      const profile = await client.query(
        `select id, issuer, subject, email from academy.users where id = $1`,
        [result.accountId],
      )
      const activation = await client.query(
        `select status, revision from academy.service_activation where user_id = $1`,
        [result.accountId],
      )
      const entitlements = await client.query(
        `select count(*)::int as count from academy.course_entitlement where user_id = $1`,
        [result.accountId],
      )
      const roles = await client.query(
        `select count(*)::int as count from academy.staff_role_assignment where account_id = $1`,
        [result.accountId],
      )
      return { profile, activation, entitlements, roles }
    })

    expect(state.profile.rows).toEqual([{
      id: result.accountId,
      issuer: ISSUER,
      subject: 'profile-only',
      email: 'profile-only@example.test',
    }])
    expect(state.activation.rows).toEqual([{ status: 'active', revision: 1 }])
    expect(state.entitlements.rows[0].count).toBe(0)
    expect(state.roles.rows[0].count).toBe(0)
  })

  it('binds the same canonical principal to one profile and updates verified attributes', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const first = await store.commit(input('same-principal', 1))
    const second = await store.commit({
      ...input('same-principal', 2),
      verifiedEmail: 'renamed@example.test',
    })

    expect(second.accountId).toBe(first.accountId)
    const rows = await withDb((client) => client.query(
      `select id, email from academy.users where issuer = $1 and subject = $2`,
      [ISSUER, 'same-principal'],
    ))
    expect(rows.rows).toEqual([{ id: first.accountId, email: 'renamed@example.test' }])
  })

  it('never merges two subjects by verified-email equality', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const first = await store.commit({ ...input('email-a'), verifiedEmail: 'shared@example.test' })
    const second = await store.commit({ ...input('email-b'), verifiedEmail: 'shared@example.test' })

    expect(second.accountId).not.toBe(first.accountId)
    const count = await withDb((client) => client.query(
      `select count(*)::int as count from academy.users where issuer = $1 and email = $2`,
      [ISSUER, 'shared@example.test'],
    ))
    expect(count.rows[0].count).toBe(2)
  })

  it('rolls the profile update back when same-revision activation conflicts', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const created = await store.commit(input('conflict', 4, 'active'))

    await expect(store.commit({
      ...input('conflict', 4, 'suspended'),
      verifiedEmail: 'must-not-persist@example.test',
    })).rejects.toThrow('Identity profile activation commit failed')

    const state = await withDb(async (client) => ({
      profile: await client.query(`select email from academy.users where id = $1`, [created.accountId]),
      activation: await client.query(
        `select status, revision from academy.service_activation where user_id = $1`,
        [created.accountId],
      ),
    }))
    expect(state.profile.rows).toEqual([{ email: 'conflict@example.test' }])
    expect(state.activation.rows).toEqual([{ status: 'active', revision: 4 }])
  })

  it('accepts an exact activation duplicate while updating the verified email', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const created = await store.commit(input('exact-duplicate', 5, 'suspended'))

    const repeated = await store.commit({
      ...input('exact-duplicate', 5, 'suspended'),
      verifiedEmail: 'exact-duplicate-renamed@example.test',
    })

    expect(repeated.accountId).toBe(created.accountId)
    const state = await withDb(async (client) => ({
      profile: await client.query(`select email from academy.users where id = $1`, [created.accountId]),
      activation: await client.query(
        `select status, revision from academy.service_activation where user_id = $1`,
        [created.accountId],
      ),
    }))
    expect(state.profile.rows).toEqual([{ email: 'exact-duplicate-renamed@example.test' }])
    expect(state.activation.rows).toEqual([{ status: 'suspended', revision: 5 }])
  })

  it('rejects a stale activation and rolls the profile update back', async () => {
    const store = new AcademyIdentityProfileActivationStore(pgRpcClient())
    const created = await store.commit(input('stale-activation', 5, 'suspended'))

    await expect(store.commit({
      ...input('stale-activation', 4, 'active'),
      verifiedEmail: 'stale-must-not-persist@example.test',
    })).rejects.toThrow('Identity profile activation commit failed')

    const state = await withDb(async (client) => ({
      profile: await client.query(`select email from academy.users where id = $1`, [created.accountId]),
      activation: await client.query(
        `select status, revision from academy.service_activation where user_id = $1`,
        [created.accountId],
      ),
    }))
    expect(state.profile.rows).toEqual([{ email: 'stale-activation@example.test' }])
    expect(state.activation.rows).toEqual([{ status: 'suspended', revision: 5 }])
  })

  it('concurrent repeats converge on one canonical profile', async () => {
    const stores = Array.from({ length: 4 }, () => new AcademyIdentityProfileActivationStore(pgRpcClient()))
    const results = await Promise.all(stores.map((store) => store.commit(input('concurrent', 3))))

    expect(new Set(results.map((result) => result.accountId)).size).toBe(1)
    const count = await withDb((client) => client.query(
      `select count(*)::int as count from academy.users where issuer = $1 and subject = $2`,
      [ISSUER, 'concurrent'],
    ))
    expect(count.rows[0].count).toBe(1)
  })

  it.each([
    ['invalid email', 'invalid-email', 'active', 1],
    ['invalid status', 'invalid-status@example.test', 'enabled', 1],
    ['invalid revision', 'invalid-revision@example.test', 'active', 0],
  ])('rejects %s atomically without a profile residue', async (_name, email, status, revision) => {
    const subject = `sql-reject-${revision}-${status}`
    await expect(withDb((client) => client.query(
      `select academy.commit_identity_profile_activation($1, $2, $3, $4, $5)`,
      [ISSUER, subject, email, status, revision],
    ))).rejects.toThrow()

    const count = await withDb((client) => client.query(
      `select count(*)::int as count from academy.users where issuer = $1 and subject = $2`,
      [ISSUER, subject],
    ))
    expect(count.rows[0].count).toBe(0)
  })

  it('exposes the function only to the dedicated Academy runtime role', async () => {
    const privileges = await withDb((client) => client.query(`
      select
        has_function_privilege('academy_runtime',
          'academy.commit_identity_profile_activation(text,text,text,text,integer)', 'execute') as runtime_execute,
        has_function_privilege('anon',
          'academy.commit_identity_profile_activation(text,text,text,text,integer)', 'execute') as anon_execute,
        has_function_privilege('authenticated',
          'academy.commit_identity_profile_activation(text,text,text,text,integer)', 'execute') as authenticated_execute,
        has_function_privilege('service_role',
          'academy.commit_identity_profile_activation(text,text,text,text,integer)', 'execute') as service_execute
    `))

    expect(privileges.rows[0]).toEqual({
      runtime_execute: true,
      anon_execute: false,
      authenticated_execute: false,
      service_execute: false,
    })
  })
})
