import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { captureAttemptProfileSnapshot } from '../src/lib/profile/attempt-evidence.ts'
import { postgresProfileResultStore } from '../ops/profile-export/export-cycle.mjs'

// Disposable PostgreSQL engine only; never reads a DSN or connects to a database host.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ?? '@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec(`
    create schema academy;
    create role anon; create role authenticated;
    create role service_role bypassrls; create role academy_runtime bypassrls; create role academy_staff_admin;
    create table academy.users(id uuid primary key, issuer text not null, subject text not null);
    create table academy.service_activation(user_id uuid primary key references academy.users(id) on delete cascade,status text not null);
    create function academy.has_staff_role(uuid,text) returns boolean language sql as
      'select exists(select 1 from academy.users where id=$1 and subject=''owner'' and $2=''owner'')';
    create table academy.attempt(
      attempt_id uuid primary key, user_id uuid references academy.users(id),
      course_slug text, node_id text, challenge_id text, challenge_version text,
      params jsonb not null, outcome jsonb, claim_token uuid, progress_epoch bigint,
      result_recorded_at timestamptz);
    create table academy.test_progress(user_id uuid, node_id text, status text);
    create function academy.progress_write_allowed(uuid,text,bigint) returns boolean
      language sql as 'select true';
    create function academy.record_node_progress(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,text)
      returns void language plpgsql as $$begin
      if current_setting('test.reject_progress',true) = '1' then raise exception 'injected progress failure'; end if;
      insert into academy.test_progress values ($1,$3,$4); end;$$;
    create function academy.stamp_result() returns trigger language plpgsql as $$begin
      if new.outcome is not null and old.outcome is null then new.result_recorded_at:=now(); end if;
      return new; end;$$;
    create trigger stamp_result before update on academy.attempt for each row execute function academy.stamp_result();
    grant usage on schema academy to academy_runtime,service_role,anon,authenticated;
    grant usage on schema academy to academy_staff_admin;
    grant select on academy.users to academy_runtime,service_role;
    grant select on academy.service_activation to academy_runtime,service_role;
    grant select,insert,update on academy.attempt to academy_runtime,service_role;
    grant insert,select on academy.test_progress to academy_runtime,service_role;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/0041_attempt_profile_result.sql', import.meta.url), 'utf8'))
  const user = randomUUID()
  const owner = randomUUID()
  await db.query('insert into academy.users values ($1,$2,$3)', [user,'https://accounts.example.test/','learner-1'])
  await db.query('insert into academy.users values ($1,$2,$3)', [owner,'https://accounts.example.test/','owner'])
  await db.query("insert into academy.service_activation values ($1,'active')",[user])
  const snapshot = captureAttemptProfileSnapshot({ principal: { issuer: 'https://accounts.example.test/', subject: 'learner-1' },
    courseSlug: 'course', nodeId: 'capstone', courseVersion: 'v1', assessed: true, integrityEnforced: true, environment: 'production' })
  async function issue() {
    const attempt = randomUUID(), claim = randomUUID()
    await db.query(`insert into academy.attempt(attempt_id,user_id,course_slug,node_id,challenge_id,challenge_version,params,claim_token,progress_epoch)
      values ($1,$2,'course','capstone','checkpoint','v1',$3,$4,0)`, [attempt,user,{ profileEvidence: snapshot },claim])
    return { attempt, claim }
  }
  const commit = (a, claim=a.claim, passed=true) => db.query(`select academy.commit_attempt_result($1,$2,$3,'course','capstone','checkpoint',$4,$5) as committed`,
    [a.attempt,user,claim,{passed},passed ? 'completed' : 'in-progress'])
  const a = await issue()
  await db.exec('set role academy_runtime')
  assert.equal((await commit(a, randomUUID())).rows[0].committed, false)
  assert.equal((await db.query('select count(*)::int as n from academy.attempt_profile_result')).rows[0].n,0)
  assert.equal((await commit(a)).rows[0].committed,true)
  assert.equal((await commit(a)).rows[0].committed,false)
  let rows=(await db.query('select snapshot,passed,recorded_at from academy.attempt_profile_result')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].passed,true)
  assert.deepEqual(rows[0].snapshot,{ ...snapshot, classificationRevision: null })
  await assert.rejects(db.query(`update academy.attempt set params='{}' where attempt_id=$1`,[a.attempt]), /immutable/)
  await assert.rejects(db.query('update academy.attempt_profile_result set passed=false'), /permission denied/)
  await db.exec('reset role')
  await db.exec('set role academy_staff_admin')
  await assert.rejects(db.query('select academy.set_profile_activity_classification($1,$1,false,$2)',[user,'approval-test-1']), /owner role required/)
  await db.query('select academy.set_profile_source_policy($1,true,true,$2)',[owner,'approval-policy-1'])
  await db.query('select academy.set_profile_activity_classification($1,$2,false,$3)',[owner,user,'approval-test-1'])
  await db.exec('reset role')
  const b = await issue()
  assert.equal((await db.query("select params #> '{profileEvidence,testActivity}' as is_test from academy.attempt where attempt_id=$1",[b.attempt])).rows[0].is_test,false)
  assert.equal((await db.query("select snapshot -> 'testActivity' as is_test from academy.attempt_profile_result where attempt_id=$1",[a.attempt])).rows[0].is_test,null)
  await db.exec("set test.reject_progress='1'")
  await assert.rejects(commit(b), /injected progress failure/)
  assert.equal((await db.query('select outcome from academy.attempt where attempt_id=$1',[b.attempt])).rows[0].outcome,null)
  assert.equal((await db.query('select count(*)::int as n from academy.attempt_profile_result')).rows[0].n,1)
  await db.exec("set test.reject_progress='0'")
  assert.equal((await commit(b,b.claim,false)).rows[0].committed,true)
  rows=(await db.query('select passed from academy.attempt_profile_result order by passed')).rows
  assert.deepEqual(rows.map(r=>r.passed),[false,true])
  const unmarked = await issue()
  assert.equal((await commit(unmarked)).rows[0].committed,true)
  const resultStore=postgresProfileResultStore(db)
  assert.deepEqual(await resultStore.prepare([`${b.attempt}:0`]),[`${b.attempt}:0`])
  assert.notEqual((await db.query('select export_started_at from academy.attempt_profile_result where attempt_id=$1',[b.attempt])).rows[0].export_started_at,null)
  // A local activation withdrawal after mark must survive a lost HTTP response;
  // an otherwise valid row withdrawn before mark must not be admitted for send.
  await db.query("update academy.service_activation set status='suspended' where user_id=$1",[user])
  assert.deepEqual(await resultStore.prepare([`${unmarked.attempt}:0`]),[])
  assert.equal((await db.query('select count(*)::int as n from academy.profile_result_revocation where attempt_id=$1',[b.attempt])).rows[0].n,1)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from academy.attempt_profile_result'), /permission denied/)
  await assert.rejects(db.query('insert into academy.attempt_profile_result select * from academy.attempt_profile_result'), /permission denied/)
  await db.exec('reset role')
  await db.query('delete from academy.users where id=$1',[user]).catch(async()=> {
    // Existing attempts retain their user FK; remove those first as the retention owner would.
    await db.query('delete from academy.attempt where user_id=$1',[user])
    await db.query('delete from academy.users where id=$1',[user])
  })
  assert.equal((await db.query('select count(*)::int as n from academy.attempt_profile_result')).rows[0].n,0)
  assert.deepEqual(await resultStore.prepare([`${b.attempt}:1`]),[`${b.attempt}:1`])
  const tombstone=(await db.query('select snapshot from academy.profile_result_revocation where attempt_id=$1',[b.attempt])).rows[0]
  assert.equal(tombstone.snapshot.principal.subject,'learner-1')
  await resultStore.acknowledge([`${b.attempt}:1`])
  assert.equal((await db.query('select snapshot from academy.profile_result_revocation where attempt_id=$1',[b.attempt])).rows[0].snapshot,null)
  assert.deepEqual(await resultStore.prepare([`${b.attempt}:1`]),[])
  process.stdout.write('PASS disposable PostgreSQL: actual commit, retry, binary outcome, rollback, immutable snapshot, ACL, mark-before-send, local withdrawal before/after mark, tombstone survival and ACK scrub\n')
} finally { await db.close() }
