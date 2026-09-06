import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { requiredEnv } from './setup'

const COURSE_SLUG = 'assessment-integrity-test'
const PARAMS = {
  questionIds: ['q1', 'q2', 'q3', 'q4'],
  questions: [],
  keyMaps: {},
  answerKeys: { q1: ['A'], q2: ['A'], q3: ['A'], q4: ['A'] },
  assessment: { assessed: true },
}

async function issue(
  db: Client,
  userId: string,
  nodeId: string,
  challengeId = 'checkpoint',
) {
  const result = await db.query(
    `select * from academy.issue_attempt(
       $1, $2, $3, $4, $5, 'test', 60, 500, 30
     )`,
    [userId, COURSE_SLUG, nodeId, challengeId, PARAMS],
  )
  return result.rows[0] as { attempt_id: string } | undefined
}

async function consume(
  db: Client,
  userId: string,
  nodeId: string,
  attemptId: string,
  challengeId = 'checkpoint',
) {
  const result = await db.query(
    `select * from academy.consume_attempt($1, $2, $3, $4, $5)`,
    [attemptId, userId, COURSE_SLUG, nodeId, challengeId],
  )
  return result.rows[0] as { claim_token: string; claim_state: string }
}

async function failAttempt(
  db: Client,
  userId: string,
  nodeId: string,
  attemptId: string,
  challengeId = 'checkpoint',
) {
  const claimed = await consume(db, userId, nodeId, attemptId, challengeId)
  expect(claimed.claim_state).toBe('claimed')
  const closed = await db.query(
    `select academy.finalize_attempt($1, $2, $3, '{"passed":false}'::jsonb) as closed`,
    [attemptId, userId, claimed.claim_token],
  )
  expect(closed.rows[0].closed).toBe(true)
}

async function retryReason(db: Client, userId: string, nodeId: string) {
  const result = await db.query(
    `select reason, retry_at from academy.assessment_attempt_retry(
       $1, $2, $3, 500, 30
     )`,
    [userId, COURSE_SLUG, nodeId],
  )
  return result.rows[0] as { reason: string; retry_at: string } | undefined
}

async function createUser(db: Client) {
  const result = await db.query(
    `insert into academy.users(issuer, subject, email)
     values ('https://assessment-integrity.test', $1, $2)
     returning id`,
    [crypto.randomUUID(), `${crypto.randomUUID()}@example.test`],
  )
  return result.rows[0].id as string
}

async function prepareMigration(db: Client) {
  await db.query('begin')
  await db.query(
    readFileSync(
      new URL('../../supabase/migrations/0033_assessment_attempt_integrity.sql', import.meta.url),
      'utf8',
    ),
  )
}

describe('assessment attempt integrity migration', () => {
  it('orders cooldown by completion time and enforces dwell with first and repeat failures', async () => {
    const db = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
    await db.connect()
    try {
      await prepareMigration(db)
      const userId = await createUser(db)

      const first = await issue(db, userId, 'completion-order')
      expect(first).toBeDefined()
      const early = await consume(db, userId, 'completion-order', first!.attempt_id)
      expect(early.claim_state).toBe('dwell-time')

      await db.query(
        `update academy.attempt
            set created_at = now() - interval '1 minute'
          where attempt_id = $1`,
        [first!.attempt_id],
      )
      await failAttempt(db, userId, 'completion-order', first!.attempt_id)

      expect(await issue(db, userId, 'completion-order')).toBeUndefined()
      const firstFailure = await retryReason(db, userId, 'completion-order')
      expect(firstFailure?.reason).toBe('repeat-failure')
      expect(new Date(firstFailure!.retry_at).getTime()).toBeGreaterThan(Date.now())

      await db.query(
        `update academy.attempt
            set result_recorded_at = now() - interval '6 minutes'
          where attempt_id = $1`,
        [first!.attempt_id],
      )
      const second = await issue(db, userId, 'completion-order')
      expect(second).toBeDefined()
      await db.query(
        `update academy.attempt
            set created_at = now() - interval '19 minutes'
          where attempt_id = $1`,
        [second!.attempt_id],
      )
      await failAttempt(db, userId, 'completion-order', second!.attempt_id)
      await db.query(
        `update academy.attempt
            set result_recorded_at = now() - interval '10 minutes'
          where attempt_id = $1`,
        [second!.attempt_id],
      )
      await db.query(
        `update academy.attempt
            set created_at = now() - interval '20 minutes',
                result_recorded_at = now() - interval '1 minute'
          where attempt_id = $1`,
        [first!.attempt_id],
      )

      expect(await issue(db, userId, 'completion-order')).toBeUndefined()
      const latestCompletion = await retryReason(db, userId, 'completion-order')
      expect(latestCompletion?.reason).toBe('repeat-failure')
      expect(new Date(latestCompletion!.retry_at).getTime()).toBeGreaterThan(Date.now())

      await db.query('set local search_path = public')
      const boundary = await retryReason(db, userId, 'completion-order')
      expect(boundary?.reason).toBe('repeat-failure')
    } finally {
      await db.query('rollback')
      await db.end()
    }
  })

  it('serializes concurrent admission and applies the rolling and UTC daily ceilings', async () => {
    const db = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
    await db.connect()
    try {
      await prepareMigration(db)
      const userId = await createUser(db)
      const issueBatch = async (batch: number, count: number) => {
        const rows = await Promise.all(
          Array.from({ length: count }, (_, index) =>
            issue(db, userId, 'concurrent-caps', `checkpoint-${batch}-${index}`),
          ),
        )
        return rows.filter((row): row is { attempt_id: string } => Boolean(row))
      }
      const consumeBatch = async (rows: { attempt_id: string }[], batch: number) => {
        for (const [index, row] of rows.entries()) {
          await db.query(
            `update academy.attempt
                set created_at = now() - interval '31 minutes'
              where attempt_id = $1`,
            [row.attempt_id],
          )
          const claimed = await consume(
            db,
            userId,
            'concurrent-caps',
            row.attempt_id,
            `checkpoint-${batch}-${index}`,
          )
          expect(claimed.claim_state).toBe('claimed')
        }
      }

      for (let batch = 0; batch < 3; batch += 1) {
        const rows = await issueBatch(batch, 12)
        expect(rows).toHaveLength(3)
        await consumeBatch(rows, batch)
      }

      const finalRows = await issueBatch(3, 3)
      expect(finalRows).toHaveLength(1)
      expect(await issue(db, userId, 'concurrent-caps', 'checkpoint-after-daily')).toBeUndefined()
      const denial = await retryReason(db, userId, 'concurrent-caps')
      expect(denial?.reason).toBe('daily-cap')
    } finally {
      await db.query('rollback')
      await db.end()
    }
  })
})
