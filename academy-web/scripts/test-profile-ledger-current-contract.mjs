import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { main, seed, runCases } from './test-profile-ledger-native-postgres.mjs'
import { postgresProfileResultStore, exportAttemptProfileCycle } from '../ops/profile-export/export-cycle.mjs'
import { captureAttemptProfileSnapshot, projectAttemptProfileResult } from '../src/lib/profile/attempt-evidence.ts'

const user = '00000000-0000-4000-8000-000000000001'
const owner = '00000000-0000-4000-8000-000000000002'
const attempt = '00000000-0000-4000-8000-000000000003'
const claim = '00000000-0000-4000-8000-000000000004'
const commit = `select academy.commit_attempt_result('${attempt}','${user}','${claim}','course','capstone','checkpoint','{"passed":true}','completed')`
const sync = `select academy.sync_service_activation('${user}','suspended',1)`
const lock = `pg_advisory_xact_lock(hashtextextended('academy.profile-account:${user}',0))`
const fingerprints = {}

async function source(name) {
  const value = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
  fingerprints[name] = createHash('sha256').update(value).digest('hex')
  return value
}

function statement(sql, pattern) {
  const value = sql.match(pattern)?.[0]
  assert(value, 'actual migration statement must be present')
  return value
}

async function loadCurrentAuthorization(db) {
  const batch = await source('0013_integrity_batch.sql')
  const accounts = await source('0004_activation_and_entitlement.sql')
  await db.sql(`alter table academy.service_activation add column revision integer not null default 0,
    add column synced_at timestamptz not null default now();
    alter table academy.service_activation enable row level security;
    create role academy_entitlement_operator nologin;
    revoke all on academy.service_activation from service_role;
    revoke insert,update,delete on academy.service_activation from academy_runtime`)
  await db.sql(statement(accounts, /create table academy\.course_entitlement \([\s\S]*?\n\);/))
  await db.sql(statement(batch, /create table if not exists academy\.course_progress_epoch \([\s\S]*?\n\);/))
  await db.sql(statement(batch, /create or replace function academy\.progress_write_allowed\([\s\S]*?\n\$\$;/))
  await db.sql(statement(batch, /create or replace function academy\.sync_service_activation\([\s\S]*?\n\$\$;/))
  await db.sql(await source('0035_service_activation_runtime_definer.sql'))
  await db.sql(await source('0037_progress_write_guard_definer.sql'))
  assert.equal(await db.sql(`select has_table_privilege('academy_runtime','academy.service_activation','UPDATE')`), 'f')
  assert.equal(await db.sql(`select has_function_privilege('academy_runtime','academy.sync_service_activation(uuid,text,integer)','EXECUTE')`), 't')
}

async function setup(db, withResult = true) {
  await seed(db, false)
  await db.sql(`insert into academy.course_entitlement(user_id,course_slug,source) values ('${user}','course','free');
    insert into academy.course_progress_epoch(user_id,course_slug,epoch) values ('${user}','course',0)`)
  if (withResult) assert.equal(await db.sql(`set role academy_runtime; ${commit}; reset role`), 't')
}

async function waitFor(observer, waiter, holder) {
  for (let i = 0; i < 100; i++) {
    const row = JSON.parse(await observer.sql(`select json_build_object('wait',wait_event_type,
      'blockers',pg_blocking_pids(pid)) from pg_stat_activity where pid=${waiter.pid}`))
    if (row.wait === 'Lock' && row.blockers.includes(holder.pid)) return row
    await new Promise((done) => setTimeout(done, 25))
  }
  assert.fail('expected lock wait not observed')
}

async function reproduce(a,b,db) {
  await loadCurrentAuthorization(db)
  await setup(db, false)
  await db.sql(`set role academy_staff_admin;
    select academy.set_profile_source_policy('${owner}',false,true,'native-disabled-proof'); reset role`)
  for (const s of [a,b]) await s.sql("\\set VERBOSITY verbose\nset deadlock_timeout='3s'")
  await a.sql(`begin; set local role academy_runtime; select ${lock}`)
  await b.sql('begin; set local role academy_runtime')
  const syncing = b.sql(sync)
  syncing.catch(() => {})
  const syncWait = await waitFor(db,b,a)
  const grading = a.sql(commit)
  grading.catch(() => {})
  const gradeWait = await waitFor(db,a,b)
  const results = await Promise.allSettled([grading,syncing])
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message)
  assert(errors.some((message) => message.includes('40P01') && message.includes('deadlock detected')),
    'actual current guard/sync bodies must reproduce native deadlock SQLSTATE40P01')
  for (const s of [a,b]) if (s.exitCode === undefined) await s.sql('rollback')
  return [{ name: 'known-defect-reproduced-policy-disabled', sourceHashes: fingerprints,
    syncWait, gradeWait, errors, expectedBehavior: 'No deadlock; candidate violates this before remediation' }]
}

async function regression(a,b,db) {
  await loadCurrentAuthorization(db)
  const helperACL = JSON.parse(await db.sql(`select json_build_object('owner',(select r.rolname from pg_proc p
    join pg_roles r on r.oid=p.proowner where p.oid='academy.lock_profile_source_activation(uuid)'::regprocedure),
    'definer',(select prosecdef from pg_proc where oid='academy.lock_profile_source_activation(uuid)'::regprocedure),
    'runtime',has_function_privilege('academy_runtime','academy.lock_profile_source_activation(uuid)','EXECUTE'),
    'browser',has_function_privilege('authenticated','academy.lock_profile_source_activation(uuid)','EXECUTE'),
    'sharedService',has_function_privilege('service_role','academy.lock_profile_source_activation(uuid)','EXECUTE'),
    'staffAdmin',has_function_privilege('academy_staff_admin','academy.lock_profile_source_activation(uuid)','EXECUTE'))`))
  assert.deepEqual(helperACL, { owner: 'postgres', definer: true, runtime: true, browser: false, sharedService: false, staffAdmin: false })
  const results = await runCases(a,b,db,{ setup, activationMutation: sync })
  results.unshift({ name: 'current-definer-ACL-source-bodies', sourceHashes: fingerprints,
    runtimeDirectActivationUpdate: false, runtimeSyncRPC: true, activationLockHelper: helperACL })

  await setup(db, false)
  await db.sql(`set role academy_staff_admin;
    select academy.set_profile_source_policy('${owner}',false,true,'native-disabled-proof'); reset role`)
  await a.sql(`begin; set local role academy_runtime;
    select academy.sync_service_activation('${user}','active',0)`)
  await b.sql('begin; set local role academy_runtime')
  const grading = b.sql(commit); grading.catch(() => {})
  const activationWait = await waitFor(db,b,a)
  assert.equal(await a.sql(sync), 't')
  await a.sql('commit'); assert.equal(await grading, 'f'); await b.sql('commit')
  assert.equal(await db.sql('select count(*) from academy.test_progress'), '0')
  results.push({ name: 'disabled-policy-activation-first-versus-grading', activationWait,
    deadlock: false, suspendedGradingRejected: true, progress: 0 })

  await setup(db, false)
  await db.sql(`set role academy_staff_admin;
    select academy.set_profile_source_policy('${owner}',false,true,'native-disabled-proof'); reset role;
    set role academy_runtime`)
  assert.equal(await db.sql(commit), 't'); await db.sql('reset role')
  assert.equal(await db.sql(`set role academy_runtime;
    select source_key from academy.prepare_profile_result_export(array['${attempt}:0']); reset role`), '')
  results.push({ name: 'disabled-policy-valid-grading-still-commits', progress: 1, exportAdmission: false })

  await setup(db)
  await db.sql(`set role academy_runtime;
    select source_key from academy.prepare_profile_result_export(array['${attempt}:0']); reset role`)
  await a.sql(`begin; set local role academy_runtime;
    select academy.sync_service_activation('${user}','active',0)`)
  const deleting = b.sql(`begin; delete from academy.users where id='${user}'`); deleting.catch(() => {})
  const deletionWait = await waitFor(db,b,a)
  assert.equal(await a.sql(sync), 't'); await a.sql('commit')
  await deleting; await b.sql('commit')
  assert.equal(await db.sql(`select count(*) from academy.users where id='${user}'`), '0')
  assert.equal(await db.sql('select count(*) from academy.profile_result_revocation'), '1')
  results.push({ name: 'actual-sync-before-user-deletion', deletionWait, deadlock: false, withdrawalSurvived: true })

  for (const [name, role, action] of [
    ['grading', 'academy_runtime', `${commit}; select source_key from academy.prepare_profile_result_export(array['${attempt}:0'])`],
    ['classification', 'academy_staff_admin', `select academy.set_profile_activity_classification('${owner}','${user}',true,'native-classification')`],
  ]) {
    await setup(db, name !== 'grading')
    if (name === 'classification') await db.sql(`set role academy_runtime;
      select source_key from academy.prepare_profile_result_export(array['${attempt}:0']); reset role`)
    await a.sql(`begin; set local role ${role}; ${action}`)
    const pendingDelete = b.sql(`begin; delete from academy.users where id='${user}'`); pendingDelete.catch(() => {})
    const wait = await waitFor(db,b,a)
    await a.sql('commit'); await pendingDelete; await b.sql('commit')
    assert.equal(await db.sql('select count(*) from academy.attempt_profile_result'), '0')
    assert.equal(await db.sql('select count(*) from academy.profile_result_revocation'), '1')
    results.push({ name: `${name}-key-share-before-user-deletion`, wait, deadlock: false, withdrawalSurvived: true })
  }

  for (const [name, role, action, expected] of [
    ['grading','academy_runtime',commit,'f'],
    ['classification','academy_staff_admin',`do $$ begin
      perform academy.set_profile_activity_classification('${owner}','${user}',true,'native-classification');
      raise exception 'deleted-account classification unexpectedly succeeded';
      exception when foreign_key_violation then perform set_config('test.deleted_error',SQLSTATE,true); end $$;
      select current_setting('test.deleted_error')`,'23503'],
    ['activation','academy_runtime',`do $$ begin
      perform academy.sync_service_activation('${user}','suspended',1);
      raise exception 'deleted-account activation unexpectedly succeeded';
      exception when foreign_key_violation then perform set_config('test.deleted_error',SQLSTATE,true); end $$;
      select current_setting('test.deleted_error')`,'23503'],
  ]) {
    await setup(db, false)
    await a.sql(`begin; delete from academy.users where id='${user}'`)
    await b.sql(`begin; set local role ${role}`)
    const pending = b.sql(action); pending.catch(() => {})
    const wait = await waitFor(db,b,a)
    await a.sql('commit'); assert.equal(await pending, expected); await b.sql('commit')
    assert.equal(await db.sql('select count(*) from academy.attempt_profile_result'), '0')
    assert.equal(await db.sql(`select count(*) from academy.service_activation where user_id='${user}'`), '0')
    results.push({ name: `user-deletion-before-${name}`, wait, deadlock: false, rejected: expected })
  }
  return results
}

function nativeStore(session) {
  const literal = (value) => {
    if (value === null) return 'null'
    if (Number.isSafeInteger(value)) return String(value)
    if (Array.isArray(value)) return `array[${value.map(literal).join(',')}]::text[]`
    assert.equal(typeof value, 'string')
    return `'${value.replaceAll("'", "''")}'`
  }
  return postgresProfileResultStore({ async query(sql, values) {
    const bound = sql.replace(/\$(\d+)\b/g, (_, index) => literal(values[Number(index)-1]))
    if (bound.trimStart().startsWith('select')) {
      const rows = await session.sql(`select coalesce(json_agg(row_to_json(source)),'[]'::json) from (${bound}) source`)
      return { rows: JSON.parse(rows) }
    }
    await session.sql(bound)
    return { rows: [] }
  } })
}

async function exportConcurrency(a,b,db) {
  await loadCurrentAuthorization(db)
  const storeA = nativeStore(a), storeB = nativeStore(b), key = `${attempt}:0`, revoked = `${attempt}:1`
  const results = []
  await setup(db)
  await a.sql('begin; set local role academy_runtime')
  assert.deepEqual(await storeA.prepare([key]), [key])
  await b.sql('begin; set local role academy_runtime')
  const preparing = storeB.prepare([key]); preparing.catch(() => {})
  const prepareWait = await waitFor(db,b,a)
  await a.sql('commit'); assert.deepEqual(await preparing, [key]); await b.sql('commit')
  await a.sql('begin; set local role academy_runtime'); await storeA.acknowledge([key])
  const firstAck = await a.sql(`select delivered_at::text from academy.attempt_profile_result where attempt_id='${attempt}'`)
  await b.sql('begin; set local role academy_runtime')
  const acknowledging = storeB.acknowledge([key]); acknowledging.catch(() => {})
  const ackWait = await waitFor(db,b,a)
  await a.sql('commit'); await acknowledging; await b.sql('commit')
  assert.equal(await db.sql(`select delivered_at::text from academy.attempt_profile_result where attempt_id='${attempt}'`), firstAck)
  results.push({ name: 'concurrent-active-prepare-and-idempotent-ack', prepareWait, ackWait,
    duplicateAdmission: true, acknowledgementTimestampUnchanged: true, sourceHashes: fingerprints,
    scope: 'Actual Academy store SQL, native PG only; at-least-once delivery, no worker lease or remote Core operation' })

  await setup(db)
  await a.sql('set role academy_runtime'); assert.deepEqual(await storeA.prepare([key]), [key]); await a.sql('reset role')
  await db.sql(`set role academy_staff_admin;
    select academy.set_profile_activity_classification('${owner}','${user}',true,'native-classification'); reset role`)
  for (const [session,store] of [[a,storeA],[b,storeB]]) {
    await session.sql('set role academy_runtime'); assert.deepEqual(await store.prepare([revoked]), [revoked]); await session.sql('reset role')
  }
  await a.sql('begin; set local role academy_runtime'); await storeA.acknowledge([revoked])
  const firstWithdrawalAck = await a.sql(`select delivered_at::text from academy.profile_result_revocation where attempt_id='${attempt}'`)
  await b.sql('begin; set local role academy_runtime')
  const revoking = storeB.acknowledge([revoked]); revoking.catch(() => {})
  const revokeWait = await waitFor(db,b,a)
  await a.sql('commit'); await revoking; await b.sql('commit')
  assert.equal(await db.sql(`select delivered_at::text from academy.profile_result_revocation where attempt_id='${attempt}'`), firstWithdrawalAck)
  assert.equal(await db.sql(`select snapshot is null from academy.profile_result_revocation where attempt_id='${attempt}'`), 't')
  await a.sql('set role academy_runtime'); assert.deepEqual(await storeA.prepare([revoked]), []); await a.sql('reset role')
  results.push({ name: 'concurrent-tombstone-prepare-and-idempotent-ack-scrub', revokeWait,
    duplicateAdmission: true, acknowledgementTimestampUnchanged: true, snapshotScrubbed: true })
  return results
}

async function sharedRoleACL(_a,_b,db) {
  await loadCurrentAuthorization(db)
  await setup(db)
  const commands = [
    ['read policy','select * from academy.profile_source_policy'],
    ['read classification','select * from academy.profile_activity_classification'],
    ['read results','select * from academy.attempt_profile_result'],
    ['forge result',`insert into academy.attempt_profile_result(attempt_id,user_id,snapshot,passed,recorded_at)
      values ('00000000-0000-4000-8000-000000000099','${user}','{}',true,now())`],
    ['ack result','update academy.attempt_profile_result set delivered_at=now()'],
    ['read withdrawals','select * from academy.profile_result_revocation'],
    ['mutate withdrawal','update academy.profile_result_revocation set snapshot=\'{}\''],
    ['prepare export',`select * from academy.prepare_profile_result_export(array['${attempt}:0'])`],
  ]
  const results = []
  for (const [name, sql] of commands) {
    const quoted = `'${sql.replaceAll("'", "''")}'`
    const denied = await db.sql(`set role service_role; do $$ begin execute ${quoted};
      raise exception 'shared role unexpectedly permitted';
      exception when insufficient_privilege then perform set_config('test.denied',SQLSTATE,false); end $$;
      select current_setting('test.denied'); reset role`)
    assert.equal(denied, '42501')
    results.push({ name: `shared-service-role-denied-${name}`, sqlstate: denied })
  }
  const runtime = JSON.parse(await db.sql(`select json_build_object(
    'read',has_table_privilege('academy_runtime','academy.attempt_profile_result','SELECT'),
    'insert',has_table_privilege('academy_runtime','academy.attempt_profile_result','INSERT'),
    'ack',has_column_privilege('academy_runtime','academy.attempt_profile_result','delivered_at','UPDATE'),
    'rewriteResult',has_column_privilege('academy_runtime','academy.attempt_profile_result','snapshot','UPDATE'),
    'prepare',has_function_privilege('academy_runtime','academy.prepare_profile_result_export(text[])','EXECUTE'))`))
  assert.deepEqual(runtime, { read: true, insert: true, ack: true, rewriteResult: false, prepare: true })
  results.push({ name: 'dedicated-runtime-required-capabilities-retained', runtime })
  return results
}

async function activityContext(_a,_b,db) {
  await loadCurrentAuthorization(db)
  await setup(db, false)
  const id = '00000000-0000-4000-8000-000000000005'
  const token = '00000000-0000-4000-8000-000000000006'
  const issuer = 'https://accounts.example.test/'
  const captured = captureAttemptProfileSnapshot({ principal: { issuer, subject: 'learner-1' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: 'v1', assessed: true,
    integrityEnforced: true, environment: 'production' })
  const params = JSON.stringify({ profileEvidence: { ...captured, actorRole: 'learner',
    testActivity: false, policyRevision: 999 } }).replaceAll("'", "''")
  await db.sql(`set role academy_runtime;
    insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
    values ('${id}','${user}','course','capstone','checkpoint','v1','${params}','${token}',0); reset role`)
  const stored = JSON.parse(await db.sql(`select params -> 'profileEvidence' from academy.attempt where attempt_id='${id}'`))
  assert.equal(stored.actorRole, 'unknown')
  assert.equal(stored.testActivity, null)
  assert.equal(stored.classificationRevision, null)
  assert.equal(stored.policyRevision, 1)
  assert.equal(await db.sql(`set role academy_runtime;
    select academy.commit_attempt_result('${id}','${user}','${token}','course','capstone','checkpoint','{"passed":true}','completed'); reset role`), 't')
  const result = JSON.parse(await db.sql(`select row_to_json(source) from (
    select attempt_id::text,passed,snapshot,recorded_at::text from academy.attempt_profile_result where attempt_id='${id}') source`))
  assert.deepEqual(projectAttemptProfileResult(result, issuer), { ok: false, reason: 'context_unproven' })
  const store = nativeStore(db)
  const fail = () => assert.fail('unknown activity must not prepare, send or acknowledge')
  const cycle = await exportAttemptProfileCycle({ store: { ...store, prepare: fail, acknowledge: fail },
    transport: { enabled: true, ingest: fail }, trustedIssuer: issuer })
  assert.equal(cycle.delivered, 0)
  assert.equal(cycle.blocked.context_unproven, 1)
  assert.equal(await db.sql(`select export_started_at is null from academy.attempt_profile_result where attempt_id='${id}'`), 't')
  assert.equal(await db.sql('select count(*) from academy.test_progress'), '1')
  return [{ name: 'sql-stamps-unknown-despite-runtime-learner-payload-and-account-policy-approval',
    actorRole: stored.actorRole, testActivity: stored.testActivity, policyRevision: stored.policyRevision,
    sourceHashes: fingerprints },
  { name: 'unknown-activity-grades-but-cannot-reach-export-prepare-or-transport',
    gradingCommitted: true, progress: 1, delivered: cycle.delivered, blocked: cycle.blocked, exportMark: false }]
}

const mode = process.argv[2]
const suites = { reproduce, regression, 'export-concurrency': exportConcurrency, 'shared-role-acl': sharedRoleACL,
  'activity-context': activityContext }
assert(Object.hasOwn(suites, mode), 'choose reproduce, regression, export-concurrency, shared-role-acl or activity-context')
await main(process.argv.slice(3), suites[mode])
  .catch((error) => { process.stderr.write(error.message+'\n'); process.exitCode = 1 })
