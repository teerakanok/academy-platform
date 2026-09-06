#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

function parseArgs(argv) {
  if (argv.length !== 1 || (argv[0] !== '--dry-run' && argv[0] !== '--apply')) {
    throw new Error('choose exactly one of --dry-run or --apply')
  }
  return argv[0] === '--apply' ? 'apply' : 'dry-run'
}

const mode = parseArgs(process.argv.slice(2))
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required and must not be printed')
const migration = await readFile(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0030_least_privilege_course_entitlement.sql'),
  'utf8',
)
const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  const authority = await client.query(`
    select rolsuper or rolcreaterole as allowed
      from pg_roles where rolname = current_user
  `)
  if (authority.rows[0]?.allowed !== true) {
    throw new Error('migration review requires a CREATEROLE database operator')
  }
  await client.query('begin')
  await client.query(migration)
  const checks = await client.query(`
    select
      has_table_privilege('academy_runtime', 'academy.course_entitlement', 'insert') as runtime_insert,
      has_table_privilege('service_role', 'academy.course_entitlement', 'insert') as service_insert,
      has_table_privilege('service_role', 'academy.course_entitlement', 'select') as service_select,
      has_function_privilege('academy_runtime', 'academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)', 'execute') as runtime_set,
      has_function_privilege('academy_entitlement_operator', 'academy.set_course_entitlement(uuid, uuid, text, boolean, text, timestamptz, text)', 'execute') as operator_set,
      has_function_privilege('service_role', 'academy.sync_service_activation(uuid, text, integer)', 'execute') as service_sync,
      has_function_privilege('academy_runtime', 'academy.sync_service_activation(uuid, text, integer)', 'execute') as runtime_sync
  `)
  if (checks.rows[0].runtime_insert || checks.rows[0].service_insert || checks.rows[0].service_select
      || checks.rows[0].runtime_set || checks.rows[0].service_sync) {
    throw new Error('post-migration privilege checks failed')
  }
  if (!checks.rows[0].operator_set || !checks.rows[0].runtime_sync) {
    throw new Error('post-migration required-role checks failed')
  }
  if (mode === 'dry-run') {
    await client.query('rollback')
    console.log(`mode=dry_run result=rolled_back checks=${JSON.stringify(checks.rows[0])}`)
  } else {
    await client.query('commit')
    console.log(`mode=apply result=committed checks=${JSON.stringify(checks.rows[0])}`)
  }
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
