import { describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

const wrappers = [
  'run_retention_attempts',
  'run_retention_leads',
  'run_retention_inactive_users',
  'run_retention_privacy_requests',
  'run_retention_staff_authorization_history',
]

const policies = [
  'purge_expired_attempts',
  'purge_expired_leads',
  'purge_inactive_users',
  'purge_expired_privacy_requests',
  'purge_expired_staff_authorization_history',
]

describe('Academy retention database capability', () => {
  it('keeps fixed wrappers and policy authorities on their intended privilege boundary', async () => {
    const db = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
    await db.connect()
    try {
      const result = await db.query<{
        name: string
        owner: string
        security_definer: boolean
        config: string
        retention_can_execute: boolean
        definer_can_execute: boolean
        service_role_can_execute: boolean
      }>(
        `select p.proname as name,
                role.rolname as owner,
                p.prosecdef as security_definer,
                coalesce(array_to_string(p.proconfig, ','), '') as config,
                has_function_privilege('academy_retention', p.oid, 'execute') as retention_can_execute,
                has_function_privilege('academy_retention_definer', p.oid, 'execute') as definer_can_execute,
                has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
           from pg_proc p
           join pg_roles role on role.oid = p.proowner
          where p.pronamespace = 'academy'::regnamespace
            and p.proname = any($1::text[])
          order by p.proname`,
        [[...wrappers, ...policies]],
      )

      expect(result.rows).toHaveLength(10)
      for (const row of result.rows.filter((row) => wrappers.includes(row.name))) {
        expect(row.owner).toBe('academy_retention_definer')
        expect(row.security_definer).toBe(true)
        expect(row.config).toContain('search_path=pg_catalog')
        expect(row.retention_can_execute).toBe(true)
      }
      for (const row of result.rows.filter((row) => policies.includes(row.name))) {
        expect(row.security_definer).toBe(false)
        expect(row.config).toContain('search_path=pg_catalog')
        expect(row.retention_can_execute).toBe(false)
        expect(row.definer_can_execute).toBe(true)
        expect(row.service_role_can_execute).toBe(false)
      }
    } finally {
      await db.end()
    }
  })
})
