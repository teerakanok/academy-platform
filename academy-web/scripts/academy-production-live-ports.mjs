import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseCurrentDeploymentJson } from './current-deployment.mjs'

const SHA=/^[a-f0-9]{64}$/; const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPS=['inspectRecovery','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']
const REQUIRED_BINDINGS={inspectRecovery:['MODE','JOURNAL_SHA256'],backupRestore:['IDENTITY_RESTORE_SHA256'],applyMigrations:['ORDERED_MIGRATIONS'],uploadCandidate:['SOURCE_REVISION','TRAFFIC'],activateTraffic:['EXPECTED_DEPLOYMENT_ID','EXPECTED_VERSION_ID','CANDIDATE_VERSION_ID'],smokeP1P7:['DEPLOYMENT_ID','VERSION_ID','CONFIG_SHA256'],rollbackTraffic:['EXPECTED_DEPLOYMENT_ID','EXPECTED_VERSION_ID','TARGET_VERSION_ID','PRIOR_DEPLOYMENT_ID'],checkResidue:['DEPLOYMENT_ID','VERSION_ID']}
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===k.length&&Reflect.ownKeys(v).every((x,i)=>x===k[i])
const fail=()=>{throw new Error('Academy live adapter rejected the operation')}

async function protectedJson(path) {
  const target=resolve(path); if(await realpath(target)!==target) fail()
  const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW)
  try { const m=await handle.stat(); if(!m.isFile()||m.nlink!==1||(m.mode&0o077)||m.uid!==process.getuid()) fail(); return JSON.parse(await handle.readFile('utf8')) } finally { await handle.close() }
}

function validateAuthority(a, now) {
  if(!exact(a,['schema','authorityId','authorizedBy','validFrom','validUntil','releaseRevision','identityReadinessSha256','target','operations'])
    ||a.schema!=='academy-production-live-authority/v1'||!UUID.test(a.authorityId)||typeof a.authorizedBy!=='string'
    ||! /^[a-f0-9]{40}$/.test(a.releaseRevision)||!SHA.test(a.identityReadinessSha256)
    ||!exact(a.target,['workerName','pool','database','schema'])||a.target.workerName!=='cyberskills-academy'||a.target.pool!=='Pool A'||a.target.database!=='postgres'||a.target.schema!=='academy'
    ||!exact(a.operations,OPS)||OPS.some(name=>!exact(a.operations[name],['executable','sha256','args'])||resolve(a.operations[name].executable)!==a.operations[name].executable||!SHA.test(a.operations[name].sha256)||!Array.isArray(a.operations[name].args)||a.operations[name].args.some(x=>typeof x!=='string')||REQUIRED_BINDINGS[name].some(binding=>!a.operations[name].args.some(arg=>arg.includes(`{${binding}}`))))
    ||!Number.isFinite(Date.parse(a.validFrom))||!Number.isFinite(Date.parse(a.validUntil))||now<Date.parse(a.validFrom)||now>Date.parse(a.validUntil)) fail()
  return a
}

async function verifyExecutable(spec) {
  if(await realpath(spec.executable)!==spec.executable)fail()
  const m=await stat(spec.executable); if(!m.isFile()||!(m.mode&0o111)||(m.mode&0o022)||(m.uid!==process.getuid()&&m.uid!==0)) fail()
  const h=createHash('sha256'); const handle=await open(spec.executable,constants.O_RDONLY|constants.O_NOFOLLOW)
  try { for await (const chunk of handle.createReadStream()) h.update(chunk) } finally { await handle.close() }
  if(h.digest('hex')!==spec.sha256) fail()
}

function substitute(args, bindings) { return args.map(value=>value.replaceAll(/\{([A-Z0-9_]+)\}/g,(_,key)=>{if(!(key in bindings))fail();return String(bindings[key])})) }

export async function createAcademyProductionLivePorts({authorityPath,run,clock=()=>Date.now()}) {
  if(typeof run!=='function') fail()
  const authority=validateAuthority(await protectedJson(authorityPath),clock())
  for(const spec of Object.values(authority.operations)) await verifyExecutable(spec)
  const invoke=async(name,bindings={})=>{
    if(clock()>Date.parse(authority.validUntil)) fail()
    const spec=authority.operations[name]; const result=await run({operation:name,executable:spec.executable,args:substitute(spec.args,{...bindings,AUTHORITY_ID:authority.authorityId,RELEASE_REVISION:authority.releaseRevision})})
    if(!exact(result,['status','stdout'])||result.status!==0||typeof result.stdout!=='string'||result.stdout.length>1024*1024) fail()
    try{return JSON.parse(result.stdout)}catch{fail()}
  }
  const discoverCurrent=async()=>{const value=await invoke('inspectRecovery',{MODE:'discover-current',JOURNAL_SHA256:''});const current=parseCurrentDeploymentJson(JSON.stringify(value.deployments));if(current.versions.length!==1||current.versions[0].percentage!==100)fail();return{deploymentId:current.id,versionId:current.versions[0].id}}
  return Object.freeze({
    inspectRecovery:input=>invoke('inspectRecovery',{MODE:'reconcile',JOURNAL_SHA256:input.journalSha256}),
    discoverCurrent,
    backupRestore:input=>invoke('backupRestore',{IDENTITY_RESTORE_SHA256:input.identityRestoreReceiptSha256}),
    applyMigrations:input=>invoke('applyMigrations',{ORDERED_MIGRATIONS:input.ordered.join(',')}),
    uploadCandidate:input=>invoke('uploadCandidate',{SOURCE_REVISION:input.sourceRevision,TRAFFIC:String(input.traffic)}),
    activateTraffic:async input=>{const before=await discoverCurrent();if(before.deploymentId!==input.expectedCurrentDeploymentId||before.versionId!==input.expectedCurrentVersionId)fail();return invoke('activateTraffic',{EXPECTED_DEPLOYMENT_ID:before.deploymentId,EXPECTED_VERSION_ID:before.versionId,CANDIDATE_VERSION_ID:input.candidateVersionId,TRAFFIC:String(input.traffic)})},
    smokeP1P7:input=>invoke('smokeP1P7',{DEPLOYMENT_ID:input.deploymentId,VERSION_ID:input.versionId,CONFIG_SHA256:input.configuredNamesSha256}),
    rollbackTraffic:async input=>{const before=await discoverCurrent();if(before.deploymentId!==input.expectedActiveDeploymentId||before.versionId!==input.expectedActiveVersionId)fail();return invoke('rollbackTraffic',{EXPECTED_DEPLOYMENT_ID:before.deploymentId,EXPECTED_VERSION_ID:before.versionId,TARGET_VERSION_ID:input.targetVersionId,PRIOR_DEPLOYMENT_ID:input.priorDeploymentId})},
    checkResidue:input=>invoke('checkResidue',{DEPLOYMENT_ID:input.expectedDeploymentId,VERSION_ID:input.expectedVersionId}),
  })
}
