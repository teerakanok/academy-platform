import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'

import {
  assertNoAmbientContainerAuthority,
  attemptOwnedContainerCreate,
  cleanupOwnedContainer,
  createDockerInvoker,
  inspectPinnedPostgresImage,
  installTerminationHandlers,
} from './test-identity-lifecycle-page-store-postgres.mjs'

const PINNED_DOCKER_CLI = '/usr/local/bin/docker'
const PINNED_DOCKER_CLI_TARGET = '/Applications/Docker.app/Contents/Resources/bin/docker'
const PINNED_DOCKER_SOCKET = '/Users/teerakanok/.docker/run/docker.sock'
const PINNED_POSTGRES_IMAGE_ID = 'sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302'
const FIXED_OWNER_LABEL = 'com.cyberskills.test'
const FIXED_OWNER_VALUE = 'academy-pending-waitlist-postgres'
const RUN_OWNER_LABEL = 'com.cyberskills.test-run'
const CONTAINER_INSPECTION_TIMEOUT_MS = 5_000

function validatePinnedDockerAuthority() {
  const cliLink = lstatSync(PINNED_DOCKER_CLI)
  const cliTarget = realpathSync(PINNED_DOCKER_CLI)
  const cli = statSync(cliTarget)
  if (!cliLink.isSymbolicLink()
    || cliTarget !== PINNED_DOCKER_CLI_TARGET
    || !cli.isFile()
    || cli.uid !== process.getuid()
    || (cli.mode & 0o022) !== 0) {
    throw new Error('Pinned Docker CLI authority is invalid')
  }

  const socket = statSync(PINNED_DOCKER_SOCKET)
  if (!socket.isSocket()
    || socket.uid !== process.getuid()
    || (socket.mode & 0o022) !== 0) {
    throw new Error('Pinned Docker socket is not the exact owned local authority')
  }
  return { cliPath: cliTarget, socketPath: PINNED_DOCKER_SOCKET }
}

function createPrivateDockerConfig() {
  const directory = mkdtempSync(join(tmpdir(), 'academy-pending-waitlist-docker-'))
  writeFileSync(join(directory, 'config.json'), '{}\n', { mode: 0o600 })
  return directory
}

function buildOwnedPostgresRunArguments({ containerName, ownerNonce, port, database, username, password }) {
  if (!/^academy-pending-waitlist-[1-9][0-9]{0,9}-[0-9a-f]{8}$/.test(containerName ?? '')
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ownerNonce ?? '')
    || !containerName.endsWith(`-${ownerNonce.slice(0, 8)}`)
    || !/^[a-z0-9_]{8,40}$/.test(database ?? '')
    || !/^[a-z0-9_]{8,40}$/.test(username ?? '')
    || !/^[A-Za-z0-9_-]{1,128}$/.test(password ?? '')
    || !Number.isInteger(port)
    || port < 61_000
    || port > 61_999) {
    throw new Error('Owned pending-waitlist PostgreSQL run arguments are invalid')
  }
  return [
    'run', '--detach', '--rm', '--pull', 'never',
    '--name', containerName,
    '--label', `${FIXED_OWNER_LABEL}=${FIXED_OWNER_VALUE}`,
    '--label', `${RUN_OWNER_LABEL}=${ownerNonce}`,
    '--publish', `127.0.0.1:${port}:5432`,
    '--env', 'POSTGRES_DB',
    '--env', 'POSTGRES_USER',
    '--env', 'POSTGRES_PASSWORD',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,nodev',
    PINNED_POSTGRES_IMAGE_ID,
  ]
}

function readContainerInspection(invoke, containerName) {
  const response = invoke(['container', 'inspect', containerName], {
    timeoutMs: CONTAINER_INSPECTION_TIMEOUT_MS,
  })
  if (response.status !== 0 || response.error || String(response.stderr ?? '').trim() !== '') {
    throw new Error('Owned pending-waitlist container inspection is uncertain')
  }
  let inspection
  try {
    inspection = JSON.parse(String(response.stdout ?? ''))
  } catch {
    throw new Error('Owned pending-waitlist container inspection is invalid')
  }
  if (!Array.isArray(inspection) || inspection.length !== 1 || typeof inspection[0] !== 'object' || inspection[0] === null) {
    throw new Error('Owned pending-waitlist container inspection is invalid')
  }
  return inspection[0]
}

