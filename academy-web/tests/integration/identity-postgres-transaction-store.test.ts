import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'
import { AcademyPostgresIdentityTransactionStore } from '@/lib/identity/postgres-transaction-store'
import type {
  ActiveIdentityCompletionClaim,
  IdentityCompletionClaim,
  PendingIdentityTransactionInput,
} from '@/lib/identity/transaction'

const migrationPath = join(process.cwd(), 'supabase/migrations/0025_identity_authorization_transaction.sql')
const completionLeaseMigrationPath = join(
  process.cwd(),
  'supabase/migrations/0028_identity_authorization_completion_lease.sql',
)
const runtimeTestRole = `academy_identity_transaction_test_${randomBytes(6).toString('hex')}`
const abandonedStatePrefix = `academy_test_${randomBytes(8).toString('hex')}_`
const testStates = new Set<string>()
const testCompletions = new Map<string, {
  accountId: string
  issuer: string
  sessionId: string
  subject: string
}>()

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
  const state = randomBytes(32).toString('base64url')
  testStates.add(state)
  return {
    browserBinding,
    input: {
      state,
      codeVerifier: randomBytes(48).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      browserBindingDigest: createHash('sha256').update(browserBinding).digest('base64url'),
      client: {
        clientId: 'academy-web-local',
        redirectUri: 'http://localhost:3000/auth/callback',
        serviceId: 'academy',
        audience: 'academy-api-local',
        expectedIssuer: 'https://identity.local.invalid/auth/v1',
        clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
      },
      returnPath: '/dashboard',
    },
  }
}

function verifiedResult(input: PendingIdentityTransactionInput) {
  const suffix = input.state.slice(0, 16).toLowerCase()
  return {
    issuer: input.client.expectedIssuer,
    subject: `principal-${input.state}`,
    verifiedEmail: `learner+${suffix}@example.com`,
    audience: input.client.audience,
    serviceId: input.client.serviceId,
    nonce: input.nonce,
    activation: { status: 'active' as const, revision: 3 },
  }
}

function requireActive(claim: IdentityCompletionClaim): ActiveIdentityCompletionClaim {
  if (claim.status !== 'claimed') throw new Error('expected active completion claim')
  return claim
}

function encodeSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

