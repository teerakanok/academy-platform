import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire('/private/tmp/academy-session-digest-cde63a58/academy-web/package.json');
const {Client}=require('pg');
const precreated=process.argv.includes('--precreated');
const config={host:'/private/tmp/postgres-fixture-cde63a58/socket',port:65433,user:'fixture_owner',database:precreated?'academy_digest_concurrent_precreated':'academy_digest_concurrent'};
const admin=new Client(config),first=new Client(config),second=new Client(config);
await Promise.all([admin.connect(),first.connect(),second.connect()]);
const migration=readFileSync('/private/tmp/academy-session-digest-cde63a58/academy-web/supabase/migrations/0034_identity_session_id_digest.sql','utf8');
const raw=randomBytes(32).toString('base64url');
const hash=v=>createHash('sha256').update(v).digest('base64url');
const issuer='https://supabase.cyberskills.co.th/auth/v1',subject='concurrent-migration-test';
const key=[...subject].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
let pending;
try{
  assert.equal((await admin.query('show data_directory')).rows[0].data_directory,'/private/tmp/postgres-fixture-cde63a58/data');
  if(precreated){
    const setup=migration.slice(0,migration.indexOf('do $$'));
    await admin.query('begin');await admin.query(setup);await admin.query('rollback');
    await admin.query('begin');await admin.query(setup);await admin.query('commit');
  }
  await admin.query('select academy.commit_identity_profile_activation($1,$2,$3,\'active\',1)',[issuer,subject,'migration@example.com']);
  await admin.query('select academy.create_identity_session($1,$2,$3,$4,\'active\',1,3600)',[raw,issuer,key,'migration@example.com']);
  // Exact migration body rehearsed and rolled back before test-only COMMIT.
  await first.query('begin');await first.query(migration);await first.query('rollback');
  await first.query('begin');await first.query(migration);
  await second.query('begin');
  const pid=(await second.query('select pg_backend_pid() as pid')).rows[0].pid;
  pending=second.query(migration).then(()=>({accepted:true}),e=>({accepted:false,code:e.code,message:e.message}));
  let wait;
  for(let i=0;i<100;i++){
    wait=(await admin.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(wait?.wait_event_type==='Lock')break;
    await new Promise(r=>setTimeout(r,20));
  }
  await first.query('commit');
  const outcome=await pending;await second.query('rollback');
  const stored=(await admin.query('select id from academy.identity_session where issuer=$1 and subject_key=$2',[issuer,key])).rows;
  const markers=(await admin.query('select count(*)::int as count from academy.identity_session_id_digest_transition')).rows[0].count;
  const result={wait,second:outcome,markerCount:markers,exactlyOnce:stored.length===1&&stored[0].id===hash(raw),doubleHash:stored.some(x=>x.id===hash(hash(raw)))};
  console.log(JSON.stringify(result));
  assert.equal(outcome.accepted,false);assert.equal(result.exactlyOnce,true);assert.equal(result.doubleHash,false);assert.equal(markers,1);
}finally{
  await first.query('rollback').catch(()=>{});
  if(pending)await pending;
  await second.query('rollback').catch(()=>{});
  await Promise.all([admin.end(),first.end(),second.end()]);
}