function captureContainerEvidence(invoke, { containerName, nonce, port }) {
  const inspection = readContainerInspection(invoke, containerName)
  const labels = inspection.Config?.Labels
  const labelKeys = labels && typeof labels === 'object' && !Array.isArray(labels)
    ? Object.keys(labels).sort()
    : []
  const portKeys = inspection.NetworkSettings?.Ports && typeof inspection.NetworkSettings.Ports === 'object'
    ? Object.keys(inspection.NetworkSettings.Ports)
    : []
  const bindings = inspection.NetworkSettings?.Ports?.['5432/tcp']
  if (inspection.Id === undefined
    || !/^[0-9a-f]{64}$/.test(inspection.Id)
    || inspection.Name !== `/${containerName}`
    || inspection.Image !== PINNED_POSTGRES_IMAGE_ID
    || inspection.State?.Running !== true
    || inspection.Config?.Image !== PINNED_POSTGRES_IMAGE_ID
    || labelKeys.length !== 2
    || labelKeys[0] !== FIXED_OWNER_LABEL
    || labelKeys[1] !== RUN_OWNER_LABEL
    || labels[FIXED_OWNER_LABEL] !== FIXED_OWNER_VALUE
    || labels[RUN_OWNER_LABEL] !== nonce
    || !Array.isArray(inspection.Mounts)
    || inspection.Mounts.length !== 0
    || !hasExactTmpfsOptions(inspection.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'])
    || portKeys.length !== 1
    || portKeys[0] !== '5432/tcp'
    || !Array.isArray(bindings)
    || bindings.length !== 1
    || bindings[0]?.HostIp !== '127.0.0.1'
    || bindings[0]?.HostPort !== String(port)) {
    throw new Error('Owned pending-waitlist container authority does not match inspection')
  }
  return { containerId: inspection.Id, imageId: inspection.Image }
}

function hasExactTmpfsOptions(value) {
  return typeof value === 'string'
    && value.split(',').sort().join(',') === ['rw', 'noexec', 'nosuid', 'nodev'].sort().join(',')
}

function migrationFiles() {
  return readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join('supabase/migrations', name))
}

