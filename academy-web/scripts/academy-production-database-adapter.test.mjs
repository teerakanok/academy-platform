import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { executeAcademyDatabaseOperation } from './academy-production-database-adapter.mjs'

const D='a'.repeat(64), R='b'.repeat(40), UNTIL='2099-08-29T23:59:59Z', IDS=['0021','0022','0023','0024','0025','0026','0027']
const canonical=async(path,value,mode=0o600)=>writeFile(path,`${JSON.stringify(value)}\n`,{mode})
const digest=value=>createHash('sha256').update(value).digest('hex')

async function fixture(t){
  const dir=await mkdtemp('/private/tmp/academy-db-adapter-');t.after(()=>rm(dir,{recursive:true,force:true}))
  const executable=join(dir,'helper');const source='#!/bin/sh\nexit 0\n';await writeFile(executable,source,{mode:0o700});await chmod(executable,0o700)
  const backup=join(dir,'backup.json'), migrations=join(dir,'migrations.json'), config=join(dir,'config.json')
  const manifest=[];for(const id of IDS){const path=join(dir,`${id}.sql`),body=`select '${id}';\n`;await writeFile(path,body,{mode:0o600});manifest.push({id,path,sha256:digest(body)})}
  await canonical(config,{schema:'academy-production-database-adapter-config/v1',target:{pool:'Pool A',database:'postgres',schema:'academy'},migrations:manifest,backupRestore:{executable,sha256:digest(source),receiptPath:backup},applyMigrations:{executable,sha256:digest(source),receiptPath:migrations}})
  const authorityId=randomUUID();const binding={authorityId,releaseRevision:R,identityReadinessSha256:D,validUntil:UNTIL}
  return{config,backup,migrations,binding,input(operationValue){return{...binding,operationValue}}}
}

test('accepts an exact Academy-only isolated restore and protected rollback receipt',async t=>{const f=await fixture(t);const receipt={schema:'academy-poola-backup-restore/v1',status:'MATCH',operation:'academy-backup-restore',binding:f.binding,target:{pool:'Pool A',database:'postgres',schema:'academy'},identityRestoreReceiptSha256:D,checks:[{name:'isolated-restore',status:'MATCH'},{name:'academy-schema-only',status:'MATCH'},{name:'ownership-grants',status:'MATCH'}],rollback:{status:'READY',artifactSha256:D}};const result=await executeAcademyDatabaseOperation({configPath:f.config,input:f.input({kind:'backupRestore',identityRestoreReceiptSha256:D}),run:async call=>{assert.ok(call.args.includes('academy'));await canonical(f.backup,receipt);return{status:0,stdout:'RECEIPT_WRITTEN\n'}}});assert.equal(result.status,'MATCH');assert.equal(result.receiptSha256,digest(`${JSON.stringify(receipt)}\n`))})

test('accepts retry evidence only when every ordered migration is ledgered',async t=>{const f=await fixture(t);const config=JSON.parse(await (await import('node:fs/promises')).readFile(f.config));const prior={restored:true};await canonical(f.backup,prior);const backupSha=digest(`${JSON.stringify(prior)}\n`);const receipt={schema:'academy-poola-migrations/v1',status:'PASS',operation:'academy-migrations-0021-0027',binding:f.binding,target:{pool:'Pool A',database:'postgres',schema:'academy'},ordered:IDS,ledger:config.migrations.map((m,i)=>({id:m.id,sha256:m.sha256,status:i<3?'ALREADY_APPLIED':'APPLIED'})),rollback:{backupReceiptSha256:backupSha,status:'READY'}};const result=await executeAcademyDatabaseOperation({configPath:f.config,input:f.input({kind:'applyMigrations',ordered:IDS}),run:async call=>{assert.equal(call.args.filter(x=>x==='--migration').length,7);await canonical(f.migrations,receipt);return{status:0,stdout:'RECEIPT_WRITTEN\n'}}});assert.equal(result.status,'PASS')})

test('refuses missing ledger rows, reordered migrations, foreign schema, and failed restore checks',async t=>{const f=await fixture(t);const config=JSON.parse(await (await import('node:fs/promises')).readFile(f.config));await canonical(f.backup,{restored:true});const backupSha=digest(`${JSON.stringify({restored:true})}\n`);const base={schema:'academy-poola-migrations/v1',status:'PASS',operation:'academy-migrations-0021-0027',binding:f.binding,target:{pool:'Pool A',database:'postgres',schema:'academy'},ordered:IDS,ledger:config.migrations.map(m=>({id:m.id,sha256:m.sha256,status:'APPLIED'})),rollback:{backupReceiptSha256:backupSha,status:'READY'}};for(const changed of [{...base,ledger:base.ledger.slice(0,6)},{...base,target:{...base.target,schema:'public'}},{...base,rollback:{...base.rollback,status:'UNKNOWN'}},{...base,binding:{...base.binding,releaseRevision:'c'.repeat(40)}}])await assert.rejects(executeAcademyDatabaseOperation({configPath:f.config,input:f.input({kind:'applyMigrations',ordered:IDS}),run:async()=>{await canonical(f.migrations,changed);return{status:0,stdout:'RECEIPT_WRITTEN\n'}}}));await assert.rejects(executeAcademyDatabaseOperation({configPath:f.config,input:f.input({kind:'applyMigrations',ordered:[...IDS].reverse()}),run:async()=>({status:0,stdout:'RECEIPT_WRITTEN\n'})}))})

test('refuses digest drift and group-readable protected inputs',async t=>{const f=await fixture(t);await chmod(f.config,0o640);await assert.rejects(executeAcademyDatabaseOperation({configPath:f.config,input:f.input({kind:'backupRestore',identityRestoreReceiptSha256:D}),run:async()=>({status:0,stdout:'RECEIPT_WRITTEN\n'})}))})
