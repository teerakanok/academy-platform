import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { requiredEnv } from './setup'

const migrationPath = join(__dirname, '../../supabase/migrations/0041_revoke_service_role_core_learner_tables.sql')
const rollbackPath = join(
  __dirname,
  '../../supabase/rollbacks/0041_revoke_service_role_core_learner_tables.rollback.sql',
)
const migration = readFileSync(migrationPath, 'utf8')
const rollback = readFileSync(rollbackPath, 'utf8')

const coreLearnerTables = [
  'academy.leads',
  'academy.users',
  'academy.node_progress',
  'academy.attempt',
] as const

const tablePrivileges = [
  'select',
  'insert',
  'update',
  'delete',
  'truncate',
  'references',
  'trigger',
] as const

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function tablePrivilegeRows(client: Client, role: string) {
  const result = await client.query<{ table_name: string; privilege: string }>(
    `select table_name, privilege_type as privilege
       from information_schema.role_table_grants
      where table_schema = 'academy'
        and table_name = any($1::text[])
        and grantee = $2
      order by table_name, privilege_type`,
    [coreLearnerTables.map((name) => name.split('.')[1]), role],
  )
  return result.rows
}

describe('service_role core learner table revocation', () => {
  it('removes effective and direct grants on the four early learner tables', async () => {
    const result = await withDb(async (client) => {
      const effective = await client.query(
        `select ${coreLearnerTables
          .map(
            (table, tableIndex) =>
              tablePrivileges
                .map(
                  (privilege, privilegeIndex) =>
                    `has_table_privilege('service_role', '${table}', '${privilege}') as t${tableIndex}_p${privilegeIndex}`,
                )
                .join(', '),
          )
          .join(', ')}`,
      )
      return {
        effective: effective.rows[0],
        direct: await tablePrivilegeRows(client, 'service_role'),
      }
    })

    for (const value of Object.values(result.effective)) {
      expect(value).toBe(false)
    }
    expect(result.direct).toEqual([])
  })

  it('leaves the dedicated runtime table and representative RPC grants intact', async () => {
    const result = await withDb(async (client) => {
      const tables = await client.query(
        `select has_table_privilege('academy_runtime', 'academy.leads', 'insert') as leads_insert,
                has_table_privilege('academy_runtime', 'academy.users', 'select') as users_select,
                has_table_privilege('academy_runtime', 'academy.node_progress', 'delete') as progress_delete,
                has_table_privilege('academy_runtime', 'academy.attempt', 'update') as attempt_update`,
      )
      const functions = await client.query(
        `select has_function_privilege(
                    'academy_runtime',
                    'academy.record_node_progress(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,text)',
                    'execute'
                  ) as runtime_progress,
                has_function_privilege(
                    'academy_runtime',
                    'academy.finalize_attempt(uuid,uuid,uuid,jsonb)',
                    'execute'
                  ) as runtime_attempt,
                has_function_privilege(
                    'academy_entitlement_operator',
                    'academy.set_course_entitlement(uuid,uuid,text,boolean,text,timestamptz,text)',
                    'execute'
                  ) as operator_entitlement`,
      )
      return { tables: tables.rows[0], functions: functions.rows[0] }
    })

    expect(result.tables).toEqual({
      leads_insert: true,
      users_select: true,
      progress_delete: true,
      attempt_update: true,
    })
    expect(result.functions).toEqual({
      runtime_progress: true,
      runtime_attempt: true,
      operator_entitlement: true,
    })
  })

  it.skipIf(process.env.ACADEMY_REHEARSE_ROLLBACK !== '1')(
    'rollback restores the prior grants and reapplying 0041 removes them again',
    async () => {
      await withDb(async (client) => {
        let restored = false
        try {
          await client.query(rollback)
          restored = true

          const effective = await client.query(
            `select ${coreLearnerTables
              .map(
                (table, tableIndex) =>
                  tablePrivileges
                    .map(
                      (privilege, privilegeIndex) =>
                        `has_table_privilege('service_role', '${table}', '${privilege}') as t${tableIndex}_p${privilegeIndex}`,
                    )
                    .join(', '),
              )
              .join(', ')}`,
          )
          for (const value of Object.values(effective.rows[0])) {
            expect(value).toBe(true)
          }
          expect(await tablePrivilegeRows(client, 'service_role')).toHaveLength(
            coreLearnerTables.length * tablePrivileges.length,
          )
        } finally {
          if (restored) {
            await client.query(migration)
          }
        }

        expect(await tablePrivilegeRows(client, 'service_role')).toEqual([])
      })
    },
  )
})
