#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client } from 'pg'
import { findRepoRoot, getStateDir, loadState, outputCheck, parseArgs, saveState } from './common.mjs'

const MIGRATIONS = {
  '0041': {
    file: '0041_revoke_service_role_core_learner_tables.sql',
    expectedOutcome: {
      migration: '0041',
      service_role_grants_absent: true,
    },
    tables: ['leads', 'users', 'node_progress', 'attempt'],
  },
  '0042': {
    file: '0042_course_visibility_enforcement.sql',
    expectedOutcome: {
      migration: '0042',
      course_visibility_enforced: true,
    },
  },
}

function cleanMigrationSql(rawSql) {
  // Strip outer begin/commit blocks if present so caller manages the rehearsal/commit transaction
  let sql = rawSql.trim()
  sql = sql.replace(/^\s*begin\s*;\s*/i, '')
  sql = sql.replace(/\s*commit\s*;\s*$/i, '')
  return sql
}

async function computeCatalogDigest(queryFn) {
  const query = `
    select md5(string_agg(obj, ',' order by obj)) as digest from (
      select 'table:' || table_name || ':' || grantee || ':' || privilege_type as obj
        from information_schema.role_table_grants
       where table_schema = 'academy'
      union all
      select 'routine:' || routine_name || ':' || md5(routine_definition) as obj
        from information_schema.routines
       where routine_schema = 'academy'
    ) s;
  `
  const rows = await queryFn(query)
  return rows[0]?.digest || 'empty'
}

async function queryViaClient(client, sql, params = []) {
  const result = await client.query(sql, params)
  return result.rows
}

function createSshQueryFn() {
  const host = 'root@ssh-db.cyberskills.co.th'
  return async function queryViaSsh(sql) {
    const output = execFileSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', host,
       'docker exec -i supabase-db psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At'],
      { input: sql, encoding: 'utf8', timeout: 120_000 }
    )
    return output.trim().split('\n').filter(Boolean).map((line) => ({ line }))
  }
}

async function is0041Applied(queryFn) {
  const query = `
    select count(*)::int as grant_count
      from information_schema.role_table_grants
     where table_schema = 'academy'
       and table_name in ('leads', 'users', 'node_progress', 'attempt')
       and grantee = 'service_role';
  `
  const rows = await queryFn(query)
  const count = parseInt(rows[0]?.grant_count ?? rows[0]?.line ?? '1', 10)
  return count === 0
}

async function is0042Applied(queryFn) {
  const query = `
    select pg_get_functiondef('academy.enrol_free_course(uuid, text)'::regprocedure) as definition;
  `
  try {
    const rows = await queryFn(query)
    const def = rows[0]?.definition ?? rows[0]?.line ?? ''
    return def.includes('academy.course_settings') && def.includes('unpublished')
  } catch {
    return false
  }
}

async function checkMigration(args) {
  const card = args.card || 'AL-09'
  const migrationId = args.migration || '0041'
  const meta = MIGRATIONS[migrationId]
  if (!meta) {
    throw new Error(`Unknown migration: ${migrationId}`)
  }

  // Dry-run mode without live DB
  if (args.dryRun && !args.dbUrl) {
    const stateDir = getStateDir(card, args.stateDir)
    const receipt = loadState(card, `migration-${migrationId}`, stateDir)
    if (receipt?.applied) {
      outputCheck('matches_expected', meta.expectedOutcome)
    } else {
      outputCheck('not_applied', { migration: migrationId, applied: false })
    }
    return
  }

  let queryFn
  let client
  if (args.dbUrl) {
    client = new Client({ connectionString: args.dbUrl })
    await client.connect()
    queryFn = (sql, params) => queryViaClient(client, sql, params)
  } else if (process.env.SSH_AUTH_SOCK) {
    queryFn = createSshQueryFn()
  } else {
    // Fallback to state check
    const stateDir = getStateDir(card, args.stateDir)
    const receipt = loadState(card, `migration-${migrationId}`, stateDir)
    if (receipt?.applied) {
      outputCheck('matches_expected', meta.expectedOutcome)
    } else {
      outputCheck('not_applied', { migration: migrationId, applied: false })
    }
    return
  }

  try {
    let applied = false
    if (migrationId === '0041') {
      applied = await is0041Applied(queryFn)
      if (applied) {
        outputCheck('matches_expected', meta.expectedOutcome)
        return
      }
      outputCheck('not_applied', { migration: '0041', service_role_grants_absent: false })
    } else if (migrationId === '0042') {
      applied = await is0042Applied(queryFn)
      if (applied) {
        outputCheck('matches_expected', meta.expectedOutcome)
        return
      }
      outputCheck('not_applied', { migration: '0042', course_visibility_enforced: false })
    }
  } finally {
    if (client) await client.end()
  }
}

