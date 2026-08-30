#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const WORKER = '/private/tmp/academy-result-loss-remediation/academy-web/scripts/academy-macos-root-preflight-worker.sh'
const ROOT_COPY = '/private/var/root/academy-macos-root-preflight-worker-4795eebe6c951d9e.sh'
const EXPECTED_WORKER_SHA256 = '4795eebe6c951d9e0260f76ffcb8bbcf1f4e13f49710e8d151621aa143df3bcd'
const OBSERVER = '/private/var/root/academy-release-observer-7dca6452'
const RECOVERY = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-macos-release-recovery.mjs`
const POINTER = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-release-pointer.mjs`
const NODE = '/private/tmp/academy-release-sources-fa7/node'
const EXPECTED_RECOVERY_SHA256 = '265a1b500cd09a0c92316b188e57257de5375afa59b6a3d3f8e4e4452698176d'
const EXPECTED_POINTER_SHA256 = '7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee'
const EXPECTED_NODE_SHA256 = '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188'
const fail = () => { throw new Error('ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED') }

export const BOUND_WORKER_EXECUTOR = String.raw`const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const [path,digest,uidText,gidText,modeText]=process.argv.slice(1),uid=BigInt(uidText),gid=BigInt(gidText),mode=BigInt(modeText);
const keys=['dev','ino','size','uid','gid','mode','nlink','mtimeMs','ctimeMs'],same=(a,b)=>keys.every(k=>a[k]===b[k]);
const valid=m=>m.isFile()&&!m.isSymbolicLink()&&m.uid===uid&&m.gid===gid&&m.nlink===1n&&(m.mode&0o777n)===mode;
const hash=(fd,size)=>{const h=crypto.createHash('sha256'),b=Buffer.alloc(65536);let p=0;while(p<Number(size)){const n=fs.readSync(fd,b,0,Math.min(b.length,Number(size)-p),p);if(n<1)throw Error('read');h.update(b.subarray(0,n));p+=n}return h.digest('hex')};
(async()=>{let fd;try{const before=fs.lstatSync(path,{bigint:true});if(!valid(before))throw Error('metadata');fd=fs.openSync(path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const inside=fs.fstatSync(fd,{bigint:true});if(!same(before,inside)||hash(fd,inside.size)!==digest)throw Error('binding');const child=cp.spawn('/bin/zsh',['/dev/fd/3'],{stdio:['ignore','inherit','inherit',fd],env:{HOME:'/private/var/root',LANG:'C',LC_ALL:'C',PATH:'/usr/bin:/bin'}});const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});const after=fs.fstatSync(fd,{bigint:true}),named=fs.lstatSync(path,{bigint:true});if(!same(inside,after)||!same(after,named)||hash(fd,after.size)!==digest)throw Error('replaced');if(result.code!==0||result.signal!==null)process.exit(1)}catch{process.exit(1)}finally{if(fd!==undefined)fs.closeSync(fd)}})()`

export async function verifyWorker() {
  const bytes = await readFile(WORKER)
  if (createHash('sha256').update(bytes).digest('hex') !== EXPECTED_WORKER_SHA256) fail()
  for (const [path, digest] of [[RECOVERY, EXPECTED_RECOVERY_SHA256], [POINTER, EXPECTED_POINTER_SHA256], [NODE, EXPECTED_NODE_SHA256]]) {
    if (createHash('sha256').update(await readFile(path)).digest('hex') !== digest) fail()
  }
  return bytes
}

export async function main({ spawnProcess = spawn } = {}) {
  await verifyWorker()
  const ensure = (source, target, mode, digest) => `if test -e '${target}' || test -L '${target}'; then test -f '${target}' && test ! -L '${target}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${target}')\" = 'root:wheel:${mode}:1' && /usr/bin/shasum -a 256 '${target}' | /usr/bin/grep -q '^${digest} '; else /usr/bin/install -o root -g wheel -m ${mode} '${source}' '${target}'; fi`
  const command = `if test -e '${ROOT_COPY}' || test -L '${ROOT_COPY}'; then test -f '${ROOT_COPY}' && test ! -L '${ROOT_COPY}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${ROOT_COPY}')\" = 'root:wheel:500:1' && /usr/bin/shasum -a 256 '${ROOT_COPY}' | /usr/bin/grep -q '^${EXPECTED_WORKER_SHA256} '; else /usr/bin/install -o root -g wheel -m 500 '${WORKER}' '${ROOT_COPY}'; fi && if test -e '${OBSERVER}' || test -L '${OBSERVER}'; then test -d '${OBSERVER}' && test ! -L '${OBSERVER}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp' '${OBSERVER}')\" = 'root:wheel:700'; else /usr/bin/install -d -o root -g wheel -m 700 '${OBSERVER}'; fi && ${ensure(NODE, `${OBSERVER}/node`, 500, EXPECTED_NODE_SHA256)} && ${ensure(RECOVERY, `${OBSERVER}/academy-macos-release-recovery.mjs`, 400, EXPECTED_RECOVERY_SHA256)} && ${ensure(POINTER, `${OBSERVER}/academy-release-pointer.mjs`, 400, EXPECTED_POINTER_SHA256)} && '${OBSERVER}/node' -e ${JSON.stringify(BOUND_WORKER_EXECUTOR)} '${ROOT_COPY}' '${EXPECTED_WORKER_SHA256}' 0 0 320`
  const script = `do shell script ${JSON.stringify(command)} with administrator privileges`
  const child = spawnProcess('/usr/bin/osascript', ['-e', script], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (status !== 0) fail()
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => {
  process.stderr.write('ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED\n')
  process.exitCode = 1
})
