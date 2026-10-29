import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { captureAttemptProfileSnapshot, projectAttemptProfileResult } from '../src/lib/profile/attempt-evidence.ts'

// PGlite runs an isolated synthetic schema without a database URL or network.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ?? '@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec(await readFile(new URL('./fixtures/profile-ledger.sql', import.meta.url), 'utf8'))
  const retention = await readFile(new URL('../supabase/migrations/0017_privacy_retention_and_appeals.sql', import.meta.url), 'utf8')
  const statement = (pattern) => {
    const match = retention.match(pattern)?.[0]
    assert(match, 'the current attempt timestamp contract must be present')
    return match
  }
  await db.exec('drop trigger stamp_result on academy.attempt')
  await db.exec(statement(/alter table academy\.attempt\s+add constraint attempt_result_timestamp_consistent[\s\S]*?;/))
  await db.exec(statement(/create or replace function academy\.stamp_attempt_result\(\)[\s\S]*?\n\$\$;/))
  await db.exec(statement(/create trigger attempt_result_timestamp[\s\S]*?execute function academy\.stamp_attempt_result\(\);/))
  const user = randomUUID(), other = randomUUID()
  const issuer = 'https://accounts.example.test/'
  await db.query('insert into academy.users values ($1,$2,$3),($4,$2,$5)', [user, issuer, 'synthetic-learner', other, 'synthetic-other'])
  await db.query("insert into academy.service_activation values ($1,'active'),($2,'active')", [user, other])
  const snapshot = captureAttemptProfileSnapshot({ principal: { issuer, subject: 'synthetic-learner' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: 'v1', assessed: true,
    integrityEnforced: true, environment: 'production' })
  const legacyAttempt = randomUUID(), legacyClaim = randomUUID()
  const legacyFinalized = randomUUID(), legacyFinalizedClaim = randomUUID()
  const legacyContext = { ...snapshot, actorRole: 'learner', testActivity: false, policyRevision: 1 }
  await db.query(`insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
    values ($1,$2,'course','capstone','checkpoint','v1',$3,$4,0),
      ($5,$2,'course','capstone','checkpoint','v1',$3,$6,0)`,
  [legacyAttempt, user, { profileEvidence: legacyContext }, legacyClaim, legacyFinalized, legacyFinalizedClaim])
  await db.query("update academy.attempt set outcome='{\"passed\":true}',claim_token=null where attempt_id=$1", [legacyFinalized])
  await db.exec(await readFile(new URL('../supabase/migrations/0041_attempt_profile_result.sql', import.meta.url), 'utf8'))
  const issue = async () => {
    const attempt = randomUUID(), claim = randomUUID()
    await db.query(`insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
      values ($1,$2,'course','capstone','checkpoint','v1',$3,$4,0)`, [attempt, user, { profileEvidence: snapshot }, claim])
    return { attempt, claim }
  }
  const rawInsert = (sql, values) => db.query(`insert into academy.attempt_profile_result
    (attempt_id,user_id,snapshot,passed,recorded_at,export_started_at,delivered_at) ${sql}`, values)
  await db.exec('set role academy_runtime')
  const legacyCommit = await db.query(`select academy.commit_attempt_result($1,$2,$3,'course','capstone','checkpoint',$4,$5) as committed`,
    [legacyAttempt, user, legacyClaim, { passed: true }, 'completed'])
  assert.equal(legacyCommit.rows[0].committed, true)
  const legacy = (await db.query('select snapshot,passed,recorded_at from academy.attempt_profile_result where attempt_id=$1', [legacyAttempt])).rows[0]
  assert.equal(legacy.snapshot.actorRole, 'unknown')
  assert.equal(legacy.snapshot.testActivity, null)
  assert.deepEqual(projectAttemptProfileResult({ attempt_id: legacyAttempt, passed: legacy.passed,
    recorded_at: legacy.recorded_at.toISOString(), snapshot: legacy.snapshot }, issuer), { ok: false, reason: 'context_unproven' })
  await assert.rejects(rawInsert(`select a.attempt_id,a.user_id,a.params -> 'profileEvidence',true,a.result_recorded_at,null,null
    from academy.attempt a where a.attempt_id=$1`, [legacyFinalized]), /profile result source/)
  await rawInsert(`select a.attempt_id,a.user_id,academy.unverified_profile_result_snapshot(a.params),true,a.result_recorded_at,null,null
    from academy.attempt a where a.attempt_id=$1`, [legacyFinalized])
  const historical = (await db.query('select snapshot,passed,recorded_at from academy.attempt_profile_result where attempt_id=$1', [legacyFinalized])).rows[0]
  assert.equal(historical.snapshot.actorRole, 'unknown')
  assert.deepEqual(projectAttemptProfileResult({ attempt_id: legacyFinalized, passed: historical.passed,
    recorded_at: historical.recorded_at.toISOString(), snapshot: historical.snapshot }, issuer), { ok: false, reason: 'context_unproven' })
  const forged = { ...snapshot, actorRole: 'learner', testActivity: false, policyRevision: 1 }
  await assert.rejects(rawInsert('values ($1,$2,$3,true,now(),null,null)', [randomUUID(), user, forged]), /profile result source/)

  const pending = await issue()
  await assert.rejects(rawInsert('values ($1,$2,$3,true,now(),null,null)', [pending.attempt, user, forged]), /profile result source/)
  const finalized = await issue()
  await db.query("update academy.attempt set outcome='{\"passed\":true}',claim_token=null where attempt_id=$1", [finalized.attempt])
  const fromAttempt = `select a.attempt_id,a.user_id,a.params -> 'profileEvidence',
    (a.outcome ->> 'passed')::boolean,a.result_recorded_at,null,null from academy.attempt a where a.attempt_id=$1`
  await assert.rejects(rawInsert(fromAttempt.replace('a.user_id', '$2::uuid'), [finalized.attempt, other]), /profile result source/)
  await assert.rejects(rawInsert(fromAttempt.replace("a.params -> 'profileEvidence'", '$2::jsonb'), [finalized.attempt, forged]), /profile result source/)
  await assert.rejects(rawInsert(fromAttempt.replace("(a.outcome ->> 'passed')::boolean", 'false'), [finalized.attempt]), /profile result source/)
  await assert.rejects(rawInsert(fromAttempt.replace('a.result_recorded_at', "a.result_recorded_at + interval '1 day'"), [finalized.attempt]), /profile result source/)
  await assert.rejects(rawInsert(fromAttempt.replace('null,null from', 'now(),null from'), [finalized.attempt]), /profile result source/)
  await assert.rejects(rawInsert(fromAttempt.replace('null,null from', 'null,now() from'), [finalized.attempt]), /profile result source/)
  await db.exec('reset role')
  await db.query("update academy.service_activation set status='suspended' where user_id=$1", [user])
  await db.exec('set role academy_runtime')
  await assert.rejects(rawInsert(fromAttempt, [finalized.attempt]), /profile result source/)
  await db.exec('reset role')
  await db.query("update academy.service_activation set status='active' where user_id=$1", [user])
  await db.exec('set role academy_runtime')

  const graded = await issue()
  const result = await db.query(`select academy.commit_attempt_result($1,$2,$3,'course','capstone','checkpoint',$4,$5) as committed`,
    [graded.attempt, user, graded.claim, { passed: true }, 'completed'])
  assert.equal(result.rows[0].committed, true)
  const rows = await db.query(`select r.snapshot,r.passed,r.recorded_at=a.result_recorded_at as time_matches
    from academy.attempt_profile_result r join academy.attempt a using(attempt_id) where r.attempt_id=$1`, [graded.attempt])
  assert.equal(rows.rows.length, 1)
  assert.equal(rows.rows[0].passed, true)
  assert.equal(rows.rows[0].time_matches, true)
  assert.equal(rows.rows[0].snapshot.actorRole, 'unknown')
  assert.equal(rows.rows[0].snapshot.testActivity, null)
  assert.deepEqual(projectAttemptProfileResult({ attempt_id: graded.attempt, passed: true,
    recorded_at: new Date().toISOString(), snapshot: rows.rows[0].snapshot }, issuer), { ok: false, reason: 'context_unproven' })
  process.stdout.write('PASS isolated synthetic ledger: source mismatch rejected; actual commit stays atomic and unknown context remains unexportable\n')
} finally {
  await db.close()
}
