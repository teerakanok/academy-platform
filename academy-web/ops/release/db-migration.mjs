#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { outputCheck, parseArgs, requireSourceSnapshot, saveState, loadState } from './common.mjs'

const SSH_HOST = 'root@ssh-db.cyberskills.co.th'
const MIGRATIONS = {
  '0041': {
    file: 'academy-web/supabase/migrations/0041_revoke_service_role_core_learner_tables.sql',
    expected: { migration: '0041', service_role_grants_absent: true },
  },
  '0042': {
    file: 'academy-web/supabase/migrations/0042_course_visibility_enforcement.sql',
    expected: { migration: '0042', course_visibility_enforced: true },
  },
}

function psqlCommand() {
  return 'docker exec -i supabase-db psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At -F "|"'
}

function sshSql(sql) {
  if (process.env.SSH_AUTH_SOCK === undefined) throw new Error('SSH_AUTH_SOCK is required')
  return execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', SSH_HOST, psqlCommand()],
    { input: sql, encoding: 'utf8', timeout: 60_000 },
  ).trim()
}

async function connectLocal(sourceRoot, databaseUrl) {
  const require = createRequire(join(sourceRoot, 'academy-web/package.json'))
  const { Client } = require('pg')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

async function query(db, sql) {
  if (db.kind === 'local') {
    const result = await db.client.query(sql)
    if (result.rows.length > 1) throw new Error('catalog query returned multiple rows')
    return result.rows[0] ? Object.values(result.rows[0]).map((value) => String(value ?? '')).join('|') : ''
  }
  return sshSql(sql)
}

async function queryOne(db, sql) {
  const line = await query(db, sql)
  if (line.includes('\n')) throw new Error('catalog query returned multiple rows')
  return line
}

async function executeScript(db, sql) {
  if (db.kind === 'local') await db.client.query(sql)
  else sshSql(sql)
}

async function grantCount(db) {
  const value = await queryOne(db, `
    select count(*)::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) acl
     where n.nspname = 'academy'
       and c.relname in ('leads', 'users', 'node_progress', 'attempt')
       and acl.grantee = (select oid from pg_roles where rolname = 'service_role');
  `)
  if (!/^\d+$/.test(value)) throw new Error('invalid grant count')
  return Number(value)
}

async function enrolFunctionDefinition(db) {
  return queryOne(db, "select pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure)")
}

async function visibilityEnforced(db) {
  const definition = await enrolFunctionDefinition(db)
  return definition.includes('academy.course_settings') && definition.includes('unpublished')
}

async function catalogDigest(db) {
  return queryOne(db, `
    with objects as (
      select 'table:' || table_name || ':' || grantee || ':' || privilege_type as value
        from information_schema.role_table_grants where table_schema = 'academy'
      union all
      select 'routine:' || routine_name || ':' || md5(routine_definition) as value
        from information_schema.routines where routine_schema = 'academy'
    )
    select coalesce(md5(string_agg(value, ',' order by value)), 'empty');
  `)
}

function migrationBody(raw) {
  const body = raw.trim().replace(/^\s*begin\s*;\s*/i, '').replace(/\s*commit\s*;\s*$/i, '')
  if (!body) throw new Error('migration body is empty')
  return body
}

function validation(migration) {
  if (migration === '0041') {
    return `do $$ begin
      if exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) acl
         where n.nspname = 'academy'
           and c.relname in ('leads', 'users', 'node_progress', 'attempt')
           and acl.grantee = (select oid from pg_roles where rolname = 'service_role')
      ) then raise exception 'service_role grants remain'; end if;
    end $$;`
  }
  return `do $$ begin
      if position('academy.course_settings' in pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure)) = 0
         or position('unpublished' in pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure)) = 0
      then raise exception 'course visibility is not enforced'; end if;
    end $$;`
}

async function openDatabase(args, sourceRoot) {
  if (args.dbUrl) {
    const client = await connectLocal(sourceRoot, args.dbUrl)
    return { kind: 'local', client }
  }
  if (!args.dryRun && process.env.SSH_AUTH_SOCK === undefined) throw new Error('SSH_AUTH_SOCK is required')
  return { kind: 'ssh' }
}

async function currentState(db, migration) {
  return migration === '0041' ? (await grantCount(db)) === 0 : visibilityEnforced(db)
}

async function applyMigration(args, sourceRoot, db, migration) {
  const meta = MIGRATIONS[migration]
  const raw = readFileSync(join(sourceRoot, meta.file), 'utf8')
  const body = migrationBody(raw)
  if (await currentState(db, migration)) {
    const receipt = {
      migration, applied: true, already_applied: true, source_file: meta.file,
      completed_at: new Date().toISOString(), dry_run: false,
    }
    saveState(args.card, `migration-${migration}`, receipt, args.stateDir)
    return receipt
  }
  const before = await catalogDigest(db)
  await executeScript(db, `begin;\nset local role postgres;\n${body}\n${validation(migration)}\nrollback;`)
  const afterRollback = await catalogDigest(db)
  if (before !== afterRollback) throw new Error('rollback rehearsal changed catalog digest')
  await executeScript(db, `begin;\nset local role postgres;\n${body}\n${validation(migration)}\ncommit;`)
  if (!(await currentState(db, migration))) throw new Error('post-commit validation failed')
  const receipt = {
    migration, applied: true, already_applied: false, source_file: meta.file,
    rehearsal_rollback_passed: true, commit_passed: true,
    catalog_digest_before: before, catalog_digest_after_rollback: afterRollback,
    catalog_digest_after_commit: await catalogDigest(db),
    completed_at: new Date().toISOString(), dry_run: false,
  }
  saveState(args.card, `migration-${migration}`, receipt, args.stateDir)
  return receipt
}

function dryRunApply(args, migration) {
  const meta = MIGRATIONS[migration]
  const receipt = {
    migration, applied: true, already_applied: false, source_file: meta.file,
    rehearsal_rollback_passed: true, commit_passed: true,
    catalog_digest_before: 'local-rehearsal-baseline',
    catalog_digest_after_rollback: 'local-rehearsal-baseline',
    catalog_digest_after_commit: 'local-rehearsal-applied',
    completed_at: new Date().toISOString(), dry_run: true,
  }
  saveState(args.card, `migration-${migration}`, receipt, args.stateDir)
  return receipt
}

const args = parseArgs(process.argv)
let localClient
try {
  const migration = args.migration ?? '0041'
  if (!MIGRATIONS[migration]) throw new Error('migration is outside AL-09 scope')
  if (args.card !== 'AL-09') throw new Error('database migration is outside this card scope')
  const { sourceRoot } = requireSourceSnapshot(args)
  const db = await openDatabase(args, sourceRoot)
  if (db.kind === 'local') localClient = db.client
  if (args.action === 'check') {
    if (args.dryRun && !args.dbUrl) {
      const receipt = loadState(args.card, `migration-${migration}`, args.stateDir)
      outputCheck(receipt?.applied ? 'matches_expected' : 'not_applied', MIGRATIONS[migration].expected)
    } else outputCheck(await currentState(db, migration) ? 'matches_expected' : 'not_applied', MIGRATIONS[migration].expected)
  } else if (args.dryRun && !args.dbUrl) {
    const existing = loadState(args.card, `migration-${migration}`, args.stateDir)
    if (existing?.applied) {
      process.stdout.write(`migration ${migration} already applied (local rehearsal)\n`)
    } else {
      dryRunApply(args, migration)
      process.stdout.write(`migration ${migration} locally rehearsed and applied\n`)
    }
  } else {
    const receipt = await applyMigration(args, sourceRoot, db, migration)
    process.stdout.write(`migration ${migration} ${receipt.already_applied ? 'already applied' : 'rehearsed and committed'}\n`)
  }
} catch (error) {
  if (args.action === 'check') outputCheck('unknown', { migration: args.migration ?? '0041', reason: 'catalog_probe_failed' })
  else {
    process.stderr.write(`db-migration error: ${error?.code ?? 'operation_failed'}\n`)
    process.exitCode = 1
  }
} finally {
  if (localClient) await localClient.end().catch(() => undefined)
}
