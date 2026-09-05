import {createDockerInvoker,inspectPinnedPostgresImage,buildOwnedPostgresRunArguments,attemptOwnedContainerCreate,cleanupOwnedContainer,installTerminationHandlers} from '/private/tmp/academy-security-glm-cde63a58/academy-web/scripts/test-identity-lifecycle-page-store-postgres.mjs';
import fs from 'node:fs';
import {randomUUID,randomBytes,randomInt} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const state='/private/tmp/cyberskills-prod-cde63a58';
const repo='/private/tmp/academy-security-glm-cde63a58/academy-web';
if(fs.existsSync(repo+'/.env.local'))throw new Error('Refuse ambient env file for disposable test');
const config=fs.mkdtempSync(state+'/admission-pg-config-');fs.chmodSync(config,0o700);
const invoke=createDockerInvoker({cliPath:'/usr/local/bin/docker',socketPath:'/var/run/docker.sock',configDirectory:config});
const nonce=randomUUID(),name=`academy-identity-lifecycle-${process.pid}-${nonce.slice(0,8)}`;
const ownership={key:'com.cyberskills.test-run',value:nonce};
const password=randomBytes(32).toString('base64url');
const environment={POSTGRES_DB:'academy_admission_test',POSTGRES_USER:'academy_admission_test',POSTGRES_PASSWORD:password};
let created=false,cleaned=false;
const cleanup=()=>{if(cleaned)return;if(created)cleanupOwnedContainer(invoke,name,3,ownership);fs.rmSync(config,{recursive:true});cleaned=true;};
installTerminationHandlers(process,cleanup,code=>process.exit(code));
const record={container:name,owner:nonce,production:false,migrations:[],checks:[]};
const save=()=>fs.writeFileSync(state+'/academy-admission-postgres-r6.json',JSON.stringify(record,null,2));
try{
 record.image=inspectPinnedPostgresImage(invoke);let port;
 for(let i=0;i<10&&!created;i++){port=randomInt(61000,62000);created=attemptOwnedContainerCreate(invoke,name,buildOwnedPostgresRunArguments({containerName:name,ownerNonce:nonce,port}),ownership,environment);}
 if(!created)throw new Error('No owned test port');save();
 let ready=false;for(let i=0;i<60&&!ready;i++){const r=invoke(['exec',name,'pg_isready','-h','127.0.0.1','-U',environment.POSTGRES_USER,'-d',environment.POSTGRES_DB]);ready=r.status===0;if(!ready)await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Fixture not ready');
 const roles=['postgres','anon','authenticated','service_role','academy_runtime','academy_api_anon','academy_api_authenticator','academy_retention','academy_retention_definer','academy_retention_api_anon','academy_retention_api_authenticator'];
 const prefix=roles.map(r=>`create role ${r} nologin;`).join('\n');
 const paths=fs.readdirSync(repo+'/supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'0029').sort();
 const sql=prefix+'\n'+paths.map(f=>fs.readFileSync(repo+'/supabase/migrations/'+f,'utf8')).join('\n');
 function psql(text,label){const r=spawnSync('/usr/local/bin/docker',['--host','unix:///var/run/docker.sock','exec','-i',name,'psql','-X','-v','ON_ERROR_STOP=1','-U',environment.POSTGRES_USER,'-d',environment.POSTGRES_DB],{input:text,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});fs.writeFileSync(state+'/academy-admission-pg-r6-'+label+'.log',String(r.stdout??'')+String(r.stderr??''));record.checks.push({label,exit:r.status});save();if(r.error||r.status!==0)throw new Error('Fixture SQL failed: '+label);}
 psql('BEGIN;\n'+sql+'\nROLLBACK;','bootstrap-rollback');
 psql('BEGIN;\n'+sql+'\nCOMMIT;','bootstrap-commit');record.migrations=paths;save();
 const uri=`postgresql://${environment.POSTGRES_USER}:${password}@127.0.0.1:${port}/${environment.POSTGRES_DB}`;
 const env={...process.env,TEST_DATABASE_URL:uri};delete env.DATABASE_URL;
 const baseline=spawnSync(process.execPath,[state+'/academy-admission-cap-baseline.mjs'],{cwd:repo,env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 fs.writeFileSync(state+'/academy-admission-cap-baseline-red.log',(String(baseline.stdout??'')+String(baseline.stderr??'')).replaceAll(password,'[REDACTED]'));
 record.baseline_red_exit=baseline.status;save();if(baseline.status!==1)throw new Error('Baseline did not reproduce missing aggregate cap');
 const test=spawnSync(process.execPath,[repo+'/node_modules/vitest/vitest.mjs','run','--project','integration','tests/integration/identity-postgres-transaction-store.test.ts'],{cwd:repo,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const output=(String(test.stdout??'')+String(test.stderr??'')).replaceAll(password,'[REDACTED]').replaceAll(uri,'[DISPOSABLE_DATABASE]');
 fs.writeFileSync(state+'/academy-admission-postgres-r6-test.log',output);record.test_exit=test.status;record.test_error=test.error?.code??null;save();console.log(JSON.stringify({test_exit:test.status,test_error:record.test_error,log:state+'/academy-admission-postgres-r6-test.log'}));process.exitCode=test.status??1;
}finally{cleanup();record.cleanup_verified=cleaned;save();console.log('Owned disposable PostgreSQL cleanup verified');}
