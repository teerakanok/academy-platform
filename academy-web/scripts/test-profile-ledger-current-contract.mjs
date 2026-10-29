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
  const staff = await source('0018_staff_authorization.sql')
  const attempts = await source('0033_assessment_attempt_integrity.sql')
  await db.sql(`alter table academy.service_activation add column revision integer not null default 0,
    add column synced_at timestamptz not null default now();
    alter table academy.service_activation enable row level security;
    create role academy_entitlement_operator nologin;
    revoke all on academy.service_activation from service_role;
    revoke insert,update,delete on academy.service_activation from academy_runtime`)
  await db.sql(statement(accounts, /create table academy\.course_entitlement \([\s\S]*?\n\);/))
  await db.sql(statement(accounts, /create or replace function academy\.has_course_entitlement\([\s\S]*?\n\$\$;/))
  await db.sql(statement(staff, /create table academy\.staff_role_assignment \([\s\S]*?\n\);/))
  await db.sql(statement(staff, /create or replace function academy\.has_staff_role\([\s\S]*?\n\$\$;/))
  await db.sql(`grant select on academy.course_entitlement to academy_runtime;
    revoke all on function academy.has_staff_role(uuid,text) from public,anon,authenticated,service_role;
    grant execute on function academy.has_staff_role(uuid,text) to academy_runtime`)
  await db.sql(statement(batch, /create table if not exists academy\.course_progress_epoch \([\s\S]*?\n\);/))
  await db.sql(`alter table academy.attempt alter column attempt_id set default gen_random_uuid(),
    add column created_at timestamptz not null default now(), add column expires_at timestamptz,
    add column consumed_at timestamptz; grant select,insert,update on academy.course_progress_epoch to academy_runtime`)
  await db.sql(statement(attempts, /create or replace function academy\.attempt_integrity_enforced\([\s\S]*?\n\$\$;/))
  await db.sql(statement(attempts, /create or replace function academy\.issue_attempt\([\s\S]*?\n\$\$;/))
  await db.sql('grant execute on function academy.issue_attempt(uuid,text,text,text,jsonb,text,integer,integer,integer) to academy_runtime')
  await db.sql(statement(batch, /create or replace function academy\.progress_write_allowed\([\s\S]*?\n\$\$;/))
  await db.sql(statement(batch, /create or replace function academy\.sync_service_activation\([\s\S]*?\n\$\$;/))
  await db.sql(await source('0035_service_activation_runtime_definer.sql'))
  await db.sql(await source('0037_progress_write_guard_definer.sql'))
  assert.equal(await db.sql(`select has_table_privilege('academy_runtime','academy.service_activation','UPDATE')`), 'f')
  assert.equal(await db.sql(`select has_function_privilege('academy_runtime','academy.sync_service_activation(uuid,text,integer)','EXECUTE')`), 't')
}

async function setup(db, withResult = true) {
  await seed(db, false)
  await db.sql(`insert into academy.course_entitlement(user_id,course_slug,source) values ('${user}','course','free') on conflict do nothing;
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
    ['profile activation lookup',`select academy.try_active_profile_source('${user}')`],
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
  const helper = JSON.parse(await db.sql(`select json_build_object(
    'owner',(select rolname from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='academy.try_active_profile_source(uuid)'::regprocedure),
    'definer',(select prosecdef from pg_proc where oid='academy.try_active_profile_source(uuid)'::regprocedure),
    'runtime',has_function_privilege('academy_runtime','academy.try_active_profile_source(uuid)','EXECUTE'),
    'browser',has_function_privilege('authenticated','academy.try_active_profile_source(uuid)','EXECUTE'),
    'service',has_function_privilege('service_role','academy.try_active_profile_source(uuid)','EXECUTE'),
    'staff',has_function_privilege('academy_staff_admin','academy.try_active_profile_source(uuid)','EXECUTE'))`))
  assert.deepEqual(helper, { owner: 'postgres', definer: true, runtime: true, browser: false, service: false, staff: false })
  results.push({ name: 'nonblocking-activation-helper-acl', helper })
  return results
}

async function activityContext(_a,_b,db) {
  const [a, b] = [_a, _b]
  await loadCurrentAuthorization(db)
  await setup(db, false)
  // The owner's census policy treats an unlisted non-staff account as a learner.
  await db.sql(`delete from academy.profile_activity_classification where user_id='${user}';
    delete from academy.profile_activity_classification_audit where user_id='${user}'`)
  const issuer = 'https://accounts.example.test/'
  const captured = captureAttemptProfileSnapshot({ principal: { issuer, subject: 'learner-1' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: 'v1', assessed: true,
    integrityEnforced: true, environment: 'production' })
  const params = JSON.stringify({ assessment: { assessed: true }, profileEvidence: { ...captured, principal: { issuer, subject: 'forged' },
    actorRole: 'learner', testActivity: false, policyRevision: 999 } }).replaceAll("'", "''")
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const issue = (id, token = uuid(90), body = params) => `insert into academy.attempt
    (attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
    values ('${id}','${user}','course','capstone','checkpoint','v1','${body}','${token}',0)`
  const snapshot = async id => JSON.parse(await db.sql(`select params -> 'profileEvidence' from academy.attempt where attempt_id='${id}'`))
  const asRuntime = sql => db.sql(`set role academy_runtime; ${sql}; reset role`)
  const finish = (id, token = uuid(90)) => `select academy.commit_attempt_result('${id}','${user}','${token}','course','capstone','checkpoint','{"passed":true}','completed')`
  const prepare = id => `select source_key from academy.prepare_profile_result_export(array['${id}:0'])`
  const roleChange = (test) => `set role academy_staff_admin; select academy.set_profile_activity_classification('${owner}','${user}',${test},'native-classification'); reset role`
  const first = uuid(5), pending = uuid(6)
  await asRuntime(issue(first))
  const stored = await snapshot(first)
  assert.equal(stored.actorRole, 'learner'); assert.equal(stored.testActivity, false)
  assert.equal(stored.classificationRevision, 0); assert.equal(stored.policyRevision, 1)
  assert.equal(stored.assistance, 'unknown'); assert.equal(stored.integrityEnforced, true)
  assert.equal(stored.principal.subject, 'learner-1')
  assert.equal(await asRuntime(finish(first)), 't')
  const result = JSON.parse(await db.sql(`select row_to_json(source) from (
    select attempt_id::text,passed,snapshot,recorded_at::text from academy.attempt_profile_result where attempt_id='${first}') source`))
  const projected = projectAttemptProfileResult(result, issuer)
  assert.equal(projected.ok, true); assert.equal(projected.event.context.assistance, 'unknown')
  assert.equal(projected.event.outcome.score, 1)
  // A profile payload cannot turn a disabled grading guard into verified evidence.
  const guardDisabled = uuid(41)
  const disabledParams = JSON.stringify({ assessment: { assessed: true, integrityEnforced: false },
    profileEvidence: { ...captured, integrityEnforced: true } }).replaceAll("'", "''")
  await asRuntime(issue(guardDisabled, uuid(90), disabledParams))
  assert.equal((await snapshot(guardDisabled)).integrityEnforced, false)
  assert.equal(await asRuntime(finish(guardDisabled)), 't')
  assert.equal(await asRuntime(prepare(guardDisabled)), '')
  await asRuntime(issue(pending)); assert.equal(await asRuntime(finish(pending)), 't')
  assert.equal(await asRuntime(prepare(first)), `${first}:0`)

  const staffRoles = ['owner', 'learner-support', 'privacy-officer', 'content-ops']
  for (const [i, role] of staffRoles.entries()) {
    await db.sql(`insert into academy.staff_role_assignment(account_id,role,granted_by) values ('${user}','${role}','${owner}')`)
    const id = uuid(20 + i); await asRuntime(issue(id))
    assert.equal((await snapshot(id)).actorRole, 'staff', role)
    await db.sql(`delete from academy.staff_role_assignment where account_id='${user}' and role='${role}'`)
  }
  await db.sql(roleChange(true))
  assert.equal(await db.sql(`select count(*) from academy.profile_result_revocation where attempt_id='${first}'`), '1')
  const testId = uuid(30); await asRuntime(issue(testId))
  assert.equal((await snapshot(testId)).actorRole, 'test')
  assert.equal((await snapshot(testId)).testActivity, true)
  await db.sql(roleChange(false))
  assert.equal(await asRuntime(prepare(pending)), '', 'clearing QA classification cannot promote an older attempt')

  const oldPolicy = uuid(40); await asRuntime(issue(oldPolicy)); assert.equal(await asRuntime(finish(oldPolicy)), 't')
  await db.sql(`set role academy_staff_admin; select academy.set_profile_source_policy('${owner}',false,false,'native-disabled-proof'); reset role`)
  const disabled = uuid(31); await asRuntime(issue(disabled)); assert.equal((await snapshot(disabled)).actorRole, 'unknown')
  await db.sql(`set role academy_staff_admin; select academy.set_profile_source_policy('${owner}',true,true,'native-enabled-proof'); reset role`)
  assert.equal((await snapshot(disabled)).actorRole, 'unknown', 'enabling policy cannot promote an existing attempt')
  assert.equal(await asRuntime(prepare(oldPolicy)), '', 'a changed policy cannot admit an earlier pending attempt')
  await db.sql(`update academy.course_entitlement set revoked_at=now() where user_id='${user}' and course_slug='course'`)
  const unentitled = uuid(32); await asRuntime(issue(unentitled)); assert.equal((await snapshot(unentitled)).actorRole, 'unknown')
  await db.sql(`update academy.course_entitlement set revoked_at=null where user_id='${user}' and course_slug='course'`)
  await db.sql('revoke execute on function academy.has_staff_role(uuid,text) from academy_runtime')
  const unavailable = uuid(36); await asRuntime(issue(unavailable)); assert.equal((await snapshot(unavailable)).actorRole, 'unknown')
  await db.sql('grant execute on function academy.has_staff_role(uuid,text) to academy_runtime')

  // Competing role/activation changes must not make issuance wait across grading locks.
  await a.sql(`begin; select pg_advisory_xact_lock(hashtextextended('academy.staff_role_assignment',0))`)
  await b.sql(`begin; set local role academy_runtime; ${issue(uuid(33))}; commit`)
  assert.equal((await snapshot(uuid(33))).actorRole, 'unknown'); await a.sql('rollback')
  await a.sql(`begin; select status from academy.service_activation where user_id='${user}' for update`)
  await b.sql(`begin; set local role academy_runtime; ${issue(uuid(34))}; commit`)
  assert.equal((await snapshot(uuid(34))).actorRole, 'unknown'); await a.sql('rollback')
  for (const [id, lockName] of [[37, 'academy.profile-source-policy'],
    [38, `academy.profile-account:${user}`], [39, `academy.course_entitlement:${user}:course`]]) {
    await a.sql(`begin; select pg_advisory_xact_lock(hashtextextended('${lockName}',0))`)
    await b.sql(`begin; set local role academy_runtime; ${issue(uuid(id))}; commit`)
    assert.equal((await snapshot(uuid(id))).actorRole, 'unknown', lockName)
    await a.sql('rollback')
  }

  // Actual issue_attempt returns the original immutable attempt on reuse.
  const reuseParams = JSON.stringify({ assessment: { assessed: false }, profileEvidence: captured }).replaceAll("'", "''")
  const reuse = `select row_to_json(r) from academy.issue_attempt('${user}','course','reuse-node','checkpoint','${reuseParams}','v1') r`
  const issued = JSON.parse(await asRuntime(reuse)); assert.equal(issued.params.profileEvidence.actorRole, 'learner')
  await db.sql(roleChange(true))
  const reused = JSON.parse(await asRuntime(reuse))
  assert.equal(reused.attempt_id, issued.attempt_id)
  assert.deepEqual(reused.params.profileEvidence, issued.params.profileEvidence)

  // Simulate a pre-migration row: even a stored forged learner claim is unknown.
  const legacy = uuid(35)
  await db.sql(`alter table academy.attempt disable trigger capture_attempt_profile_source;
    ${issue(legacy)}; alter table academy.attempt enable trigger capture_attempt_profile_source`)
  await db.sql(`do $$ begin update academy.attempt set profile_source_capture=1 where attempt_id='${legacy}';
    raise exception 'marker unexpectedly mutable'; exception when sqlstate '22023' then null; end $$`)
  assert.equal(await asRuntime(finish(legacy)), 't')
  const legacySnapshot = JSON.parse(await db.sql(`select snapshot from academy.attempt_profile_result where attempt_id='${legacy}'`))
  assert.equal(legacySnapshot.actorRole, 'unknown'); assert.equal(legacySnapshot.testActivity, null)
  assert.equal(await asRuntime(prepare(legacy)), '')
  return [{ name: 'policy-default-learner-and-server-owned-principal', actorRole: stored.actorRole,
    assistance: projected.event.context.assistance, classificationRevision: stored.classificationRevision, sourceHashes: fingerprints },
  { name: 'staff-test-disabled-unentitled-and-contended-context-fail-closed', roles: staffRoles.length },
  { name: 'classification-change-withdraws-marked-and-does-not-promote-pending', withdrawal: true, pendingPromoted: false },
  { name: 'actual-attempt-reuse-and-legacy-remain-immutable', reusedSameAttempt: true, legacy: legacySnapshot.actorRole }]
}

async function provenanceLocks(a,b,db) {
  await loadCurrentAuthorization(db)
  const insert = `insert into academy.attempt_profile_result(attempt_id,user_id,snapshot,passed,recorded_at)
    select a.attempt_id,a.user_id,a.params -> 'profileEvidence',(a.outcome ->> 'passed')::boolean,a.result_recorded_at
    from academy.attempt a where a.attempt_id='${attempt}'`
  const checkedInsert = `do $$ begin ${insert}; perform set_config('test.insert_result','inserted',false);
    exception when sqlstate '22023' then perform set_config('test.insert_result',SQLSTATE,false); end $$;
    select current_setting('test.insert_result')`
  const finalize = `set role academy_runtime;
    update academy.attempt set outcome='{"passed":true}',claim_token=null where attempt_id='${attempt}'; reset role`
  const results = []

  await setup(db, false)
  await db.sql(finalize)
  await a.sql(`begin; set local role academy_runtime; ${sync}`)
  await b.sql('begin; set local role academy_runtime')
  const activationInsert = b.sql(checkedInsert)
  const activationWait = await waitFor(db,b,a)
  await a.sql('commit')
  assert.equal(await activationInsert, '22023')
  await b.sql('commit')
  assert.equal(await db.sql('select count(*) from academy.attempt_profile_result'), '0')
  results.push({ name: 'source-insert-waits-for-activation-and-rejects-suspended-account',
    observedWait: activationWait, sourceRows: 0, sourceHashes: fingerprints })

  await setup(db, false)
  await db.sql(finalize)
  await a.sql(`begin; delete from academy.users where id='${user}'`)
  await b.sql('begin; set local role academy_runtime')
  const erasureInsert = b.sql(checkedInsert)
  const erasureWait = await waitFor(db,b,a)
  await a.sql('commit')
  assert.equal(await erasureInsert, '22023')
  await b.sql('commit')
  assert.equal(await db.sql('select count(*) from academy.attempt_profile_result'), '0')
  results.push({ name: 'source-insert-waits-for-user-erasure-and-rejects-deleted-account',
    observedWait: erasureWait, sourceRows: 0, sourceHashes: fingerprints })
  return results
}

async function ownerAuthorizationRaces(a,b,db) {
  await loadCurrentAuthorization(db)
  const staff = await source('0018_staff_authorization.sql')
  await db.sql(statement(staff, /create table academy\.staff_role_audit \([\s\S]*?\n\);/))
  await db.sql(statement(staff, /create or replace function academy\.set_staff_role\([\s\S]*?\n\$\$;/))
  await db.sql(`revoke all on function academy.set_staff_role(uuid,uuid,text,boolean,text) from public,anon,authenticated,service_role;
    grant execute on function academy.set_staff_role(uuid,uuid,text,boolean,text) to academy_staff_admin`)
  const revoker = '00000000-0000-4000-8000-000000000082'
  const issue = `insert into academy.attempt(user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
    values ('${user}','course','race-node','checkpoint','v1',
      '{"assessment":{"assessed":true},"profileEvidence":{"environment":"production"}}',gen_random_uuid(),0)
    returning params #>> '{profileEvidence,actorRole}'`
  const revoke = `select academy.set_staff_role('${revoker}','${owner}','owner',false,'native-owner-revoke')`
  const setters = {
    policy: {
      initial: `select academy.set_profile_source_policy('${owner}',false,true,'native-policy-initial')`,
      call: `academy.set_profile_source_policy('${owner}',true,true,'native-policy-change')`,
      state: `select enabled::text from academy.profile_source_policy where id`, before: 'false', after: 'true',
    },
    classification: {
      initial: `select academy.set_profile_activity_classification('${owner}','${user}',true,'native-test-initial')`,
      call: `academy.set_profile_activity_classification('${owner}','${user}',false,'native-test-change')`,
      state: `select is_test::text from academy.profile_activity_classification where user_id='${user}'`, before: 'true', after: 'false',
    },
  }
  const checked = (call, error = '42501') => `do $$ begin
    perform ${call}; perform set_config('test.owner_result','accepted',true);
    exception when sqlstate '${error}' then perform set_config('test.owner_result',SQLSTATE,true); end $$;
    select current_setting('test.owner_result')`
  async function reset(setter) {
    await setup(db, false)
    await db.sql(`insert into academy.users(id,issuer,subject) values
      ('${revoker}','https://accounts.example.test/','revoker');
      insert into academy.staff_role_assignment(account_id,role,granted_by) values ('${revoker}','owner','${owner}');
      set role academy_staff_admin; ${setter.initial}; reset role`)
    assert.equal(await db.sql(setter.state), setter.before)
  }
  const results = []
  for (const [name, setter] of Object.entries(setters)) {
    await reset(setter)
    await a.sql(`begin; set local role academy_staff_admin; ${revoke}`)
    await b.sql('begin; set local role academy_staff_admin')
    const stale = b.sql(checked(setter.call)); stale.catch(() => {})
    const revokeWait = await waitFor(db,b,a)
    await a.sql('commit'); assert.equal(await stale, '42501'); await b.sql('commit')
    assert.equal(await db.sql(setter.state), setter.before)
    results.push({ name: `${name}-revoke-first-denies-stale-owner`, observedWait: revokeWait, rejected: '42501' })

    await reset(setter)
    await a.sql(`begin; set local role academy_staff_admin; select ${setter.call}`)
    // Capture must not wait for staff, policy, or account locks held by a setter.
    assert.equal(await b.sql(`begin; set local role academy_runtime; set local statement_timeout='2s'; ${issue}`), 'unknown')
    await b.sql('commit')
    await b.sql('begin; set local role academy_staff_admin')
    const pendingRevoke = b.sql(revoke); pendingRevoke.catch(() => {})
    const setterWait = await waitFor(db,b,a)
    await a.sql('commit'); assert.equal(await pendingRevoke, 't'); await b.sql('commit')
    assert.equal(await db.sql(setter.state), setter.after)
    assert.equal(await db.sql(`select academy.has_staff_role('${owner}','owner')`), 'f')
    results.push({ name: `${name}-setter-first-then-revoke-and-nonblocking-capture`, observedWait: setterWait, captured: 'unknown' })

    await reset(setter)
    await a.sql(`begin; delete from academy.users where id='${owner}'`)
    await b.sql('begin; set local role academy_staff_admin')
    const erased = b.sql(checked(setter.call)); erased.catch(() => {})
    const erasureWait = await waitFor(db,b,a)
    await a.sql('commit'); assert.equal(await erased, '42501'); await b.sql('commit')
    assert.equal(await db.sql(setter.state), setter.before)
    results.push({ name: `${name}-actor-erasure-first-denies-owner`, observedWait: erasureWait, rejected: '42501' })

    await reset(setter)
    await a.sql(`begin; set local role academy_staff_admin; select ${setter.call}`)
    const deleting = b.sql(`begin; delete from academy.users where id='${owner}'`); deleting.catch(() => {})
    const ownerWait = await waitFor(db,b,a)
    await a.sql('commit'); await deleting; await b.sql('commit')
    assert.equal(await db.sql(setter.state), setter.after)
    assert.equal(await db.sql(`select count(*) from academy.users where id='${owner}'`), '0')
    results.push({ name: `${name}-setter-first-then-actor-erasure`, observedWait: ownerWait, actorErased: true })

    await reset(setter)
    await b.sql('begin isolation level repeatable read; set local role academy_staff_admin')
    assert.equal(await b.sql(checked(setter.call, '25000')), '25000')
    await b.sql('commit')
    assert.equal(await db.sql(setter.state), setter.before)
    results.push({ name: `${name}-rejects-stale-transaction-snapshot`, rejected: '25000' })
  }

  // Account -> try staff during capture versus staff -> account during an
  // administrator classification must not become a blocking cycle.
  await reset(setters.classification)
  await a.sql(`begin; set local role academy_runtime; select ${lock}`)
  await b.sql('begin; set local role academy_staff_admin')
  const pendingClassification = b.sql(`select ${setters.classification.call}`); pendingClassification.catch(() => {})
  const accountWait = await waitFor(db,b,a)
  assert.equal(await a.sql(`set local statement_timeout='2s'; ${issue}`), 'unknown')
  await a.sql('commit'); await pendingClassification; await b.sql('commit')
  assert.equal(await db.sql(setters.classification.state), setters.classification.after)
  results.push({ name: 'account-then-capture-versus-staff-then-account-no-deadlock', observedWait: accountWait, captured: 'unknown' })
  return results
}

const mode = process.argv[2]
const suites = { reproduce, regression, 'export-concurrency': exportConcurrency, 'shared-role-acl': sharedRoleACL,
  'activity-context': activityContext, 'provenance-locks': provenanceLocks, 'owner-authorization-races': ownerAuthorizationRaces }
assert(Object.hasOwn(suites, mode), 'choose reproduce, regression, export-concurrency, shared-role-acl, activity-context, provenance-locks or owner-authorization-races')
await main(process.argv.slice(3), suites[mode])
  .catch((error) => { process.stderr.write(error.message+'\n'); process.exitCode = 1 })
