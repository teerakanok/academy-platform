import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const require = createRequire('/private/tmp/academy-session-digest-cde63a58/academy-web/package.json');
const { Client } = require('pg');
const config = {host:'/private/tmp/postgres-fixture-cde63a58/socket',port:65433,user:'fixture_owner',database:'academy_transition_v2'};
const admin = new Client(config), lifecycle = new Client(config), callback = new Client(config);
const issuer='https://supabase.cyberskills.co.th/auth/v1';
const subject='digest-lock-'+Date.now();
const key=[...subject].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const email=subject+'@example.com';
await Promise.all([admin.connect(),lifecycle.connect(),callback.connect()]);
let attempted;
try {
  assert.equal((await admin.query('show data_directory')).rows[0].data_directory,'/private/tmp/postgres-fixture-cde63a58/data');
  await admin.query('select academy.commit_identity_profile_activation($1,$2,$3,\'active\',1)',[issuer,subject,email]);
  const issue = (client,id)=>client.query('select academy.create_identity_session($1,$2,$3,$4,\'active\',1,86400)',[id,issuer,key,email]);
  await issue(admin,randomBytes(32).toString('base64url'));
  await admin.query('update academy.identity_session set created_at=clock_timestamp()-interval \'2 days\',expires_at=clock_timestamp()-interval \'1 day\' where issuer=$1 and subject_key=$2',[issuer,key]);
  await lifecycle.query('begin');
  await lifecycle.query('select pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text)::text,0))',[issuer,key]);
  const pid=(await callback.query('select pg_backend_pid() as pid')).rows[0].pid;
  attempted=issue(callback,randomBytes(32).toString('base64url')).then(()=>({created:true}),error=>({created:false,code:error.code}));
  let waiting=false;
  for(let i=0;i<100&&!waiting;i++){
    const row=(await admin.query('select wait_event from pg_stat_activity where pid=$1',[pid])).rows[0];
    waiting=row?.wait_event==='advisory';
    if(!waiting)await new Promise(r=>setTimeout(r,20));
  }
  await lifecycle.query("set local lock_timeout='250ms'");
  let revoked,errorCode;
  try {revoked=(await lifecycle.query('select academy.revoke_identity_sessions_for_principal($1,$2,1000) as count',[issuer,key])).rows[0].count;await lifecycle.query('commit');}
  catch(error){errorCode=error.code;await lifecycle.query('rollback');}
  const result=await attempted;
  console.log(JSON.stringify({advisoryWaitObserved:waiting,revoked:revoked??null,errorCode:errorCode??null,sessionResult:result}));
  assert.equal(waiting,true);assert.equal(revoked,1);assert.equal(result.created,true);
} finally {
  await lifecycle.query('rollback').catch(()=>{});
  if(attempted)await attempted;
  await Promise.all([admin.end(),lifecycle.end(),callback.end()]);
}
