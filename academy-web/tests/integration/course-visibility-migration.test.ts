import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

const migration = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0042_course_visibility_enforcement.sql'),
  'utf8',
)
const ISSUER = 'https://course-visibility-migration.test'
const COURSE = 'al-03-visibility-rehearsal'

function localDatabaseUrl(): string {
  const value = requiredEnv('TEST_DATABASE_URL')
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('TEST_DATABASE_URL must point to localhost for the migration rollback rehearsal')
  }
  return value
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: localDatabaseUrl() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function expectVisibilityDenied(db: Client, userId: string): Promise<void> {
  await db.query('savepoint enrol_attempt')
  let failure: unknown
  try {
    await db.query('select academy.enrol_free_course($1, $2)', [userId, COURSE])
  } catch (error) {
    failure = error
  }
  await db.query('rollback to savepoint enrol_attempt')
  await db.query('release savepoint enrol_attempt')
  expect(failure).toMatchObject({ code: '42501' })
}

describe('migration 0042 transactional rollback rehearsal', () => {
  it('blocks direct free enrolment for unpublished and retired courses, then rolls the migration back', async () => {
    await withDb(async (db) => {
      const { rows: beforeRows } = await db.query(
        `select pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure) as definition`,
      )
      const beforeDefinition = beforeRows[0].definition as string
      await db.query('begin')
      try {
        await db.query(migration)
        const { rows: migratedRows } = await db.query(
          `select pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure) as definition`,
        )
        expect(migratedRows[0].definition).toContain('academy.course_settings')

        await db.query(`insert into academy.course_offer(course_slug, model) values ($1, 'free')`, [COURSE])
        const subject = randomUUID()
        const { rows } = await db.query(
          `insert into academy.users(issuer, subject, email)
           values ($1, $2, $3) returning id`,
          [ISSUER, subject, `${subject}@example.com`],
        )
        const userId = rows[0].id as string
        await db.query(
          `insert into academy.service_activation(user_id, status, revision)
           values ($1, 'active', 1)`,
          [userId],
        )
        await db.query(
          `insert into academy.course_settings(course_slug, visibility)
           values ($1, 'unpublished')
           on conflict (course_slug) do update set visibility = excluded.visibility`,
          [COURSE],
        )

        await db.query('set local role academy_runtime')
        await expectVisibilityDenied(db, userId)

        await db.query('reset role')
        await db.query(`update academy.course_settings set visibility = 'retired' where course_slug = $1`, [COURSE])
        await db.query('set local role academy_runtime')
        await expectVisibilityDenied(db, userId)

        await db.query('reset role')
        await db.query(`update academy.course_settings set visibility = 'published' where course_slug = $1`, [COURSE])
        await db.query('set local role academy_runtime')
        const { rows: allowed } = await db.query(
          'select academy.enrol_free_course($1, $2) as result',
          [userId, COURSE],
        )
        expect(allowed[0].result).toMatchObject({ enrolled: true, changed: true, source: 'free' })

        await db.query('reset role')
        const { rows: entitlements } = await db.query(
          'select course_slug from academy.course_entitlement where user_id = $1',
          [userId],
        )
        expect(entitlements).toEqual([{ course_slug: COURSE }])
      } finally {
        await db.query('rollback')
      }

      const { rows: definitions } = await db.query(
        `select pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure) as definition`,
      )
      expect(definitions[0].definition).toBe(beforeDefinition)
    })
  })
})
