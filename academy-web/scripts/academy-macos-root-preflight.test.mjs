import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BOUND_WORKER_EXECUTOR, main, verifyWorker } from './academy-macos-root-preflight.mjs'

test('full remaining preflight has exactly one elevation prompt', async () => {
  const calls = []
  await main({ spawnProcess(executable, args, options) {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal(calls[0].args.filter(value => value.includes('with administrator privileges')).length, 1)
  assert.equal(calls[0].args.join(' ').includes('sudo'), false)
})

test('launcher binds exact worker bytes and repository contains one elevation site', async () => {
  await verifyWorker()
  const launcher = await readFile(new URL('./academy-macos-root-preflight.mjs', import.meta.url), 'utf8')
  assert.equal(launcher.match(/with administrator privileges/g)?.length, 1)
})

test('bound worker executor rejects symlink and path swap while retaining the executed inode', async t => {
  const root = await mkdtemp(join(tmpdir(), 'academy-bound-worker-'))
  t.after(() => rm(root, { recursive:true, force:true }))
  const worker = join(root, 'worker'), replacement = join(root, 'replacement'), marker = join(root, 'marker')
  const bytes = Buffer.from(`#!/bin/zsh\n/bin/sleep 0.15\n/bin/echo PASS > ${JSON.stringify(marker)}\n`)
  const digest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(worker, bytes, { mode:0o500 })
  const run = path => spawnSync(process.execPath, ['-e', BOUND_WORKER_EXECUTOR, path, digest,
    String(process.getuid()), String(process.getgid()), String(0o500)], { encoding:'utf8' })
  const linked = join(root, 'linked')
  await symlink(worker, linked)
  assert.notEqual(run(linked).status, 0)
  await writeFile(replacement, bytes, { mode:0o500 })
  const swapper = spawn('/bin/zsh', ['-c', '/bin/sleep 0.05; /bin/mv "$1" "$2"', 'swap', replacement, worker])
  const swapped = run(worker)
  await new Promise(resolve => swapper.once('close', resolve))
  assert.notEqual(swapped.status, 0)
  assert.equal(await readFile(marker, 'utf8'), 'PASS\n')
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
  const result = spawnSync('/bin/zsh', ['-c', `stage=$1; phase=TEST_PHASE; publication=UNKNOWN; terminal_ready=true\n${trapFunction}\nfalse`, 'oracle', stage],
    { env:{ PATH:'' }, encoding:'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=TEST_PHASE publication=UNKNOWN\n')
  assert.deepEqual(JSON.parse(await readFile(join(stage, 'terminal.json'), 'utf8')), {
    schema:'academy-macos-root-preflight-terminal/v1', status:'FAILED', phase:'TEST_PHASE', publication:'UNKNOWN',
  })
})