async function executeSqlFile(db, label, path, transactional) {
  const sql = readFileSync(path, 'utf8')
  if (!transactional) {
    await db.query(sql)
    process.stdout.write(`SQL APPLIED ${label}: ${path}\n`)
    return
  }
  await db.query('begin')
  try {
    await db.query(sql)
    await db.query('commit')
    process.stdout.write(`SQL APPLIED ${label}: ${path}\n`)
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

async function bootstrapFixtureRoles(db) {
  const existing = await db.query(
    `select rolname from pg_roles where rolname = any($1::text[])`,
    [['postgres', 'anon', 'authenticated', 'service_role']],
  )
  if (existing.rows.length !== 0) {
    throw new Error('Disposable fixture is not free of standard role names')
  }
  await db.query(`create role postgres nologin noinherit`)
  await db.query(`create role anon nologin noinherit`)
  await db.query(`create role authenticated nologin noinherit`)
  await db.query(`create role service_role nologin noinherit`)
  await executeSqlFile(db, 'PRIVILEGED', 'supabase/privileged/academy-data-api-roles.sql', false)
  await executeSqlFile(db, 'PRIVILEGED', 'supabase/privileged/academy-retention-api-roles.sql', false)
}

async function applyAllMigrations(db) {
  const files = migrationFiles()
  if (files.length !== 43) throw new Error(`Expected 43 migrations, found ${files.length}`)
  for (const path of files) {
    await executeSqlFile(db, 'MIGRATION', path, true)
  }
  await executeSqlFile(
    db,
    'PRIVILEGED',
    'supabase/privileged/academy-retention-api-function-owners.sql',
    false,
  )
}

async function withRole(db, role, operation) {
  await db.query(`set role ${role}`)
  try {
    return await operation()
  } finally {
    await db.query('reset role')
  }
}

async function expectPermissionDenied(operation) {
  try {
    await operation()
  } catch (error) {
    if (/permission denied/i.test(String(error))) return
    throw error
  }
  throw new Error('Expected a permission-denied failure')
}

function expectValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function instantMilliseconds(value, label) {
  const milliseconds = value instanceof Date
    ? value.getTime()
    : Date.parse(String(value))
  if (!Number.isFinite(milliseconds)) throw new Error(`${label}: invalid timestamp`)
  return milliseconds
}

async function insertWithdrawnLead(db, email, requestedAt) {
  const inserted = await db.query(
    `insert into academy.leads (
       email, consent_at, consent_text_version, marketing_consent_expires_at, marketing_withdrawn_at
     ) values (
       $1, now() - interval '2 years', 'v3', now() - interval '1 year', $2
     )
     returning id, to_jsonb(leads) as snapshot`,
    [email, requestedAt],
  )
  const leadId = inserted.rows[0].id
  await db.query(
    `insert into academy.consent_events (
       lead_id, consent_at, consent_text_version, event_type, source
     ) values ($1, $2, 'v3', 'withdrawn', 'unsubscribe-link')`,
    [leadId, requestedAt],
  )
  return { leadId, snapshot: inserted.rows[0].snapshot }
}

async function callPendingRequest(db, email, requestedAt) {
  return withRole(db, 'academy_runtime', () => db.query(
    `select academy.record_pending_waitlist_request(
       $1, $2::timestamptz, 'v3', 'first-source', null, null, null
     ) as result`,
    [email, requestedAt],
  ))
}

async function assertPendingIntake(db) {
  const email = `withdrawn-${randomUUID()}@example.com`
  const requestedAt = new Date().toISOString()
  const lead = await insertWithdrawnLead(db, email, requestedAt)
  const first = await callPendingRequest(db, `  ${email.toUpperCase()}  `, requestedAt)
  const second = await callPendingRequest(db, email, new Date(Date.now() + 60_000).toISOString())
  const pending = await db.query(
    `select email, requested_consent_text_version, utm_source, requested_at
       from academy.pending_waitlist_requests where email = $1`,
    [email],
  )
  const after = await db.query(`select to_jsonb(leads) as snapshot from academy.leads where id = $1`, [lead.leadId])
  const events = await db.query(`select event_type from academy.consent_events where lead_id = $1`, [lead.leadId])
  const active = await db.query(`select email from academy.active_marketing_leads where email = $1`, [email])

  expectValue(first.rows.length, 1, 'pending first call result shape')
  expectValue(second.rows.length, 1, 'pending second call result shape')
  expectValue(pending.rows.length, 1, 'pending dedup row count')
  expectValue(pending.rows[0].email, email, 'pending normalized email')
  expectValue(pending.rows[0].requested_consent_text_version, 'v3', 'pending requested version')
  expectValue(pending.rows[0].utm_source, 'first-source', 'pending dedup metadata')
  expectValue(
    instantMilliseconds(pending.rows[0].requested_at, 'pending stored timestamp'),
    instantMilliseconds(requestedAt, 'pending fixture timestamp'),
    'pending dedup timestamp',
  )
  expectValue(JSON.stringify(after.rows[0].snapshot), JSON.stringify(lead.snapshot), 'withdrawn lead unchanged')
  expectValue(events.rows.length, 1, 'withdrawal event count unchanged')
  expectValue(events.rows[0].event_type, 'withdrawn', 'withdrawal event unchanged')
  expectValue(active.rows.length, 0, 'no active marketing grant')
  return email
}

async function assertDefaultDenyAndNoGrantPath(db, email) {
  const privileges = await db.query(
    `select
       (select relrowsecurity from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'academy' and c.relname = 'pending_waitlist_requests') as rls,
       has_table_privilege('academy_runtime', 'academy.pending_waitlist_requests', 'insert') as runtime_insert,
       (has_table_privilege('academy_runtime', 'academy.pending_waitlist_requests', 'select')
        or has_table_privilege('academy_runtime', 'academy.pending_waitlist_requests', 'update')
        or has_table_privilege('academy_runtime', 'academy.pending_waitlist_requests', 'delete')) as runtime_direct,
       (has_table_privilege('anon', 'academy.pending_waitlist_requests', 'select')
        or has_table_privilege('anon', 'academy.pending_waitlist_requests', 'insert')
        or has_table_privilege('anon', 'academy.pending_waitlist_requests', 'update')
        or has_table_privilege('anon', 'academy.pending_waitlist_requests', 'delete')) as anon_direct,
       (has_table_privilege('authenticated', 'academy.pending_waitlist_requests', 'select')
        or has_table_privilege('authenticated', 'academy.pending_waitlist_requests', 'insert')
        or has_table_privilege('authenticated', 'academy.pending_waitlist_requests', 'update')
        or has_table_privilege('authenticated', 'academy.pending_waitlist_requests', 'delete')) as authenticated_direct,
       (has_table_privilege('service_role', 'academy.pending_waitlist_requests', 'select')
        or has_table_privilege('service_role', 'academy.pending_waitlist_requests', 'insert')
        or has_table_privilege('service_role', 'academy.pending_waitlist_requests', 'update')
        or has_table_privilege('service_role', 'academy.pending_waitlist_requests', 'delete')) as service_direct,
       has_table_privilege('academy_retention_definer', 'academy.pending_waitlist_requests', 'delete') as retention_delete,
       has_table_privilege('academy_retention_definer', 'academy.pending_waitlist_requests', 'select') as retention_table_select,
       has_column_privilege('academy_retention_definer', 'academy.pending_waitlist_requests', 'email', 'select') as retention_email_select,
       has_column_privilege('academy_retention_definer', 'academy.pending_waitlist_requests', 'requested_at', 'select') as retention_time_select,
       has_column_privilege('academy_retention_definer', 'academy.pending_waitlist_requests', 'utm_source', 'select') as retention_source_select,
       has_function_privilege('academy_runtime', 'academy.record_pending_waitlist_request(text, timestamptz, text, text, text, text, text)', 'execute') as pending_execute,
       exists (
         select 1 from information_schema.routine_privileges
          where routine_schema = 'academy'
            and routine_name = 'record_pending_waitlist_request'
            and grantee = 'PUBLIC'
            and privilege_type = 'EXECUTE'
       ) as public_execute,
       has_function_privilege('service_role', 'academy.record_pending_waitlist_request(text, timestamptz, text, text, text, text, text)', 'execute') as service_execute,
       has_function_privilege('academy_runtime', 'academy.record_lead_consent(text, timestamptz, text, text, text, text, text)', 'execute') as grant_execute`,
  )
  expectValue(privileges.rows[0].rls, true, 'pending RLS enabled')
  expectValue(privileges.rows[0].runtime_insert, true, 'runtime insert only')
  expectValue(privileges.rows[0].runtime_direct, false, 'runtime direct access denied')
  expectValue(privileges.rows[0].anon_direct, false, 'anon direct access denied')
  expectValue(privileges.rows[0].authenticated_direct, false, 'authenticated direct access denied')
  expectValue(privileges.rows[0].service_direct, false, 'service role direct access denied')
  expectValue(privileges.rows[0].retention_delete, true, 'retention delete')
  expectValue(privileges.rows[0].retention_table_select, false, 'retention table-wide select denied')
  expectValue(privileges.rows[0].retention_email_select, true, 'retention exact email select')
  expectValue(privileges.rows[0].retention_time_select, true, 'retention exact requested_at select')
  expectValue(privileges.rows[0].retention_source_select, false, 'retention extra source select denied')
  expectValue(privileges.rows[0].pending_execute, true, 'runtime pending execute')
  expectValue(privileges.rows[0].public_execute, false, 'public pending execute denied')
  expectValue(privileges.rows[0].service_execute, false, 'service pending execute denied')
  expectValue(privileges.rows[0].grant_execute, false, 'grant RPC execute denied')

  await withRole(db, 'academy_runtime', async () => {
    await expectPermissionDenied(() => db.query(`select email from academy.pending_waitlist_requests`))
    await expectPermissionDenied(() => db.query(
      `select academy.record_lead_consent($1, now(), 'v3')`,
      [email],
    ))
  })
}

async function assertNoReturnValueLeak(db, knownEmail) {
  const known = await callPendingRequest(db, knownEmail, new Date().toISOString())
  const missing = await callPendingRequest(db, `missing-${randomUUID()}@example.com`, new Date().toISOString())
  const metadata = await db.query(
    `select p.prorettype = 'void'::regtype as returns_void, p.proretset as returns_set
       from pg_proc p
      where p.oid = 'academy.record_pending_waitlist_request(text,timestamptz,text,text,text,text,text)'::regprocedure`,
  )
  expectValue(metadata.rows.length, 1, 'pending function metadata')
  expectValue(metadata.rows[0].returns_void, true, 'pending function returns void')
  expectValue(metadata.rows[0].returns_set, false, 'pending function does not return a set')
  expectValue(known.rows.length, 1, 'known pending result row count')
  expectValue(missing.rows.length, 1, 'missing pending result row count')
  expectValue(known.rows[0].result, '', 'known pending canonical void value')
  expectValue(missing.rows[0].result, known.rows[0].result, 'missing and known void values differ')
}

async function assertRetentionWrapper(db) {
  const expiredAt = new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString()
  const pendingEmail = `retention-pending-${randomUUID()}@example.com`
  const leadEmail = `retention-lead-${randomUUID()}@example.com`
  await callPendingRequest(db, pendingEmail, expiredAt)
  await db.query(
    `insert into academy.leads (
       email, consent_at, consent_text_version, marketing_consent_expires_at
     ) values ($1, $2, 'v3', $2::timestamptz + interval '3 years')`,
    [leadEmail, expiredAt],
  )
  const metadata = await db.query(
    `select roles.rolname as owner, p.prosecdef as security_definer,
            has_function_privilege('academy_retention', p.oid, 'execute') as retention_execute
       from pg_proc p join pg_roles roles on roles.oid = p.proowner
      where p.oid = 'academy.run_retention_leads()'::regprocedure`,
  )
  expectValue(metadata.rows.length, 1, 'retention wrapper metadata')
  expectValue(metadata.rows[0].owner, 'academy_retention_definer', 'retention wrapper owner')
  expectValue(metadata.rows[0].security_definer, true, 'retention wrapper definer mode')
  expectValue(metadata.rows[0].retention_execute, true, 'retention role wrapper execute')

  const deleted = await withRole(db, 'academy_retention', () => db.query(
    `select academy.run_retention_leads() as deleted`,
  ))
  expectValue(deleted.rows[0].deleted, 2, 'retention wrapper deleted pending and lead')
  const remaining = await db.query(
    `select
       (select count(*) from academy.pending_waitlist_requests where email = $1) as pending,
       (select count(*) from academy.leads where email = $2) as lead`,
    [pendingEmail, leadEmail],
  )
  expectValue(Number(remaining.rows[0].pending), 0, 'expired pending retained unexpectedly')
  expectValue(Number(remaining.rows[0].lead), 0, 'expired lead retained unexpectedly')
}

async function assertCombinedRetentionLimit(db) {
  const expiredAt = new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString()
  const pendingEmail = `retention-pending-${randomUUID()}@example.com`
  const leadEmail = `retention-lead-${randomUUID()}@example.com`
  await callPendingRequest(db, pendingEmail, expiredAt)
  await db.query(
    `insert into academy.leads (
       email, consent_at, consent_text_version, marketing_consent_expires_at
     ) values ($1, $2, 'v3', $2::timestamptz + interval '3 years')`,
    [leadEmail, expiredAt],
  )

  const first = await withRole(db, 'academy_retention_definer', () => db.query(
    `select academy.purge_expired_leads(3, 1) as deleted`,
  ))
  expectValue(first.rows[0].deleted, 1, 'first combined retention batch')
  const afterFirst = await db.query(
    `select
       (select count(*) from academy.pending_waitlist_requests where email = $1) as pending,
       (select count(*) from academy.leads where email = $2) as lead`,
    [pendingEmail, leadEmail],
  )
  expectValue(
    Number(afterFirst.rows[0].pending) + Number(afterFirst.rows[0].lead),
    1,
    'combined retention limit after first batch',
  )

  const second = await withRole(db, 'academy_retention_definer', () => db.query(
    `select academy.purge_expired_leads(3, 1) as deleted`,
  ))
  expectValue(second.rows[0].deleted, 1, 'second combined retention batch')
  const afterSecond = await db.query(
    `select
       (select count(*) from academy.pending_waitlist_requests where email = $1) as pending,
       (select count(*) from academy.leads where email = $2) as lead`,
    [pendingEmail, leadEmail],
  )
  expectValue(Number(afterSecond.rows[0].pending), 0, 'pending row after second batch')
  expectValue(Number(afterSecond.rows[0].lead), 0, 'lead row after second batch')
}

function probePendingWaitlistPostgres(invoke, containerName, environment, database, username) {
  const ready = invoke([
    'exec', containerName, 'pg_isready', '--host', '127.0.0.1',
    '--username', username, '--dbname', database,
  ], { env: environment })
  if (ready.status !== 0 || ready.error) return false

  const roundtrip = invoke([
    'exec', containerName, 'psql', '--host', '127.0.0.1',
    '--username', username, '--dbname', database,
    '--tuples-only', '--no-align', '--command',
    'select current_database(), current_user',
  ], { env: environment })
  return roundtrip.status === 0
    && !roundtrip.error
    && String(roundtrip.stderr ?? '').trim() === ''
    && String(roundtrip.stdout ?? '').trim() === `${database}|${username}`
}

async function main() {
  assertNoAmbientContainerAuthority(process.env)
  const authority = validatePinnedDockerAuthority()
  const runId = randomUUID()
  const containerName = `academy-pending-waitlist-${process.pid}-${runId.slice(0, 8)}`
  const ownership = { key: RUN_OWNER_LABEL, value: runId }
  const database = `pending_waitlist_${randomBytes(8).toString('hex')}`
  const username = `pending_waitlist_${randomBytes(8).toString('hex')}`
  const password = randomBytes(32).toString('base64url')
  const configDirectory = createPrivateDockerConfig()
  const invoke = createDockerInvoker({
    cliPath: authority.cliPath,
    socketPath: authority.socketPath,
    configDirectory,
  })
  let cleanupRequired = false
  let cleaned = false
  let db = null

  const cleanup = () => {
    if (cleaned) return
    let cleanupError = null
    try {
      if (cleanupRequired) {
        cleanupOwnedContainer(invoke, containerName, 3, ownership)
        cleanupRequired = false
      }
    } catch (error) {
      cleanupError = error
    } finally {
      rmSync(configDirectory, { recursive: true, force: true })
      cleaned = true
    }
    if (cleanupError) throw cleanupError
  }
  installTerminationHandlers(process, cleanup, (code) => process.exit(code))

  try {
    const image = inspectPinnedPostgresImage(invoke)
    let port = null
    const databaseEnvironment = {
      POSTGRES_DB: database,
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
    }
    for (let attempt = 0; attempt < 30 && port === null; attempt += 1) {
      const candidate = randomInt(61_000, 62_000)
      cleanupRequired = true
      const launched = attemptOwnedContainerCreate(
        invoke,
        containerName,
        buildOwnedPostgresRunArguments({
          containerName,
          ownerNonce: runId,
          port: candidate,
          database,
          username,
          password,
        }),
        ownership,
        databaseEnvironment,
      )
      if (launched) port = candidate
      else cleanupRequired = false
    }
    if (port === null) throw new Error('Could not allocate an owned loopback test port')

    let ready = false
    for (let attempt = 0; attempt < 120 && !ready; attempt += 1) {
      ready = probePendingWaitlistPostgres(
        invoke,
        containerName,
        databaseEnvironment,
        database,
        username,
      )
      if (!ready) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
    if (!ready) throw new Error('Owned disposable PostgreSQL final TCP server did not become ready')

    const evidence = captureContainerEvidence(invoke, {
      containerName,
      nonce: runId,
      port,
    })
    if (evidence.imageId !== image.imageId) {
      throw new Error('Owned disposable PostgreSQL image does not match the pinned digest')
    }

    db = new Client({
      host: '127.0.0.1',
      port,
      database,
      user: username,
      password,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 20_000,
      query_timeout: 20_000,
    })
    await db.connect()
    await bootstrapFixtureRoles(db)
    await applyAllMigrations(db)
    const pendingEmail = await assertPendingIntake(db)
    await assertDefaultDenyAndNoGrantPath(db, pendingEmail)
    await assertNoReturnValueLeak(db, pendingEmail)
    await assertRetentionWrapper(db)
    await assertCombinedRetentionLimit(db)
    process.stdout.write('Pending waitlist PostgreSQL checks passed: 5\n')
  } finally {
    if (db) await db.end().catch(() => undefined)
    cleanup()
    process.stdout.write('Disposable PostgreSQL cleanup verified\n')
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Pending waitlist harness failed'}\n`)
    process.exitCode = 1
  })
}
