import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { createAcademyProductionLivePorts } from './academy-production-live-ports.mjs'

const D='a'.repeat(64), NOW=Date.parse('2026-08-29T05:00:00Z')
const ids={deployment:'11111111-1111-4111-8111-111111111111',version:'22222222-2222-4222-8222-222222222222',candidate:'33333333-3333-4333-8333-333333333333'}

async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'academy-live-ports-')));t.after(()=>rm(root,{recursive:true,force:true}))
  const operations={}
  for(const name of ['inspectRecovery','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']){
    const executable=join(root,name);const body='#!/bin/sh\nexit 0\n';await writeFile(executable,body);await chmod(executable,0o700)
    operations[name]={executable,sha256:createHash('sha256').update(body).digest('hex'),args:['--authority','{AUTHORITY_ID}','--release','{RELEASE_REVISION}','--readiness','{IDENTITY_READINESS_SHA256}','--valid-until','{VALID_UNTIL}']}
  }
  operations.inspectRecovery.args.push('--mode','{MODE}','--journal','{JOURNAL_SHA256}')
  operations.backupRestore.args.push('--identity-restore','{IDENTITY_RESTORE_SHA256}')
  operations.applyMigrations.args.push('--ordered','{ORDERED_MIGRATIONS}')
  operations.uploadCandidate.args.push('--source','{SOURCE_REVISION}','--traffic','{TRAFFIC}')
  operations.activateTraffic.args.push('--expected-deployment','{EXPECTED_DEPLOYMENT_ID}','--expected-version','{EXPECTED_VERSION_ID}','--candidate','{CANDIDATE_VERSION_ID}','--traffic','{TRAFFIC}')
  operations.smokeP1P7.args.push('--deployment','{DEPLOYMENT_ID}','--version','{VERSION_ID}','--config','{CONFIG_SHA256}')
  operations.rollbackTraffic.args.push('--expected-deployment','{EXPECTED_DEPLOYMENT_ID}','--expected-version','{EXPECTED_VERSION_ID}','--target','{TARGET_VERSION_ID}','--prior','{PRIOR_DEPLOYMENT_ID}')
  operations.checkResidue.args.push('--deployment','{DEPLOYMENT_ID}','--version','{VERSION_ID}')
  const authority={schema:'academy-production-live-authority/v1',authorityId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',authorizedBy:'founder',validFrom:'2026-08-29T04:00:00Z',validUntil:'2026-08-29T06:00:00Z',releaseRevision:'a'.repeat(40),identityReadinessSha256:D,target:{workerName:'cyberskills-academy',pool:'Pool A',database:'postgres',schema:'academy'},operations}
  const authorityPath=join(root,'authority.json');await writeFile(authorityPath,`${JSON.stringify(authority)}\n`,{mode:0o600})
  return{authorityPath,operations,expected:{releaseRevision:'a'.repeat(40),identityReadinessSha256:D}}
}

const deployment=()=>({deployments:[{id:ids.deployment,created_on:'2026-08-29T04:30:00Z',versions:[{version_id:ids.version,percentage:100}]}]})

test('adapter binds protected authority, pinned executables and Cloudflare CAS',async t=>{const f=await fixture(t),calls=[];const run=async call=>{calls.push(call);return{status:0,stdout:JSON.stringify(call.operation==='inspectRecovery'?deployment():{status:'PASS',receiptSha256:D})}};const ports=await createAcademyProductionLivePorts({authorityPath:f.authorityPath,run,expected:f.expected,clock:()=>NOW});assert.deepEqual(await ports.discoverCurrent(),{deploymentId:ids.deployment,versionId:ids.version});await ports.activateTraffic({expectedCurrentDeploymentId:ids.deployment,expectedCurrentVersionId:ids.version,candidateVersionId:ids.candidate,traffic:100});assert.ok(calls.at(-1).args.includes(ids.candidate));assert.ok(calls.at(-1).args.includes('2026-08-29T06:00:00Z'));assert.equal(calls.at(-1).args.some(value=>value.includes('secret-value')),false)})

test('adapter rejects expired authority before command execution',async t=>{const f=await fixture(t);let calls=0;await assert.rejects(createAcademyProductionLivePorts({authorityPath:f.authorityPath,run:async()=>{calls++},expected:f.expected,clock:()=>Date.parse('2026-08-29T07:00:00Z')}));assert.equal(calls,0)})

test('adapter rejects executable digest drift',async t=>{const f=await fixture(t);await writeFile(f.operations.backupRestore.executable,'#!/bin/sh\nexit 1\n');await assert.rejects(createAcademyProductionLivePorts({authorityPath:f.authorityPath,run:async()=>({status:0,stdout:'{}'}),expected:f.expected,clock:()=>NOW}))})

test('adapter revalidates executable immediately before every invocation',async t=>{const f=await fixture(t);let calls=0;const ports=await createAcademyProductionLivePorts({authorityPath:f.authorityPath,run:async()=>{calls++;return{status:0,stdout:JSON.stringify(deployment())}},expected:f.expected,clock:()=>NOW});await writeFile(f.operations.inspectRecovery.executable,'#!/bin/sh\nexit 1\n');await assert.rejects(ports.discoverCurrent());assert.equal(calls,0)})

test('adapter fails CAS before traffic mutation',async t=>{const f=await fixture(t),calls=[];const run=async call=>{calls.push(call);return{status:0,stdout:JSON.stringify(deployment())}};const ports=await createAcademyProductionLivePorts({authorityPath:f.authorityPath,run,expected:f.expected,clock:()=>NOW});await assert.rejects(ports.activateTraffic({expectedCurrentDeploymentId:ids.deployment,expectedCurrentVersionId:ids.candidate,candidateVersionId:ids.candidate,traffic:100}));assert.equal(calls.some(x=>x.operation==='activateTraffic'),false)})

test('adapter rejects plan/readiness drift and strict placeholder ambiguity',async t=>{const f=await fixture(t);await assert.rejects(createAcademyProductionLivePorts({authorityPath:f.authorityPath,run:async()=>{},expected:{...f.expected,releaseRevision:'b'.repeat(40)},clock:()=>NOW}));const authority=JSON.parse(await (await import('node:fs/promises')).readFile(f.authorityPath));authority.operations.backupRestore.args[1]='prefix-{AUTHORITY_ID}';await writeFile(f.authorityPath,`${JSON.stringify(authority)}\n`,{mode:0o600});await assert.rejects(createAcademyProductionLivePorts({authorityPath:f.authorityPath,run:async()=>{},expected:f.expected,clock:()=>NOW}))})
