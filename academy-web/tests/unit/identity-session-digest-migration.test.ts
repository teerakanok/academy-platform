import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.ACADEMY_SESSION_DIGEST_PG_URL
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/0034_identity_session_id_digest.sql'),
  'utf8',
)

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function subjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

describe('Academy identity session digest migration', () => {
  it('keeps real PostgreSQL execution explicitly scoped to a ROLLBACK rehearsal', () => {
    expect(databaseUrl ?? 'unset').toMatch(/^(?:unset|postgres(?:ql)?:\/\/)/)
    expect(migration).toMatch(/lock table academy\.identity_session/i)
    expect(migration).toMatch(/identity session digest transition was already applied/i)
  })
})

describe.skipIf(!databaseUrl)('Academy identity session digest real PostgreSQL transition', () => {
  const client = new Client({ connectionString: databaseUrl })
  const oldCookie = 'O'.repeat(43)
  const oldCookieDigest = digest(oldCookie)
  const state = 'T'.repeat(43)
  const browserBinding = 'b'.repeat(43)
  const browserBindingDigest = digest(browserBinding)
  const retryCookie = digest(`academy-session-id\0${state}\0${browserBinding}`)
  const retryCookieDigest = digest(retryCookie)
  const claimToken = 'c'.repeat(43)
  const claimDigest = digest(claimToken)
  const issuer = 'https://accounts.example.test/auth/v1'
  const subject = 'migration-learner'
  const encodedSubject = subjectKey(subject)

  afterAll(async () => {
    await client.query('rollback')
    await client.end()
  })

  it('migrates once, preserves old cookies, retries completion, and rejects reapplication', async () => {
    await client.connect()
    await client.query('begin')
    const existing = await client.query(
      `select to_regclass($1)::text as relation`,
      ["academy.identity_session_id_digest_transition"],
    )
    expect(existing.rows[0]).toEqual({ relation: null })

    const account = await client.query(
      'select academy.commit_identity_profile_activation($1, $2, $3, $4, $5) as id',
      [issuer, subject, 'learner@example.test', 'active', 7],
    )
    const accountId = account.rows[0].id

    await client.query(
      `insert into academy.identity_session (
         id, issuer, subject_key, verified_email, activation_status,
         activation_revision, created_at, expires_at
       ) values ($1, $2, $3, $4, 'active', 7, now(), now() + interval '1 hour')`,
      [oldCookie, issuer, encodedSubject, 'learner@example.test'],
    )
    await client.query(
      `insert into academy.identity_authorization_transaction (
         state, code_verifier, nonce, browser_binding_digest, client_id,
         redirect_uri, service_id, audience, expected_issuer,
         client_assertion_audience, return_path, expires_at,
         attempt_count, session_id, result_issuer, result_subject,
         result_verified_email, result_activation_status,
         result_activation_revision, completed_account_id, completed_at
       ) values (
         $1, $2, $3, $4, 'academy-web', 'https://academy.example.test/auth/callback',
         'academy', 'academy-api', $5,
         'https://accounts.example.test/v1/code/exchange', '/dashboard',
         now() + interval '5 minutes', 1, $6, $5, $7,
         'learner@example.test', 'active', 7,
         '123e4567-e89b-42d3-a456-426614174000', now()
       )`,
      [
        state, 'v'.repeat(43), 'n'.repeat(43), browserBindingDigest, issuer,
        'R'.repeat(43), subject,
      ],
    )

    await client.query(migration)

    const stored = await client.query(
      'select id from academy.identity_session where id = $1',
      [oldCookieDigest],
    )
    expect(stored.rows).toEqual([{ id: oldCookieDigest }])
    const legacyRead = await client.query(
      'select academy.read_identity_session($1) as result',
      [oldCookie],
    )
    expect(legacyRead.rows[0].result.session.id).toBe(oldCookie)
    const digestCookieRead = await client.query(
      'select academy.read_identity_session($1) as result',
      [oldCookieDigest],
    )
    expect(digestCookieRead.rows[0].result.status).toBe('unknown')

    const reset = await client.query(
      `select session_id, completed_at, completed_account_id, attempt_count
         from academy.identity_authorization_transaction where state = $1`,
      [state],
    )
    expect(reset.rows[0]).toEqual({
      session_id: null,
      completed_at: null,
      completed_account_id: null,
      attempt_count: 0,
    })

    const session = await client.query(
      `select academy.create_identity_session_digest(
         $1, $2, $3, $4, 'active', 7, 3600
       ) as result`,
      [retryCookieDigest, issuer, encodedSubject, 'learner@example.test'],
    )
    expect(session.rows[0].result.status).toBe('created')

    const claimed = await client.query(
      `select academy.claim_identity_authorization_transaction_digest(
         $1, $2, $3, $4, 30
       ) as result`,
      [state, browserBindingDigest, claimDigest, retryCookieDigest],
    )
    expect(claimed.rows[0].result.sessionId).toBe(retryCookieDigest)
    const finalized = await client.query(
      `select academy.finalize_identity_authorization_transaction_digest(
         $1, $2, $3, $4, $5
       ) as result`,
      [state, claimDigest, accountId, retryCookieDigest, encodedSubject],
    )
    expect(finalized.rows[0].result.status).toBe('completed')
    const retry = await client.query(
      `select academy.claim_identity_authorization_transaction_digest(
         $1, $2, $3, $4, 30
       ) as result`,
      [state, browserBindingDigest, digest('x'.repeat(43)), retryCookieDigest],
    )
    expect(retry.rows[0].result.receipt.sessionId).toBe(retryCookieDigest)

    await expect(client.query(migration)).rejects.toMatchObject({
      code: '23514',
      message: 'identity session digest transition was already applied',
    })
  })
})
