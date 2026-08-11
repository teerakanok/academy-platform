import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { AcademyPostgresIdentityTransactionStore } from '@/lib/identity/postgres-transaction-store'
import type { PendingIdentityTransactionInput } from '@/lib/identity/transaction'

const migrationPath = join(process.cwd(), 'supabase/migrations/0025_identity_authorization_transaction.sql')
const runtimeTestRole = `academy_identity_transaction_test_${randomBytes(6).toString('hex')}`

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

function fixture(): { browserBinding: string; input: PendingIdentityTransactionInput } {
  const browserBinding = randomBytes(32).toString('base64url')
  return {
    browserBinding,
    input: {
      state: randomBytes(32).toString('base64url'),
      codeVerifier: randomBytes(48).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      browserBindingDigest: createHash('sha256').update(browserBinding).digest('base64url'),
      client: {
        clientId: 'academy-web-local',
        redirectUri: 'http://localhost:3000/auth/callback',
        serviceId: 'academy',
        audience: 'academy-api-local',
        expectedIssuer: 'https://identity.local.invalid',
        clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
      },
      returnPath: '/dashboard',
    },
  }
}

function pgRpcClient() {
  return {
    async rpc(functionName: string, parameters: Record<string, unknown>) {
      try {
        const result = await withDb((client) => {
          if (functionName === 'create_identity_authorization_transaction') {
            return client.query(
              `select academy.create_identity_authorization_transaction(
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
              ) as result`,
              [
                parameters.p_state,
                parameters.p_code_verifier,
                parameters.p_nonce,
                parameters.p_browser_binding_digest,
                parameters.p_client_id,
                parameters.p_redirect_uri,
                parameters.p_service_id,
                parameters.p_audience,
                parameters.p_expected_issuer,
                parameters.p_client_assertion_audience,
                parameters.p_return_path,
                parameters.p_ttl_seconds,
              ],
            )
          }
          if (functionName === 'consume_identity_authorization_transaction') {
            return client.query(
              `select academy.consume_identity_authorization_transaction($1, $2) as result`,
              [parameters.p_state, parameters.p_browser_binding_digest],
            )
          }
          throw new Error('unexpected RPC')
        })
        return { data: result.rows[0]?.result ?? null, error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
  }
}

function pgRuntimeRpcClient() {
  return {
    async rpc(functionName: string, parameters: Record<string, unknown>) {
      try {
        const result = await withDb(async (client) => {
          await client.query('begin')
          try {
            await client.query(`set local role ${runtimeTestRole}`)
            let response
            if (functionName === 'create_identity_authorization_transaction') {
              response = await client.query(
                `select academy.create_identity_authorization_transaction(
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
                ) as result`,
                [
                  parameters.p_state,
                  parameters.p_code_verifier,
                  parameters.p_nonce,
                  parameters.p_browser_binding_digest,
                  parameters.p_client_id,
                  parameters.p_redirect_uri,
                  parameters.p_service_id,
                  parameters.p_audience,
                  parameters.p_expected_issuer,
                  parameters.p_client_assertion_audience,
                  parameters.p_return_path,
                  parameters.p_ttl_seconds,
                ],
              )
            } else if (functionName === 'consume_identity_authorization_transaction') {
              response = await client.query(
                `select academy.consume_identity_authorization_transaction($1, $2) as result`,
                [parameters.p_state, parameters.p_browser_binding_digest],
              )
            } else {
              throw new Error('unexpected RPC')
            }
            await client.query('commit')
            return response
          } catch (error) {
            await client.query('rollback')
            throw error
          }
        })
        return { data: result.rows[0]?.result ?? null, error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
  }
}

async function cleanup(): Promise<void> {
  await withDb(async (client) => {
    await client.query('delete from academy.identity_authorization_transaction')
  })
}

beforeAll(async () => {
  await withDb(async (client) => {
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query(`create role ${runtimeTestRole} inherit nologin`)
    await client.query(`grant academy_runtime to ${runtimeTestRole}`)
    await client.query(`grant ${runtimeTestRole} to current_user`)
  })
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await withDb((client) => client.query(`drop role ${runtimeTestRole}`))
})

describe('identity authorization PostgreSQL transaction boundary', () => {
  it('survives an adapter restart while persisting only the browser-binding digest', async () => {
    const { browserBinding, input } = fixture()
    const created = await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)

    const persisted = await withDb((client) => client.query(
      `select state, browser_binding_digest, code_verifier, expires_at
         from academy.identity_authorization_transaction
        where state = $1`,
      [input.state],
    ))
    expect(persisted.rows).toHaveLength(1)
    expect(persisted.rows[0].browser_binding_digest).toBe(input.browserBindingDigest)
    expect(JSON.stringify(persisted.rows[0])).not.toContain(browserBinding)
    expect(created.expiresAt).toBeGreaterThan(Date.now())

    const consumed = await new AcademyPostgresIdentityTransactionStore(pgRpcClient())
      .consume(input.state, browserBinding)
    expect(consumed).toEqual(created)
    expect(consumed).not.toBe(created)
    expect(consumed.client).not.toBe(created.client)
  })

  it('preserves a live transaction after a wrong browser binding and consumes it once with the right binding', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)

    await expect(store.consume(input.state, randomBytes(32).toString('base64url')))
      .rejects.toMatchObject({ reason: 'browser_mismatch' })
    await expect(store.consume(input.state, browserBinding)).resolves.toMatchObject({ state: input.state })
    await expect(store.consume(input.state, browserBinding)).rejects.toMatchObject({ reason: 'unknown_state' })
  })

  it('allows at most one successful concurrent consume across independent adapters', async () => {
    const { browserBinding, input } = fixture()
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)

    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => (
      new AcademyPostgresIdentityTransactionStore(pgRpcClient()).consume(input.state, browserBinding)
    )))
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(5)
    for (const attempt of rejected) {
      expect(attempt.reason).toMatchObject({ reason: 'unknown_state' })
    }
  })

  it('rechecks database time after a row-lock wait before consuming', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)

    await withDb(async (blocker) => {
      await blocker.query('begin')
      let committed = false
      try {
        await blocker.query(
          `update academy.identity_authorization_transaction
              set expires_at = date_trunc('milliseconds', clock_timestamp()) + interval '800 milliseconds'
            where state = $1`,
          [input.state],
        )
        const waitingConsume = store.consume(input.state, browserBinding)
        await blocker.query(`select pg_sleep(1.1)`)
        await blocker.query('commit')
        committed = true

        await expect(waitingConsume).rejects.toMatchObject({ reason: 'expired_state' })
      } finally {
        if (!committed) await blocker.query('rollback')
      }
    })
  })

  it('rejects concurrent duplicate creation and retains one canonical row', async () => {
    const { input } = fixture()
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => (
      new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)
    )))

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(3)
    const count = await withDb((client) => client.query(
      `select count(*)::int as count
         from academy.identity_authorization_transaction
        where state = $1`,
      [input.state],
    ))
    expect(count.rows[0].count).toBe(1)
  })

  it('starts a full TTL after a successful uniqueness wait', async () => {
    const { input } = fixture()
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)

    const created = await withDb(async (blocker) => {
      await blocker.query('begin')
      let committed = false
      try {
        await blocker.query(
          'delete from academy.identity_authorization_transaction where state = $1',
          [input.state],
        )
        const waitingCreate = new AcademyPostgresIdentityTransactionStore(
          pgRpcClient(),
          { ttlSeconds: 2 },
        ).create(input)
        await blocker.query(`select pg_sleep(1.2)`)
        await blocker.query('commit')
        committed = true
        return await waitingCreate
      } finally {
        if (!committed) await blocker.query('rollback')
      }
    })
    const databaseClock = await withDb((client) => client.query(
      `select date_trunc('milliseconds', clock_timestamp()) as now`,
    ))
    const now = databaseClock.rows[0].now as Date

    expect(created.expiresAt - now.getTime()).toBeGreaterThanOrEqual(1_800)
  })

  it('deletes an expired transaction durably before returning the expiry classification', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    await withDb((client) => client.query(
      `update academy.identity_authorization_transaction
          set created_at = date_trunc('milliseconds', clock_timestamp()) - interval '2 seconds',
              expires_at = date_trunc('milliseconds', clock_timestamp()) - interval '1 second'
        where state = $1`,
      [input.state],
    ))

    await expect(store.consume(input.state, browserBinding)).rejects.toMatchObject({ reason: 'expired_state' })
    const count = await withDb((client) => client.query(
      `select count(*)::int as count
         from academy.identity_authorization_transaction
        where state = $1`,
      [input.state],
    ))
    expect(count.rows[0].count).toBe(0)
  })

  it('bounds abandoned-row cleanup on every successful authorization start', async () => {
    await withDb((client) => client.query(`
      insert into academy.identity_authorization_transaction (
        state, code_verifier, nonce, browser_binding_digest,
        client_id, redirect_uri, service_id, audience, expected_issuer,
        client_assertion_audience, return_path, expires_at, created_at
      )
      select
        repeat('A', 24) || lpad(value::text, 6, '0'),
        repeat('V', 43),
        repeat('N', 32),
        repeat('D', 43),
        'academy-web-local',
        'http://localhost:3000/auth/callback',
        'academy',
        'academy-api-local',
        'https://identity.local.invalid',
        'https://accounts.local.invalid/v1/code/exchange',
        '/dashboard',
        date_trunc('milliseconds', clock_timestamp()) - interval '1 hour',
        date_trunc('milliseconds', clock_timestamp()) - interval '2 hours'
      from generate_series(1, 105) as value
      on conflict (state) do nothing
    `))

    const { input } = fixture()
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)
    const expired = await withDb((client) => client.query(`
      select count(*)::int as count
        from academy.identity_authorization_transaction
       where expires_at <= clock_timestamp()
    `))
    expect(expired.rows[0].count).toBe(5)
  })

  it('keeps the table private while exposing only the two RPCs to academy_runtime', async () => {
    const privileges = await withDb((client) => client.query(`
      select
        has_table_privilege('academy_runtime',
          'academy.identity_authorization_transaction', 'select,insert,update,delete') as runtime_table,
        has_table_privilege('anon',
          'academy.identity_authorization_transaction', 'select,insert,update,delete') as anon_table,
        has_table_privilege('authenticated',
          'academy.identity_authorization_transaction', 'select,insert,update,delete') as authenticated_table,
        has_table_privilege('service_role',
          'academy.identity_authorization_transaction', 'select,insert,update,delete') as service_table,
        has_function_privilege('academy_runtime',
          'academy.create_identity_authorization_transaction(text,text,text,text,text,text,text,text,text,text,text,integer)',
          'execute') as runtime_create,
        has_function_privilege('academy_runtime',
          'academy.consume_identity_authorization_transaction(text,text)',
          'execute') as runtime_consume,
        has_function_privilege('anon',
          'academy.consume_identity_authorization_transaction(text,text)',
          'execute') as anon_consume,
        has_function_privilege('authenticated',
          'academy.consume_identity_authorization_transaction(text,text)',
          'execute') as authenticated_consume,
        has_function_privilege('service_role',
          'academy.consume_identity_authorization_transaction(text,text)',
          'execute') as service_consume
    `))

    expect(privileges.rows[0]).toEqual({
      runtime_table: false,
      anon_table: false,
      authenticated_table: false,
      service_table: false,
      runtime_create: true,
      runtime_consume: true,
      anon_consume: false,
      authenticated_consume: false,
      service_consume: false,
    })

    const { browserBinding, input } = fixture()
    const runtimeStore = new AcademyPostgresIdentityTransactionStore(pgRuntimeRpcClient())
    await expect(runtimeStore.create(input)).resolves.toMatchObject({ state: input.state })
    await expect(runtimeStore.consume(input.state, browserBinding)).resolves.toMatchObject({ state: input.state })

    await expect(withDb(async (client) => {
      await client.query('begin')
      try {
        await client.query(`set local role ${runtimeTestRole}`)
        await client.query('select state from academy.identity_authorization_transaction limit 1')
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    })).rejects.toThrow(/permission denied/i)
  })
})
