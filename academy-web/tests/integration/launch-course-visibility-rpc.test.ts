import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

const COURSES = [
  'basic-os-linux',
  'git-essentials',
  'assembly',
  'c-low-level',
  'computer-architecture',
  'computer-networking',
  'operating-systems',
  'setup-and-environment',
]
const REFERENCE = 'TEST-AL10-RPC-20261005'
const ISSUER = 'https://launch-course-visibility-rpc.test'

function databaseUrl() {
  const value = requiredEnv('TEST_DATABASE_URL')
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('TEST_DATABASE_URL must point to the disposable local database')
  }
  return value
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function asStaffAdmin<T>(client: Client, sql: string, values: unknown[] = []): Promise<T> {
  await client.query('begin')
  try {
    await client.query('set local role academy_staff_admin')
    const result = await client.query(sql, values)
    await client.query('commit')
    return result.rows[0] as T
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

describe('migration 0043 launch course visibility RPC', () => {
  it('audits the exact owner-attributed launch and restores the protected baseline', async () => {
    await withDb(async (db) => {
      const subject = randomUUID()
      await db.query('begin')
      try {
        await db.query(`delete from academy.course_settings_launch_audit`)
        await db.query(`delete from academy.course_settings where course_slug = any($1::text[])`, [COURSES])
        const { rows: ownerCount } = await db.query(
          `select count(*)::int as count from academy.staff_role_assignment where role = 'owner' and revoked_at is null`,
        )
        let bootstrapOwner = false
        if (ownerCount[0].count === 0) {
          await db.query(
            `with account as (
               insert into academy.users(issuer, subject, email)
               values ($1, $2, $3)
               returning id
             )
             insert into academy.staff_role_assignment(account_id, role, granted_by)
             select id, 'owner', id from account`,
            [ISSUER, subject, `launch-${subject}@example.test`],
          )
          bootstrapOwner = true
        } else {
          expect(ownerCount[0].count).toBe(1)
        }
        await db.query('commit')

        const baseline = await asStaffAdmin<{ state: unknown[]; stateSha256: string; effectiveVisibility: Record<string, string> }>(
          db,
          'select academy.inspect_launch_course_visibility() as result',
        )
        expect(baseline.state).toHaveLength(8)
        expect(Object.values(baseline.effectiveVisibility)).toEqual(Array(8).fill('published'))

        const launch = await asStaffAdmin<{ changed: boolean; auditWritten: boolean; stateSha256: string }>(
          db,
          `select academy.set_launch_course_visibility($1, null, $2, $3, false) as result`,
          [
            {
              'basic-os-linux': 'published',
              'git-essentials': 'published',
              assembly: 'unpublished',
              'c-low-level': 'unpublished',
              'computer-architecture': 'unpublished',
              'computer-networking': 'unpublished',
              'operating-systems': 'unpublished',
              'setup-and-environment': 'unpublished',
            },
            REFERENCE,
            baseline.stateSha256,
          ],
        )
        expect(launch).toMatchObject({ changed: true, auditWritten: true })

        const applied = await asStaffAdmin<{ effectiveVisibility: Record<string, string>; latestAudit: { action: string; approvalReference: string } }>(
          db,
          'select academy.inspect_launch_course_visibility() as result',
        )
        expect(applied.effectiveVisibility).toMatchObject({
          'basic-os-linux': 'published',
          'git-essentials': 'published',
          assembly: 'unpublished',
          'c-low-level': 'unpublished',
          'computer-architecture': 'unpublished',
          'computer-networking': 'unpublished',
          'operating-systems': 'unpublished',
          'setup-and-environment': 'unpublished',
        })
        expect(applied.latestAudit).toMatchObject({ action: 'launch', approvalReference: REFERENCE })

        const launchAgain = await asStaffAdmin<{ changed: boolean; auditWritten: boolean }>(
          db,
          `select academy.set_launch_course_visibility($1, null, $2, $3, false) as result`,
          [
            applied.effectiveVisibility,
            REFERENCE,
            launch.stateSha256,
          ],
        )
        expect(launchAgain).toMatchObject({ changed: false, auditWritten: false })

        const rollback = await asStaffAdmin<{ changed: boolean; auditWritten: boolean; stateSha256: string }>(
          db,
          `select academy.set_launch_course_visibility(null, $1, $2, $3, true) as result`,
          [baseline.state, REFERENCE, launch.stateSha256],
        )
        expect(rollback).toMatchObject({ changed: true, auditWritten: true, stateSha256: baseline.stateSha256 })

        const restored = await asStaffAdmin<{ stateSha256: string; latestAudit: { action: string } }>(
          db,
          'select academy.inspect_launch_course_visibility() as result',
        )
        expect(restored.stateSha256).toBe(baseline.stateSha256)
        expect(restored.latestAudit.action).toBe('rollback')

        const rollbackAgain = await asStaffAdmin<{ changed: boolean; auditWritten: boolean }>(
          db,
          `select academy.set_launch_course_visibility(null, $1, $2, $3, true) as result`,
          [baseline.state, REFERENCE, baseline.stateSha256],
        )
        expect(rollbackAgain).toMatchObject({ changed: false, auditWritten: false })

        const { rows: audit } = await db.query(
          'select action, approval_reference, rows_changed from academy.course_settings_launch_audit order by event_id',
        )
        expect(audit).toEqual([
          { action: 'launch', approval_reference: REFERENCE, rows_changed: 8 },
          { action: 'rollback', approval_reference: REFERENCE, rows_changed: 8 },
        ])
        expect(typeof bootstrapOwner).toBe('boolean')
      } finally {
        await db.query('rollback').catch(() => undefined)
        await db.query('begin')
        await db.query(`delete from academy.course_settings_launch_audit`)
        await db.query(`delete from academy.course_settings where course_slug = any($1::text[])`, [COURSES])
        await db.query(
          `delete from academy.staff_role_assignment where account_id in (select id from academy.users where issuer = $1)`,
          [ISSUER],
        )
        await db.query(`delete from academy.users where issuer = $1`, [ISSUER])
        await db.query('commit')
      }
    })
  })
})