async function createCompletionRows(
  claim: ActiveIdentityCompletionClaim,
  input: PendingIdentityTransactionInput,
): Promise<{ accountId: string; sessionId: string; returnPath: string }> {
  const result = verifiedResult(input)
  return withDb(async (client) => {
    const profile = await client.query<{ account_id: string }>(
      'select academy.commit_identity_profile_activation($1, $2, $3, $4, $5) as account_id',
      [result.issuer, result.subject, result.verifiedEmail,
        result.activation.status, result.activation.revision],
    )
    const accountId = profile.rows[0]!.account_id
    const session = await client.query<{ result: { status: string } }>(
      'select academy.create_identity_session($1, $2, $3, $4, $5, $6, $7) as result',
      [claim.sessionId, result.issuer, encodeSubjectKey(result.subject), result.verifiedEmail,
        result.activation.status, result.activation.revision, 86_400],
    )
    expect(['created', 'duplicate']).toContain(session.rows[0]!.result.status)
    testCompletions.set(input.state, {
      accountId,
      issuer: result.issuer,
      sessionId: claim.sessionId,
      subject: result.subject,
    })
    return { accountId, sessionId: claim.sessionId, returnPath: input.returnPath }
  })
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
          if (functionName === 'claim_identity_authorization_transaction') {
            return client.query(
              'select academy.claim_identity_authorization_transaction($1, $2, $3, $4, $5) as result',
              [
                parameters.p_state,
                parameters.p_browser_binding_digest,
                parameters.p_claim_digest,
                parameters.p_session_id,
                parameters.p_lease_seconds,
              ],
            )
          }
          if (functionName === 'checkpoint_identity_authorization_exchange') {
            return client.query(
              'select academy.checkpoint_identity_authorization_exchange($1, $2, $3, $4, $5, $6, $7) as result',
              [
                parameters.p_state,
                parameters.p_claim_digest,
                parameters.p_issuer,
                parameters.p_subject,
                parameters.p_verified_email,
                parameters.p_activation_status,
                parameters.p_activation_revision,
              ],
            )
          }
          if (functionName === 'release_identity_authorization_transaction_claim') {
            return client.query(
              'select academy.release_identity_authorization_transaction_claim($1, $2, $3) as result',
              [parameters.p_state, parameters.p_claim_digest, parameters.p_failure_stage],
            )
          }
          if (functionName === 'finalize_identity_authorization_transaction') {
            return client.query(
              'select academy.finalize_identity_authorization_transaction($1, $2, $3, $4, $5) as result',
              [parameters.p_state, parameters.p_claim_digest, parameters.p_account_id,
                parameters.p_session_id, parameters.p_subject_key],
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
            } else if (functionName === 'claim_identity_authorization_transaction') {
              response = await client.query(
                'select academy.claim_identity_authorization_transaction($1, $2, $3, $4, $5) as result',
                [
                  parameters.p_state,
                  parameters.p_browser_binding_digest,
                  parameters.p_claim_digest,
                  parameters.p_session_id,
                  parameters.p_lease_seconds,
                ],
              )
            } else if (functionName === 'checkpoint_identity_authorization_exchange') {
              response = await client.query(
                'select academy.checkpoint_identity_authorization_exchange($1, $2, $3, $4, $5, $6, $7) as result',
                [
                  parameters.p_state,
                  parameters.p_claim_digest,
                  parameters.p_issuer,
                  parameters.p_subject,
                  parameters.p_verified_email,
                  parameters.p_activation_status,
                  parameters.p_activation_revision,
                ],
              )
            } else if (functionName === 'release_identity_authorization_transaction_claim') {
              response = await client.query(
                'select academy.release_identity_authorization_transaction_claim($1, $2, $3) as result',
                [parameters.p_state, parameters.p_claim_digest, parameters.p_failure_stage],
              )
            } else if (functionName === 'finalize_identity_authorization_transaction') {
              response = await client.query(
                'select academy.finalize_identity_authorization_transaction($1, $2, $3, $4, $5) as result',
                [parameters.p_state, parameters.p_claim_digest, parameters.p_account_id,
                  parameters.p_session_id, parameters.p_subject_key],
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
    const states = [...testStates]
    if (states.length > 0) {
      await client.query(
        'delete from academy.identity_authorization_transaction where state = any($1::text[])',
        [states],
      )
    }
    await client.query(
      'delete from academy.identity_authorization_transaction where state like $1',
      [`${abandonedStatePrefix}%`],
    )
    for (const completion of testCompletions.values()) {
      await client.query('delete from academy.identity_session where id = $1', [completion.sessionId])
      await client.query(
        'delete from academy.users where id = $1 and issuer = $2 and subject = $3',
        [completion.accountId, completion.issuer, completion.subject],
      )
    }
  })
  testStates.clear()
  testCompletions.clear()
}

beforeAll(async () => {
  await withDb(async (client) => {
    await client.query(await readFile(migrationPath, 'utf8'))
    await client.query(await readFile(completionLeaseMigrationPath, 'utf8'))
    await client.query(`create role ${runtimeTestRole} inherit nologin`)
    await client.query(`grant academy_runtime to ${runtimeTestRole}`)
    await client.query(`grant ${runtimeTestRole} to current_user`)
  })
})

afterEach(cleanup)

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

  it('leases one callback across concurrent runtimes, records a fixed failure stage, and retries safely', async () => {
    const { browserBinding, input } = fixture()
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)

    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => (
      new AcademyPostgresIdentityTransactionStore(pgRpcClient()).claim(input.state, browserBinding)
    )))
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(5)
    for (const attempt of rejected) {
      expect(attempt.reason).toMatchObject({ reason: 'claim_in_progress' })
    }

    const first = requireActive(fulfilled[0]!.value)
    const persisted = await withDb((client) => client.query(
      `select claim_digest, attempt_count, last_failure_stage, session_id
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(persisted.rows[0]).toMatchObject({
      claim_digest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      attempt_count: 1,
      last_failure_stage: null,
      session_id: first.sessionId,
    })
    expect(JSON.stringify(persisted.rows[0])).not.toContain(first.claimToken)

    await new AcademyPostgresIdentityTransactionStore(pgRpcClient())
      .checkpoint(first, verifiedResult(input))
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient())
      .release(first, 'profile_activation')
    const released = await withDb((client) => client.query(
      `select claim_digest, claim_expires_at, attempt_count, last_failure_stage,
              result_issuer, result_subject, result_verified_email
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(released.rows[0]).toEqual({
      claim_digest: null,
      claim_expires_at: null,
      attempt_count: 1,
      last_failure_stage: 'profile_activation',
      result_issuer: input.client.expectedIssuer,
      result_subject: verifiedResult(input).subject,
      result_verified_email: verifiedResult(input).verifiedEmail,
    })

    const secondStore = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    const second = requireActive(await secondStore.claim(input.state, browserBinding))
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.exchangeResult).toEqual(verifiedResult(input))
    const receipt = await createCompletionRows(second, input)
    await secondStore.finalize(second, receipt)
    await expect(secondStore.claim(input.state, browserBinding)).resolves.toEqual({
      status: 'completed',
      receipt,
    })
  })

  it('does not let an expired stale claim release or finalize a newer owner claim', async () => {
    const { browserBinding, input } = fixture()
    const firstStore = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await firstStore.create(input)
    const first = requireActive(await firstStore.claim(input.state, browserBinding))
    const result = verifiedResult(input)
    await firstStore.checkpoint(first, result)
    const checkpointedFirst = { ...first, exchangeResult: result } as ActiveIdentityCompletionClaim
    await withDb((client) => client.query(
      `update academy.identity_authorization_transaction
          set claim_expires_at = clock_timestamp() - interval '1 second'
        where state = $1`,
      [input.state],
    ))

    const secondStore = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    const second = requireActive(await secondStore.claim(input.state, browserBinding))
    await expect(firstStore.release(first, 'code_exchange'))
      .rejects.toBeInstanceOf(Error)
    await expect(firstStore.finalize(checkpointedFirst, {
      accountId: '123e4567-e89b-42d3-a456-426614174000',
      sessionId: first.sessionId,
      returnPath: input.returnPath,
    })).rejects.toBeInstanceOf(Error)

    const liveClaim = await withDb((client) => client.query(
      `select claim_digest, attempt_count
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(liveClaim.rows[0]).toMatchObject({
      claim_digest: createHash('sha256').update(second.claimToken).digest('base64url'),
      attempt_count: 2,
    })
    await secondStore.release(second, 'code_exchange')
  })

  it('makes the verified-result checkpoint idempotent but rejects changed identity data', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    const claim = requireActive(await store.claim(input.state, browserBinding))
    const result = verifiedResult(input)

    await store.checkpoint(claim, result)
    await expect(store.checkpoint(claim, result)).resolves.toBeUndefined()
    await expect(store.checkpoint(claim, { ...result, subject: 'different-subject' }))
      .rejects.toBeInstanceOf(Error)

    const persisted = await withDb((client) => client.query(
      `select result_subject, result_verified_email, result_activation_status,
              result_activation_revision
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(persisted.rows[0]).toEqual({
      result_subject: result.subject,
      result_verified_email: result.verifiedEmail,
      result_activation_status: 'active',
      result_activation_revision: '3',
    })
    await store.release(claim, 'profile_activation')
  })

  it('blocks a rolled-back legacy runtime from consuming any callback already claimed by the new runtime', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    const claim = requireActive(await store.claim(input.state, browserBinding))
    await store.checkpoint(claim, verifiedResult(input))
    await store.release(claim, 'profile_activation')

    await expect(store.consume(input.state, browserBinding))
      .rejects.toMatchObject({ reason: 'unknown_state' })
    const retained = await withDb((client) => client.query(
      `select attempt_count, result_issuer, session_id
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(retained.rows).toHaveLength(1)
    expect(retained.rows[0]).toEqual({
      attempt_count: 1,
      result_issuer: input.client.expectedIssuer,
      session_id: claim.sessionId,
    })
  })

  it('bounds released callback retries and deletes exhausted state', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    for (const stage of ['client_assertion', 'code_exchange', 'result_verification'] as const) {
      const claim = requireActive(await store.claim(input.state, browserBinding))
      await store.release(claim, stage)
    }

    await expect(store.claim(input.state, browserBinding))
      .rejects.toMatchObject({ reason: 'claim_exhausted' })
    const count = await withDb((client) => client.query(
      `select count(*)::int as count
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(count.rows[0].count).toBe(0)
  })

  it('deletes an expired transaction before issuing a completion claim', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    await withDb((client) => client.query(
      `update academy.identity_authorization_transaction
          set created_at = clock_timestamp() - interval '2 seconds',
              expires_at = clock_timestamp() - interval '1 second'
        where state = $1`,
      [input.state],
    ))

    await expect(store.claim(input.state, browserBinding))
      .rejects.toMatchObject({ reason: 'expired_state' })
    const count = await withDb((client) => client.query(
      `select count(*)::int as count
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(count.rows[0].count).toBe(0)
  })

  it('expires a completed receipt and never reopens its provider result', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(pgRpcClient())
    await store.create(input)
    const claim = requireActive(await store.claim(input.state, browserBinding))
    const result = verifiedResult(input)
    await store.checkpoint(claim, result)
    const checkpointed = { ...claim, exchangeResult: result } as ActiveIdentityCompletionClaim
    const receipt = await createCompletionRows(checkpointed, input)
    await store.finalize(checkpointed, receipt)
    await withDb((client) => client.query(
      `update academy.identity_authorization_transaction
          set created_at = clock_timestamp() - interval '2 seconds',
              expires_at = clock_timestamp() - interval '1 second'
        where state = $1`,
      [input.state],
    ))

    await expect(store.claim(input.state, browserBinding))
      .rejects.toMatchObject({ reason: 'expired_state' })
    const count = await withDb((client) => client.query(
      `select count(*)::int as count
         from academy.identity_authorization_transaction where state = $1`,
      [input.state],
    ))
    expect(count.rows[0].count).toBe(0)
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
        $1 || lpad(value::text, 6, '0'),
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
    `, [abandonedStatePrefix]))

    const { input } = fixture()
    await new AcademyPostgresIdentityTransactionStore(pgRpcClient()).create(input)
    const expired = await withDb((client) => client.query(`
      select count(*)::int as count
        from academy.identity_authorization_transaction
       where state like $1
         and expires_at <= clock_timestamp()
    `, [`${abandonedStatePrefix}%`]))
    expect(expired.rows[0].count).toBe(5)
  })

  it('keeps the table private while exposing only the six callback RPCs to academy_runtime', async () => {
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
          'execute') as service_consume,
        has_function_privilege('academy_runtime',
          'academy.claim_identity_authorization_transaction(text,text,text,text,integer)',
          'execute') as runtime_claim,
        has_function_privilege('academy_runtime',
          'academy.checkpoint_identity_authorization_exchange(text,text,text,text,text,text,bigint)',
          'execute') as runtime_checkpoint,
        has_function_privilege('academy_runtime',
          'academy.release_identity_authorization_transaction_claim(text,text,text)',
          'execute') as runtime_release,
        has_function_privilege('academy_runtime',
          'academy.finalize_identity_authorization_transaction(text,text,uuid,text,text)',
          'execute') as runtime_finalize,
        has_function_privilege('anon',
          'academy.claim_identity_authorization_transaction(text,text,text,text,integer)',
          'execute') as anon_claim,
        has_function_privilege('anon',
          'academy.checkpoint_identity_authorization_exchange(text,text,text,text,text,text,bigint)',
          'execute') as anon_checkpoint
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
      runtime_claim: true,
      runtime_checkpoint: true,
      runtime_release: true,
      runtime_finalize: true,
      anon_claim: false,
      anon_checkpoint: false,
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
