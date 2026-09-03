import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { constants, statSync } from 'node:fs'
import { access, chmod, copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OBSERVER_ASSETS, boundWorkerInvocation, main, parseDiagnosticEnvelope, verifyWorker } from './academy-macos-root-preflight.mjs'

const mockOsascript = ({ status=0, stdout='ACADEMY_ROOT_PREFLIGHT_RESULT status=PASS\n', stderr='' } = {}) =>
  (executable,args,options) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.stdout.setEncoding = () => {}; child.stderr.setEncoding = () => {}
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data',stdout)
      if (stderr) child.stderr.emit('data',stderr)
      child.emit('close',status)
    })
    return child
  }

test('full remaining preflight has exactly one elevation prompt', async () => {
  const calls = []
  await main({ spawnProcess(executable, args, options) {
    calls.push({ executable, args, options })
    return mockOsascript()(executable,args,options)
  } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal(calls[0].args.filter(value => value.includes('with administrator privileges')).length, 1)
  assert.equal(calls[0].args.join(' ').includes('sudo'), false)
  assert.doesNotMatch(calls[0].args.join(' '), /\/node' -e/)
  assert.match(calls[0].args.join(' '), /academy-bound-worker-executor\.cjs/)
  assert.match(calls[0].args.join(' '), /07ed27c084efc6767b010a33a2b80522161bf85b1298d5606fceb8616cf4ab2e/)
})

test('launcher separates authorization cancellation from bounded privileged failures', async () => {
  await assert.rejects(main({spawnProcess:mockOsascript({status:1,stderr:'user canceled and secret detail'})}),
    /^Error: AUTHORIZATION_NOT_COMPLETED$/)
  for (const reason of ['ROOT_BOOTSTRAP_REJECTED','EXECUTOR_BINDING_REJECTED','EXECUTOR_SPAWN_REJECTED','EXECUTOR_POSTCHECK_REJECTED']) {
    await assert.rejects(main({spawnProcess:mockOsascript({stdout:`ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=${reason}\n`})}),
      new RegExp(`${reason}$`))
  }
})

test('launcher relays only exact whitelisted worker fields and suppresses raw output', async () => {
  const line='ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=WORKER_REJECTED phase=INSTALL_RELEASE publication=UNKNOWN worker_reason=FOREIGN_STAGE\n'
  await assert.rejects(main({spawnProcess:mockOsascript({stdout:line,stderr:'password=do-not-relay'})}),
    /^Error: WORKER_REJECTED phase=INSTALL_RELEASE publication=UNKNOWN reason=FOREIGN_STAGE$/)
  for (const output of ['secret\n',`${line}secret\n`,line.replace('FOREIGN_STAGE','SECRET_VALUE')]) {
    await assert.rejects(main({spawnProcess:mockOsascript({stdout:output,stderr:'another secret'})}),
      /^Error: ROOT_BOOTSTRAP_REJECTED$/)
  }
  assert.equal(parseDiagnosticEnvelope('ACADEMY_ROOT_PREFLIGHT_RESULT status=PASS\n')?.status,'PASS')
})

test('launcher binds exact worker bytes and repository contains one elevation site', async () => {
  await verifyWorker()
  const launcher = await readFile(new URL('./academy-macos-root-preflight.mjs', import.meta.url), 'utf8')
  assert.equal(launcher.match(/with administrator privileges/g)?.length, 1)
})

test('generated observer assets execute the actual recovery observation import graph', async t => {
  const root = await mkdtemp(join(tmpdir(), 'academy-root-observer-'))
  t.after(() => rm(root, {recursive:true,force:true}))
  for (const asset of OBSERVER_ASSETS) {
    const target=join(root,asset.name)
    await copyFile(asset.source,target)
    await chmod(target,asset.mode)
    assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),asset.sha256)
  }
  const recovery=join(root,'academy-macos-release-recovery.mjs')
  const source=`import {observeAcademyReleaseState} from ${JSON.stringify(`file://${recovery}`)};
const value=await observeAcademyReleaseState({stage:${JSON.stringify(join(root,'absent-stage'))},readPointer:async()=>null,resolveCurrent:async()=>{throw new Error('unexpected')}});
if(value.publication!=='ABSENT'||value.installRequired!==true)process.exit(1)`
  const executed=spawnSync(join(root,'node'),['--input-type=module','-e',source],{encoding:'utf8'})
  assert.equal(executed.status,0,executed.stderr)

  await rm(join(root,'academy-release-manifest.mjs'))
  const missing=spawnSync(join(root,'node'),['--input-type=module','-e',source],{encoding:'utf8'})
  assert.notEqual(missing.status,0)
  assert.equal(await access(join(root,'academy-release-pointer.mjs')).then(()=>true,()=>false),true)
})

test('bound worker executor rejects symlink and path swap while retaining the executed inode', async t => {
  const root = await mkdtemp(join(tmpdir(), 'academy-bound-worker-'))
  t.after(() => rm(root, { recursive:true, force:true }))
  const worker = join(root, 'worker'), replacement = join(root, 'replacement'), marker = join(root, 'marker'), started = join(root, 'started')
  const bytes = Buffer.from(`#!/bin/zsh\n/bin/echo START > ${JSON.stringify(started)}\n/bin/sleep 0.15\n/bin/echo PASS > ${JSON.stringify(marker)}\n`)
  const digest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(worker, bytes, { mode:0o500 })
  const executor = new URL('./academy-bound-worker-executor.cjs', import.meta.url).pathname
  const identity=statSync(worker)
  const run = path => spawnSync(process.execPath, [executor, path, digest,
    String(identity.uid), String(identity.gid), String(0o500),join(root,'terminal.json')], { encoding:'utf8' })
  const linked = join(root, 'linked')
  await symlink(worker, linked)
  assert.equal(run(linked).stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=EXECUTOR_BINDING_REJECTED\n')
  await writeFile(replacement, bytes, { mode:0o500 })
  const swapper = spawn('/bin/zsh', ['-c', 'while [[ ! -f "$3" ]]; do /bin/sleep 0.01; done; /bin/mv "$1" "$2"', 'swap', replacement, worker, started])
  const swapped = run(worker)
  if (!await access(started).then(()=>true,()=>false)) swapper.kill('SIGTERM')
  await new Promise(resolve => swapper.once('close', resolve))
  assert.match(swapped.stdout,/reason=EXECUTOR_(?:BINDING|POSTCHECK)_REJECTED/)
  if (swapped.stdout.includes('POSTCHECK')) assert.equal(await readFile(marker, 'utf8'), 'PASS\n')
})

test('executor classifies spawn failure without relaying exception detail', async t => {
  const root=await mkdtemp(join(tmpdir(),'academy-executor-spawn-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const worker=join(root,'worker'), preload=join(root,'preload.cjs')
  const bytes=Buffer.from('#!/bin/zsh\n')
  await writeFile(worker,bytes,{mode:0o500})
  const identity=statSync(worker)
  await writeFile(preload,`const cp=require('child_process'),{EventEmitter}=require('events');cp.spawn=()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr.setEncoding=()=>{};queueMicrotask(()=>child.emit('error',new Error('secret spawn detail')));return child}`)
  const executed=spawnSync(process.execPath,[new URL('./academy-bound-worker-executor.cjs',import.meta.url).pathname,
    worker,createHash('sha256').update(bytes).digest('hex'),String(identity.uid),String(identity.gid),String(0o500),join(root,'terminal.json')],
    {encoding:'utf8',env:{...process.env,NODE_OPTIONS:`--require=${preload}`}})
  assert.equal(executed.stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=EXECUTOR_SPAWN_REJECTED\n')
  assert.equal(executed.stderr,'')
})

test('executor classifies a post-execution worker identity change', async t => {
  const root=await mkdtemp(join(tmpdir(),'academy-executor-postcheck-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const worker=join(root,'worker'), preload=join(root,'preload.cjs')
  const bytes=Buffer.from('#!/bin/zsh\nprint "ACADEMY_SINGLE_PROMPT_PREFLIGHT_PASS"\n')
  await writeFile(worker,bytes,{mode:0o500})
  const identity=statSync(worker)
  await writeFile(preload,`const fs=require('fs'),original=fs.lstatSync;let seen=0;fs.lstatSync=function(path,options){const value=original.call(this,path,options);if(path===process.env.ACADEMY_TEST_WORKER&&++seen===2)value.ino+=1n;return value}`)
  const executed=spawnSync(process.execPath,[new URL('./academy-bound-worker-executor.cjs',import.meta.url).pathname,
    worker,createHash('sha256').update(bytes).digest('hex'),String(identity.uid),String(identity.gid),String(0o500),join(root,'terminal.json')],
    {encoding:'utf8',env:{...process.env,NODE_OPTIONS:`--require=${preload}`,ACADEMY_TEST_WORKER:worker}})
  assert.equal(executed.stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=EXECUTOR_POSTCHECK_REJECTED\n')
  assert.equal(executed.stderr,'')
})

test('executor accepts only a fresh exact terminal receipt and suppresses malicious stderr', async t => {
  const root=await mkdtemp(join(tmpdir(),'academy-executor-receipt-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const executor=new URL('./academy-bound-worker-executor.cjs',import.meta.url).pathname
  const terminal=join(root,'terminal.json'), worker=join(root,'worker')
  const stale={schema:'academy-macos-root-preflight-terminal/v1',status:'FAILED',phase:'INSTALL_RELEASE',publication:'UNKNOWN',reason:'FOREIGN_STAGE'}
  await writeFile(terminal,`${JSON.stringify(stale)}\n`,{mode:0o600})
  const run = async bytes => {
    await chmod(worker,0o700).catch(()=>{})
    await writeFile(worker,bytes,{mode:0o500})
    await chmod(worker,0o500)
    const identity=statSync(worker)
    return spawnSync(process.execPath,[executor,worker,createHash('sha256').update(bytes).digest('hex'),
      String(identity.uid),String(identity.gid),String(0o500),terminal],{encoding:'utf8'})
  }
  const staleResult=await run(Buffer.from('#!/bin/zsh\nprint -u2 "token=secret"\nexit 1\n'))
  assert.equal(staleResult.stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=EXECUTOR_POSTCHECK_REJECTED\n')
  assert.equal(staleResult.stderr,'')

  const fresh={...stale,phase:'VERIFY_RELEASE',reason:'UNCLASSIFIED'}
  const script=`#!/bin/zsh\nprint -r -- '${JSON.stringify(fresh)}' > '${terminal}'\n/bin/chmod 600 '${terminal}'\nprint -u2 'untrusted raw detail'\nexit 1\n`
  const freshResult=await run(Buffer.from(script))
  assert.equal(freshResult.stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=WORKER_REJECTED phase=VERIFY_RELEASE publication=UNKNOWN worker_reason=UNCLASSIFIED\n')
  assert.equal(freshResult.stderr,'')
})

test('stale predecessor terminal does not erase one bounded early failure', async t => {
  const root=await mkdtemp(join(tmpdir(),'academy-executor-stale-predecessor-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const terminal=join(root,'terminal.json'), worker=join(root,'worker')
  const stale={status:'FAILED',phase:'INSTALL_RELEASE',publication:'UNKNOWN',cloudflare:'NONE'}
  await writeFile(terminal,`${JSON.stringify(stale)}\n`,{mode:0o600})
  const bytes=Buffer.from(`#!/bin/zsh\nprint -u2 'raw predecessor detail'\nprint -u2 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=INSTALL_RELEASE publication=UNKNOWN reason=DIAGNOSTIC_FAILED'\nexit 1\n`)
  await writeFile(worker,bytes,{mode:0o500})
  const identity=statSync(worker)
  const result=spawnSync(process.execPath,[
    new URL('./academy-bound-worker-executor.cjs',import.meta.url).pathname,worker,
    createHash('sha256').update(bytes).digest('hex'),String(identity.uid),String(identity.gid),
    String(0o500),terminal,
  ],{encoding:'utf8'})
  const envelope=parseDiagnosticEnvelope(result.stdout)
  assert.equal(result.status,0,result.stderr)
  assert.equal(result.stderr,'')
  assert.deepEqual(envelope,{status:'FAILED',reason:'WORKER_REJECTED',phase:'INSTALL_RELEASE',
    publication:'UNKNOWN',workerReason:'DIAGNOSTIC_FAILED'})
  assert.deepEqual(JSON.parse(await readFile(terminal,'utf8')),stale)
})

test('executor relays one exact bounded worker reason without raw stderr', async t => {
  const root=await mkdtemp(join(tmpdir(),'academy-executor-bounded-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const worker=join(root,'worker'), terminal=join(root,'terminal.json')
  const bytes=Buffer.from('#!/bin/zsh\nprint -u2 "raw secret"\nprint -u2 "ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=OBSERVE_RELEASE publication=UNKNOWN reason=UNCLASSIFIED"\nexit 1\n')
  await writeFile(worker,bytes,{mode:0o500})
  const identity=statSync(worker)
  const result=spawnSync(process.execPath,[new URL('./academy-bound-worker-executor.cjs',import.meta.url).pathname,
    worker,createHash('sha256').update(bytes).digest('hex'),String(identity.uid),String(identity.gid),String(0o500),terminal],{encoding:'utf8'})
  assert.equal(result.stdout,'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=WORKER_REJECTED phase=OBSERVE_RELEASE publication=UNKNOWN worker_reason=UNCLASSIFIED\n')
  assert.equal(result.stderr,'')
})

test('generated executor invocation survives hostile shell characters and reaches worker boundary', async t => {
  const root = await mkdtemp(join(tmpdir(), "academy-invoke-'\n"))
  t.after(() => rm(root, { recursive:true, force:true }))
  const marker = join(root, 'worker-reached'), worker = join(root, "worker-'\n.sh")
  const quotedMarker = `'${marker.replaceAll("'", `'"'"'`)}'`
  const bytes = Buffer.from(`#!/bin/zsh\n/bin/echo reached > ${quotedMarker}\n`)
  await writeFile(worker, bytes, { mode:0o500 })
  const identity=statSync(worker)
  const command = boundWorkerInvocation({ node:'/private/tmp/academy-release-sources-fa7/node',
    executor:new URL('./academy-bound-worker-executor.cjs', import.meta.url).pathname,
    worker, digest:createHash('sha256').update(bytes).digest('hex'),
    uid:identity.uid, gid:identity.gid, mode:0o500 })
  const result = spawnSync('/bin/zsh', ['-c', command], { encoding:'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(marker, 'utf8'), 'reached\n')
})

test('worker binds executable inputs and preserves foreign root state', async () => {
  const worker = await readFile(new URL('./academy-macos-root-preflight-worker.sh', import.meta.url), 'utf8')
  assert.match(worker, /verify_root_file "\$stage\/source\/node" 500 [a-f0-9]{64}/)
  assert.equal((worker.match(/verify_root_file "\$stage\/tooling\//g) ?? []).length, 6)
  assert.equal(worker.includes('academy-release-*.mjs'), false)
  assert.equal(worker.includes('"$db_source"/migrations/*.sql'), false)
  assert.match(worker, /\.academy-owned/)
  assert.match(worker, /set -o noclobber/)
  assert.match(worker, /whoami_tmp="\$stage\/whoami\.tmp"/)
  assert.match(worker, /trap '\/bin\/rm -f "\$whoami_tmp"' EXIT/)
  assert.match(worker, /if \[\[ -e "\$whoami" \|\| -L "\$whoami" \]\]; then\n  valid_whoami/)
  assert.match(worker, /\/bin\/ln "\$whoami_tmp" "\$whoami"/)
  assert.equal(worker.includes('mv "$whoami_tmp" "$whoami"'), false)
  for (const digest of [
    'add7fb419f608925afe2e87c78d6d6297153a12a4f34be793921abdbeced4805',
    'df3e746d5c3863a626c93993730ffec0c805a9d4b63f32883745592037edd8e0',
    'eff6bf92af29569cfac15201184a17f5cc201d8092a783866a0d973c3087f5c1',
    'f0322b64ab270dec8d73e663f0cc2017c0c91df0a558488bb70aa32232fa7cab',
    '14934b499d3cb1a27751c8e3552577b0aa5c55bd8c649e5f67187cea1155e94d',
    '5739f1257fa5a18419b8296236dc17f04d21e11ee491da1e85cca90d2f4beaf4',
    '48d916aa5ae8cac47c800d116ae1c9780580940788f4804c2208fc9f52583fe0',
  ]) assert.match(worker, new RegExp(digest))
})

test('empty PATH utility oracle resolves every root command and reaches one mocked OAuth boundary', async () => {
  const workerUrl = new URL('./academy-macos-root-preflight-worker.sh', import.meta.url)
  const worker = await readFile(workerUrl, 'utf8')
  const utilities = ['/usr/bin/id','/usr/bin/stat','/bin/cat','/bin/rm','/usr/bin/install','/bin/chmod',
    '/bin/cp','/usr/sbin/chown','/usr/bin/find','/usr/bin/shasum','/usr/bin/awk','/bin/ln']
  for (const utility of utilities) await access(utility, constants.X_OK)
  const syntax = spawnSync('/bin/zsh', ['-n', workerUrl.pathname], { env: { PATH: '' }, encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
  for (const bare of ['id','stat','cat','rm','install','chmod','cp','chown','find','shasum','awk','ln','mv','jq']) {
    assert.doesNotMatch(worker, new RegExp(`^\\s*${bare}(?=\\s)`, 'm'))
  }
  assert.equal((worker.match(/wrangler\.js" login/g) ?? []).length, 1)
  assert.equal((worker.match(/wrangler\.js" whoami/g) ?? []).length, 1)
  assert.ok(worker.indexOf('verify_root_file "$stage/source/node"') < worker.indexOf('wrangler.js" login'))
})

test('recovery package binding and sanitized terminal phases are exact', async () => {
  const worker = await readFile(new URL('./academy-macos-root-preflight-worker.sh', import.meta.url), 'utf8')
  const input = JSON.parse(await readFile('/private/tmp/academy-release-package-fa7.json', 'utf8'))
  const old = '/private/tmp/academy-release-sources-fa7'
  const next = '/private/var/root/academy-release-recovery-7dca6452/source'
  const walk = value => typeof value === 'string' ? value.split(old).join(next)
    : Array.isArray(value) ? value.map(walk)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,walk(item)])) : value
  const digest = createHash('sha256').update(`${JSON.stringify(walk(input))}\n`).digest('hex')
  assert.equal(digest, '39767520f14a070d4a840cdb178789efe6d9e37060725ad6f6a3f9f81d27ab3a')
  for (const phase of ['OBSERVE_RELEASE','CLEANUP_STAGE','PREPARE_PACKAGE','RENDER_RELEASE','INSTALL_RELEASE','VERIFY_RELEASE','REOBSERVE_RELEASE','STAGE_DATABASE','AUTHENTICATE_CLOUDFLARE','COMPLETE']) {
    assert.match(worker, new RegExp(`phase=${phase}`))
  }
  assert.equal(worker.includes('"path"'), false)
  assert.equal(worker.includes('"error"'), false)
  assert.match(worker, /terminal_ready=false/)
  assert.match(worker, /if \$terminal_ready; then/)
  assert.ok(worker.indexOf('terminal_ready=true') > worker.indexOf("academy-root-preflight/7dca6452\\n"))
  const observationIndex = worker.indexOf('academy-macos-release-recovery.mjs" "$observation"')
  const cleanupIndex = worker.indexOf('phase=CLEANUP_STAGE')
  assert.ok(observationIndex >= 0 && cleanupIndex > observationIndex)
  assert.ok(worker.indexOf('phase=CLEANUP_STAGE') < worker.indexOf('/bin/rm -rf "$stage"'))
  assert.match(worker, /if \[\[ "\$install_required" == true \]\]; then/)
  assert.equal((worker.match(/academy-release-cli\.mjs" install/g) ?? []).length, 1)
  assert.match(worker, /\[\[ "\$reason" != FOREIGN_TARGET && "\$reason" != FOREIGN_STAGE \]\]/)
  assert.ok(worker.indexOf('$reason" != FOREIGN_TARGET') < worker.indexOf('academy-release-cli.mjs" install'))
  assert.ok(worker.indexOf('phase=REOBSERVE_RELEASE') < worker.lastIndexOf('publication="$('))
})

test('real zsh error trap emits a bounded structured terminal receipt', async t => {
  const stage = await mkdtemp(join(tmpdir(), 'academy-trap-'))
  t.after(() => rm(stage, { recursive:true, force:true }))
  const worker = await readFile(new URL('./academy-macos-root-preflight-worker.sh', import.meta.url), 'utf8')
  const start = worker.indexOf('TRAPZERR() {')
  const end = worker.indexOf('\n}\n\nphase=OBSERVE_RELEASE', start) + 2
  assert.ok(start >= 0 && end > start)
  const trapFunction = worker.slice(start, end)
  const result = spawnSync('/bin/zsh', ['-c', `stage=$1; phase=TEST_PHASE; publication=UNKNOWN; reason=UNCLASSIFIED; terminal_ready=true\n${trapFunction}\nfalse`, 'oracle', stage],
    { env:{ PATH:'' }, encoding:'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=TEST_PHASE publication=UNKNOWN reason=UNCLASSIFIED\n')
  assert.deepEqual(JSON.parse(await readFile(join(stage, 'terminal.json'), 'utf8')), {
    schema:'academy-macos-root-preflight-terminal/v1', status:'FAILED', phase:'TEST_PHASE', publication:'UNKNOWN', reason:'UNCLASSIFIED',
  })
})