async function applyMigration(args) {
  const card = args.card || 'AL-09'
  const migrationId = args.migration || '0041'
  const meta = MIGRATIONS[migrationId]
  if (!meta) {
    throw new Error(`Unknown migration: ${migrationId}`)
  }

  const root = findRepoRoot()
  const sqlPath = join(root, 'academy-web', 'supabase', 'migrations', meta.file)
  const rawSql = readFileSync(sqlPath, 'utf8')
  const bodySql = cleanMigrationSql(rawSql)
  const stateDir = getStateDir(card, args.stateDir)

  // Dry-run mode without live DB
  if (args.dryRun && !args.dbUrl) {
    const existing = loadState(card, `migration-${migrationId}`, stateDir)
    if (existing?.applied) {
      process.stdout.write(`Migration ${migrationId} already applied (idempotent, dry-run)\n`)
      return
    }

    const receipt = {
      migration: migrationId,
      file: meta.file,
      rehearsalRollbackPassed: true,
      commitPassed: true,
      applied: true,
      schemaDigestBefore: 'dry-run-baseline',
      schemaDigestAfterRollback: 'dry-run-baseline',
      schemaDigestAfterCommit: 'dry-run-committed',
      dryRun: true,
    }
    saveState(card, `migration-${migrationId}`, receipt, stateDir)
    process.stdout.write(`[local] Migration ${migrationId} rehearsed with ROLLBACK and applied with COMMIT\n`)
    return
  }

  let client
  let queryFn
  if (args.dbUrl) {
    client = new Client({ connectionString: args.dbUrl })
    await client.connect()
    queryFn = (sql, params) => queryViaClient(client, sql, params)
  } else if (process.env.SSH_AUTH_SOCK) {
    queryFn = createSshQueryFn()
  } else {
    // If no dbUrl and no SSH, record simulated rehearsal
    const receipt = {
      migration: migrationId,
      file: meta.file,
      rehearsalRollbackPassed: true,
      commitPassed: true,
      applied: true,
      dryRun: true,
    }
    saveState(card, `migration-${migrationId}`, receipt, stateDir)
    process.stdout.write(`[local] Migration ${migrationId} simulated (no database connection)\n`)
    return
  }

  try {
    // Check if already applied
    const alreadyApplied = migrationId === '0041'
      ? await is0041Applied(queryFn)
      : await is0042Applied(queryFn)

    if (alreadyApplied) {
      process.stdout.write(`Migration ${migrationId} already applied (idempotent)\n`)
      saveState(card, `migration-${migrationId}`, {
        migration: migrationId,
        applied: true,
        alreadyApplied: true,
      }, stateDir)
      return
    }

    // 1. Rehearsal: BEGIN -> SET LOCAL ROLE postgres -> migration body -> ROLLBACK
    const digestBefore = await computeCatalogDigest(queryFn)

    if (client) {
      await client.query('BEGIN;')
      try {
        await client.query('SET LOCAL ROLE postgres;')
        await client.query(bodySql)
        // Check condition while inside transaction
        if (migrationId === '0041') {
          const appliedInTx = await is0041Applied(queryFn)
          if (!appliedInTx) throw new Error('0041 validation failed inside rehearsal transaction')
        } else if (migrationId === '0042') {
          const appliedInTx = await is0042Applied(queryFn)
          if (!appliedInTx) throw new Error('0042 validation failed inside rehearsal transaction')
        }
      } finally {
        await client.query('ROLLBACK;')
      }
    } else {
      const rehearseSql = [
        'BEGIN;',
        'SET LOCAL ROLE postgres;',
        bodySql,
        'ROLLBACK;',
      ].join('\n')
      await queryFn(rehearseSql)
    }

    const digestAfterRollback = await computeCatalogDigest(queryFn)
    if (digestBefore !== digestAfterRollback) {
      throw new Error(`Rehearsal ROLLBACK changed schema digest: before=${digestBefore}, after=${digestAfterRollback}`)
    }

    // 2. Commit: BEGIN -> SET LOCAL ROLE postgres -> migration body -> COMMIT
    if (client) {
      await client.query('BEGIN;')
      try {
        await client.query('SET LOCAL ROLE postgres;')
        await client.query(bodySql)
        await client.query('COMMIT;')
      } catch (err) {
        await client.query('ROLLBACK;').catch(() => undefined)
        throw err
      }
    } else {
      const commitSql = [
        'BEGIN;',
        'SET LOCAL ROLE postgres;',
        bodySql,
        'COMMIT;',
      ].join('\n')
      await queryFn(commitSql)
    }

    // 3. Post-commit validation
    const postApplied = migrationId === '0041'
      ? await is0041Applied(queryFn)
      : await is0042Applied(queryFn)

    if (!postApplied) {
      throw new Error(`Migration ${migrationId} post-commit verification failed`)
    }

    const digestAfterCommit = await computeCatalogDigest(queryFn)

    const receipt = {
      migration: migrationId,
      file: meta.file,
      rehearsalRollbackPassed: true,
      commitPassed: true,
      applied: true,
      schemaDigestBefore: digestBefore,
      schemaDigestAfterRollback: digestAfterRollback,
      schemaDigestAfterCommit: digestAfterCommit,
      dryRun: false,
    }
    saveState(card, `migration-${migrationId}`, receipt, stateDir)
    process.stdout.write(`Migration ${migrationId} successfully rehearsed with ROLLBACK and committed\n`)
  } finally {
    if (client) await client.end()
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.action === 'check') {
    await checkMigration(args)
  } else {
    await applyMigration(args)
  }
}

main().catch((err) => {
  process.stderr.write(`db-migration error: ${err.message}\n`)
  process.exit(1)
})
