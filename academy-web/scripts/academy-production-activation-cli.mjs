#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, open, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createAcademyProductionLivePorts } from './academy-production-live-ports.mjs'
import { ACTIVATION_RELEASE, runAcademyProductionActivation, writeControllerReceipt } from './identity-production-activation-controller.mjs'

async function readProtected(path) {
  const target=resolve(path);if(await realpath(target)!==target)throw new Error()
  const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW)
  try{const m=await handle.stat();if(!m.isFile()||m.nlink!==1||(m.mode&0o077)||m.uid!==process.getuid())throw new Error();return JSON.parse(await handle.readFile('utf8'))}finally{await handle.close()}
}

export function runExecutable({executable,args}) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(executable,args,{stdio:['ignore','pipe','ignore'],env:process.env})
    const chunks=[];let bytes=0
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){child.kill('SIGKILL');reject(new Error())}else chunks.push(chunk)})
    child.on('error',reject);child.on('close',status=>resolvePromise({status,stdout:Buffer.concat(chunks).toString('utf8')}))
  })
}

export async function main(args) {
  if(args.length!==5)throw new Error('usage: academy-production-activation-cli.mjs <plan.json> <authority.json> <journal.json> <receipt.json> <release-token>')
  const [planPath,authorityPath,journalPath,receiptPath,release]=args
  if(release!==ACTIVATION_RELEASE)throw new Error('release intent rejected')
  const plan=await readProtected(planPath)
  const ports=await createAcademyProductionLivePorts({authorityPath,run:runExecutable})
  const receipt=await runAcademyProductionActivation({plan,ports,release,journalPath:resolve(journalPath),receiptPath:resolve(receiptPath)})
  try { await access(resolve(journalPath)); await writeControllerReceipt(resolve(receiptPath),receipt,{journalPath:resolve(journalPath)}) } catch (error) { if(error.code!=='ENOENT')throw error }
  return receipt.status
}

if(import.meta.url===`file://${process.argv[1]}`)main(process.argv.slice(2)).then(status=>console.log(status)).catch(()=>{console.error('Academy production activation failed; inspect protected receipt/journal');process.exitCode=1})
