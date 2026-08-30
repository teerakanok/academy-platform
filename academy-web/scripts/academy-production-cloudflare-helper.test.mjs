import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { executeAcademyCloudflareHelper, runWranglerJson, ACADEMY_INSTALLED_RELEASE_ROOT } from './academy-production-cloudflare-helper.mjs'
import { createAcademyReleaseFakeFilesystem } from './academy-release-fs-fake.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'

const D = 'a'.repeat(64)
const R = 'b'.repeat(40)
const CONFIG_NAMES = ['IDENTITY_ADAPTER','IDENTITY_RUNTIME_ENABLED','IDENTITY_RUNTIME_WIRED','IDENTITY_RELEASE_APPROVAL','IDENTITY_CODE_EXCHANGE_TIMEOUT_MS','IDENTITY_CLIENT_ASSERTION_KEY_ID','IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK','IDENTITY_RESULT_KEY_SET_DOCUMENT']
const deployment = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const common = ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',R,'--readiness',D,'--valid-until','2026-08-29T12:00:00Z']
const provider = [{ id: deployment, created_on: '2026-08-29T10:00:00Z', versions: [{ version_id: version, percentage: 100 }] }]
const options = { clock: () => Date.parse('2026-08-29T11:00:00Z'), run: async () => JSON.stringify(provider) }

test('legacy ambient env inputs are rejected explicitly, never silently ignored', async () => {
  for (const name of ['ACADEMY_PINNED_WRANGLER', 'ACADEMY_RELEASE_ROOT']) {
    await assert.rejects(executeAcademyCloudflareHelper(
      [...common,'--operation','inspect','--mode','discover-current','--journal',''],
      { ...options, env: { [name]: '/somewhere' } }))
  }
})

test('discovers only one exact 100 percent deployment', async () => {
  const value = await executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], options)
  assert.deepEqual(value, { deployments: provider })
})

test('reconcile remains fail-closed without provider recovery evidence', async () => {
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','reconcile','--journal',D], options))
})

test('residue fails closed until zero-traffic versions are inventoried', async () => {
  const args = [...common,'--operation','residue','--deployment',deployment,'--version',version]
  await assert.rejects(executeAcademyCloudflareHelper(args, options))
})

test('residue binds an exact count-only version inventory', async () => {
  const args = [...common,'--operation','residue','--deployment',deployment,'--version',version]
  const run = async request => request
    ? JSON.stringify([{id:version,metadata:{created_on:'2026-08-29T10:00:00Z'},annotations:{}},
      {id:'33333333-3333-4333-8333-333333333333',metadata:{created_on:'2026-08-29T10:01:00Z'},annotations:{}}])
    : JSON.stringify(provider)
  const value = await executeAcademyCloudflareHelper(args, { ...options, run })
  assert.equal(value.versionCount, 2)
  assert.equal(value.nonServingVersionCount, 1)
  assert.match(value.inventorySha256, /^[a-f0-9]{64}$/)
})

test('duplicate provider JSON is rejected before member collapse', async () => {
  const source = JSON.stringify(provider).replace(`"id":"${deployment}"`, `"id":"${deployment}","id":"${deployment}"`)
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], { ...options, run: async () => source }))
})

test('rejects expired authority and ambiguous arguments before provider execution', async () => {
  let calls = 0
  const run = async () => { calls += 1; return provider }
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--version',version], { clock: () => Date.parse('2026-08-29T12:00:00Z'), run }))
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','residue','--deployment',deployment,'--deployment',deployment,'--version',version], { ...options, run }))
  assert.equal(calls, 0)
})

async function executable(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'academy-cloudflare-helper-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'wrangler')
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 })
  await chmod(path, 0o700)
  return { root, path }
}

test('real runner returns raw JSON and drains quick success', async t => {
  const fixture = await executable(t, `printf '%s' '${JSON.stringify(provider)}'`)
  assert.equal(await runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 }), JSON.stringify(provider))
})

test('real runner kills and reaps a timed out process group with descendants', async t => {
  const pidPath = join(tmpdir(), `academy-helper-child-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const fixture = await executable(t, `sleep 30 & echo $! > '${pidPath}'; wait`)
  const execution = runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 })
  execution.catch(() => {})
  let pid
  const readyDeadline = Date.now() + 2_500
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  await assert.rejects(execution)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('real runner kills and reaps descendants after successful leader exit', async t => {
  const pidPath = join(tmpdir(), `academy-helper-success-descendant-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const fixture = await executable(t, `sleep 30 </dev/null >/dev/null 2>&1 & echo $! > '${pidPath}'; printf '%s' '${JSON.stringify(provider)}'; exit 0`)
  const execution = runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 })
  let helperFailure
  execution.catch(error => { helperFailure = error })
  let pid
  const readyDeadline = Date.now() + 2_500
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  await execution.catch(() => {})
  assert.ok(helperFailure instanceof Error)
  let gone = false
  const goneDeadline = Date.now() + 1_000
  while (Date.now() < goneDeadline) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') { gone = true; break }
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(gone, true)
})

test('real runner rejects oversized output and duplicate JSON', async t => {
  const oversized = await executable(t, `dd if=/dev/zero bs=1048577 count=1 2>/dev/null | tr '\\000' x`)
  await assert.rejects(runWranglerJson({ executable: oversized.path, cwd: oversized.root, deadlineMs: Date.now() + 2_000 }))
  const duplicate = await executable(t, `printf '%s' '[{"id":"${deployment}","id":"${deployment}","created_on":"2026-08-29T10:00:00Z","versions":[{"version_id":"${version}","percentage":100}]}]'`)
  const raw = await runWranglerJson({ executable: duplicate.path, cwd: duplicate.root, deadlineMs: Date.now() + 2_000 })
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','inspect','--mode','discover-current','--journal',''], { ...options, run: async () => raw }))
})

const pinnedOptions = { ...options }
delete pinnedOptions.run

async function pinnedReleaseEnvironment(tamper, includeApplication = true) {
  const env = createAcademyReleaseFakeFilesystem()
  await env.fs.mkdir('/source/wrangler/bin', { mode: 0o755, recursive: true })
  await env.fs.writeFileDirect('/source/node', Buffer.from('#!/fake/node\n'), 0o755)
  await env.fs.writeFileDirect('/source/wrangler/bin/wrangler', Buffer.from('// wrangler entrypoint\n'), 0o755)
  await env.fs.writeFileDirect('/source/wrangler/package.json', Buffer.from('{}'), 0o644)
  await env.fs.writeFileDirect('/source/helper.mjs', Buffer.from('// helper source\n'), 0o500)
  await env.fs.writeFileDirect('/source/worker.js', Buffer.from('// immutable worker bundle\n'), 0o444)
  await env.fs.writeFileDirect('/source/wrangler.jsonc', Buffer.from('{"main":"worker.js"}\n'), 0o444)
  const applicationHelpers = includeApplication ? [
    { sourcePath: '/source/worker.js', path: 'application/worker.js', mode: 0o444 },
    { sourcePath: '/source/wrangler.jsonc', path: 'application/wrangler.jsonc', mode: 0o444 },
  ] : []
  const { root, manifest } = await renderAcademyRelease({ spec: {
    releaseRevision: R,
    node: { sourcePath: '/source/node' },
    wrangler: { sourceDirectory: '/source/wrangler', entrypoint: 'bin/wrangler' },
    helpers: [
      { sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 },
      ...applicationHelpers,
    ],
  }, stagingRoot: '/staging/release', fs: env.fs, processLike: env.processLike })
  await env.fs.mkdir('/opt/academy', { mode: 0o755, recursive: true })
  await env.fs.mkdir('/private/var/lib/academy/wrangler', { mode: 0o700, recursive: true })
  await installAcademyRelease({ sourceRoot: root, installRoot: '/opt/academy',
    expectedReleaseSha256: manifest.releaseSha256, expectedReleaseRevision: R,
    now: new Date('2026-08-29T10:00:00.000Z'), fs: env.fs, processLike: env.processLike })
  if (tamper) await tamper(env, `/opt/academy/releases/${manifest.releaseSha256}`)
  return { env, root: `/opt/academy/releases/${manifest.releaseSha256}` }
}

const inspectArgs = [...common,'--operation','inspect','--mode','discover-current','--journal','']

const candidate = '33333333-3333-4333-8333-333333333333'
const activated = '44444444-4444-4444-8444-444444444444'
const versionInventory = (id, tag = '', message = '') => JSON.stringify([{ id, metadata:{ created_on:'2026-08-29T10:01:00Z' }, annotations:{ 'workers/tag':tag, 'workers/message':message } }])

test('candidate upload pins Wrangler and verifies exact provider annotations at zero traffic', async () => {
  const tag = `release-${R.slice(0,12)}`
  const config = 'd804036979c67055505c31f26fa78fcaed34a226d48d62d2329d598cf0d48e2c'
  const message = `s=${R.slice(0,12)};c=${config.slice(0,12)}`
  const calls = []
  const run = async args => {
    calls.push(args ?? ['deployments'])
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({id:candidate,resources:{bindings:CONFIG_NAMES.map(name=>({name,type:'secret_text'}))}})
    const listCount = calls.filter(call => call?.[1] === 'list').length
    return listCount === 1 ? versionInventory(version) : JSON.stringify([
      ...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, tag, message))])
  }
  const value = await executeAcademyCloudflareHelper([...common,'--operation','upload','--source',R,'--traffic','0'], { ...options, run })
  assert.equal(value.versionId, candidate)
  assert.equal(value.trafficPercentage, 0)
  assert.ok(calls.some(call => call?.includes('--strict') && call.includes('--keep-vars')))
  assert.equal(JSON.stringify(value).includes(message), false)
  assert.ok(calls.some(call => call?.[0] === 'versions' && call[1] === 'view' && call[2] === candidate))
})

test('live upload requires release-bound worker and config and uses a separate writable cwd', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  const calls = []
  const tag = `release-${R.slice(0,12)}`
  const message = 's=bbbbbbbbbbbb;c=d804036979c6'
  let lists = 0
  const runWrangler = async invocation => {
    calls.push(invocation)
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({id:candidate,resources:{bindings:CONFIG_NAMES.map(name=>({name,type:'secret_text'}))}})
    if (args[0] === 'versions' && args[1] === 'list') return lists++ === 0 ? versionInventory(version)
      : JSON.stringify([...JSON.parse(versionInventory(version)),...JSON.parse(versionInventory(candidate,tag,message))])
    throw new Error('unexpected invocation')
  }
  const value = await executeAcademyCloudflareHelper([...common,'--operation','upload','--source',R,'--traffic','0'],
    { ...pinnedOptions, fs:env.fs, processLike:env.processLike, installRoot:'/opt/academy', runWrangler })
  assert.equal(value.versionId,candidate)
  const upload = calls.find(call=>call.args.includes('upload'))
  assert.equal(upload.cwd,'/private/var/lib/academy/wrangler')
  assert.ok(upload.args.includes(`${root}/application/worker.js`))
  assert.ok(upload.args.includes(`${root}/application/wrangler.jsonc`))

  const missing = await pinnedReleaseEnvironment(undefined,false)
  let providerCalls=0
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,{...pinnedOptions,fs:missing.env.fs,processLike:missing.env.processLike,installRoot:'/opt/academy',runWrangler:async()=>{providerCalls+=1}}))
  assert.equal(providerCalls,0)
})

test('candidate upload rejects wrong Wrangler version and duplicate version JSON before mutation', async () => {
  let uploads = 0
  const wrong = async args => {
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.121.0\n'
    if (args[1] === 'upload') uploads += 1
    return versionInventory(version)
  }
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','upload','--source',R,'--traffic','0'], { ...options, run:wrong }))
  assert.equal(uploads, 0)
  const duplicate = async args => {
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    return `[{"id":"${version}","id":"${candidate}","metadata":{"created_on":"2026-08-29T10:01:00Z"},"annotations":{}}]`
  }
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','upload','--source',R,'--traffic','0'], { ...options, run:duplicate }))
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','upload','--source','c'.repeat(40),'--traffic','0'], { ...options, run:wrong }))
})

test('activation and rollback use optimistic exact pre/post conditions and disclose residual race', async () => {
  const nextProvider = [{ id: activated, created_on:'2026-08-29T10:02:00Z', versions:[{version_id:candidate,percentage:100}] }]
  let listings = 0; const calls = []
  const run = async args => { calls.push(args); if (!args || args[1] === 'list') return JSON.stringify(listings++ === 0 ? provider : nextProvider); return '' }
  const value = await executeAcademyCloudflareHelper([...common,'--operation','activate','--expected-deployment',deployment,'--expected-version',version,'--candidate',candidate,'--traffic','100'], { ...options, run })
  assert.equal(value.activeVersionId, candidate)
  assert.deepEqual(value.semantics, { concurrencyControl:'optimistic-precondition-and-postcondition', atomicProviderCas:false, residualRace:true })
  assert.ok(calls.some(call => call?.[0] === 'versions' && call[1] === 'deploy' && call[2] === `${candidate}@100`))
})

test('rollback verifies exact serving target after optimistic transition', async () => {
  const rollbackDeployment = '55555555-5555-4555-8555-555555555555'
  const activeProvider = [{ id:activated, created_on:'2026-08-29T10:02:00Z', versions:[{version_id:candidate,percentage:100}] }]
  const restoredProvider = [{ id:rollbackDeployment, created_on:'2026-08-29T10:03:00Z', versions:[{version_id:version,percentage:100}] }]
  let listings = 0
  const run = async args => (!args || args[1] === 'list') ? JSON.stringify(listings++ === 0 ? activeProvider : restoredProvider) : ''
  const value = await executeAcademyCloudflareHelper([...common,'--operation','rollback','--expected-deployment',activated,'--expected-version',candidate,'--target',version,'--prior',deployment], { ...options, run })
  assert.equal(value.status, 'ROLLED_BACK'); assert.equal(value.restoredVersionId, version); assert.equal(value.semantics.residualRace, true)
})

test('protected secret staging sends values only through stdin contract and returns names only', async t => {
  const root = await mkdtemp(join(tmpdir(), 'academy-secret-stage-')); t.after(() => rm(root,{recursive:true,force:true}))
  const path = join(await realpath(root),'bundle.json'); await writeFile(path, '{"ALPHA":"private-one","BETA":"private-two"}', { mode:0o600 })
  let extra
  const run = async (args, options) => { if (!args) return JSON.stringify(provider); extra = { ...options, args }; return '' }
  const value = await executeAcademyCloudflareHelper([...common,'--operation','secrets','--secrets-file',path,'--tag','release-test'], { ...options, run })
  assert.deepEqual(value.secretNames, ['ALPHA','BETA'])
  assert.equal(JSON.stringify(value).includes('private-'), false)
  assert.match(extra.stdin, /private-one/)
  assert.equal(extra.args?.includes('-'), false)
})

test('live path resolves the pointer release and executes only pinned node and wrangler entrypoint', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  let observed
  const runWrangler = async invocation => { observed = invocation; return JSON.stringify(provider) }
  const value = await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  assert.deepEqual(value, { deployments: provider })
  assert.equal(observed.executable, `${root}/node/bin/node`)
  assert.deepEqual(observed.args, [`${root}/wrangler/bin/wrangler`, 'deployments', 'list', '--name', 'cyberskills-academy', '--json'])
  assert.equal(observed.cwd, '/private/var/lib/academy/wrangler')
  // The runner receives a revalidation hook that must succeed pre-spawn.
  assert.equal(typeof observed.verify, 'function')
  await observed.verify()
})

test('helper binds --release to the pointer and manifest revision', async () => {
  const { env } = await pinnedReleaseEnvironment()
  let calls = 0
  const runWrangler = async () => { calls += 1; return JSON.stringify(provider) }
  const mismatched = [...common]
  mismatched[3] = 'c'.repeat(40)
  await assert.rejects(executeAcademyCloudflareHelper([...mismatched,'--operation','inspect','--mode','discover-current','--journal',''],
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler }))
  assert.equal(calls, 0)
})

test('helper refuses drifted release digests before provider execution', async () => {
  const { env, root } = await pinnedReleaseEnvironment(async (environment, releaseRoot) => {
    await environment.fs.chmod(`${releaseRoot}/wrangler`, 0o700)
    await environment.fs.writeFileDirect(`${releaseRoot}/wrangler/package.json`, Buffer.from('tampered\n'), 0o444)
    await environment.fs.chmod(`${releaseRoot}/wrangler`, 0o555)
  })
  let calls = 0
  const runWrangler = async () => { calls += 1 }
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler }))
  assert.equal(calls, 0)
})

test('pre-spawn revalidation closes the verify-to-spawn window', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  let observed
  const runWrangler = async invocation => { observed = invocation; return JSON.stringify(provider) }
  await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  // Simulate drift after planning but before spawn: revalidation must fail.
  await env.fs.chmod(`${root}/wrangler`, 0o700)
  await env.fs.writeFileDirect(`${root}/wrangler/package.json`, Buffer.from('substituted\n'), 0o444)
  await env.fs.chmod(`${root}/wrangler`, 0o555)
  await assert.rejects(observed.verify())
})

test('pre-spawn revalidation rejects a pointer switch even when the revision is unchanged', async () => {
  const { env } = await pinnedReleaseEnvironment()
  let observed
  await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy',
      runWrangler: async invocation => { observed = invocation; return JSON.stringify(provider) } })
  await env.fs.writeFileDirect('/source/wrangler/package.json', Buffer.from('{"changed":true}'), 0o644)
  const replacement = await renderAcademyRelease({ spec: {
    releaseRevision: R,
    node: { sourcePath: '/source/node' },
    wrangler: { sourceDirectory: '/source/wrangler', entrypoint: 'bin/wrangler' },
    helpers: [{ sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 }],
  }, stagingRoot: '/staging/replacement', fs: env.fs, processLike: env.processLike })
  await installAcademyRelease({ sourceRoot: replacement.root, installRoot: '/opt/academy',
    expectedReleaseSha256: replacement.manifest.releaseSha256, expectedReleaseRevision: R,
    now: new Date('2026-08-29T10:01:00.000Z'), fs: env.fs, processLike: env.processLike })
  await assert.rejects(observed.verify())
})

test('helper refuses to run without a pointer-published installed release', async () => {
  const env = createAcademyReleaseFakeFilesystem()
  await env.fs.mkdir('/not-a-release', { mode: 0o755, recursive: true })
  let calls = 0
  const runWrangler = async () => { calls += 1 }
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/not-a-release', runWrangler }))
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: ACADEMY_INSTALLED_RELEASE_ROOT, runWrangler }))
  assert.equal(calls, 0)
})

test('real runner invokes the verify hook immediately before spawn', async t => {
  const fixture = await executable(t, `printf '%s' '${JSON.stringify(provider)}'`)
  const order = []
  await runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000,
    verify: async () => { order.push('verify') } })
  assert.deepEqual(order, ['verify'])
  await assert.rejects(runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000,
    verify: async () => { order.push('verify-failed'); throw new Error('drifted') } }))
  assert.deepEqual(order, ['verify', 'verify-failed'])
})

test('full helper process drives fake Wrangler upload, list, activate and rollback without response injection', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'academy-helper-cli-')))
  t.after(() => rm(root, { recursive:true, force:true }))
  const statePath = join(root, 'provider-state.json')
  const wranglerPath = join(root, 'fake-wrangler.mjs')
  const harnessPath = join(root, 'helper-harness.mjs')
  await writeFile(statePath, JSON.stringify({ deployment, version, serial:0, versions:[{id:version,tag:'',message:''}] }), { mode:0o600 })
  await writeFile(wranglerPath, `#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs'
const path=${JSON.stringify(statePath)}, args=process.argv.slice(2), state=JSON.parse(readFileSync(path,'utf8'))
const save=()=>writeFileSync(path,JSON.stringify(state))
if(args[0]==='--version') process.stdout.write('4.120.0\\n')
else if(args[0]==='deployments'&&args[1]==='list') process.stdout.write(JSON.stringify([{id:state.deployment,created_on:'2026-08-29T10:00:00Z',versions:[{version_id:state.version,percentage:100}]}]))
else if(args[0]==='versions'&&args[1]==='list') process.stdout.write(JSON.stringify(state.versions.map((v,i)=>({id:v.id,metadata:{created_on:'2026-08-29T10:0'+i+':00Z'},annotations:{'workers/tag':v.tag,'workers/message':v.message}}))))
else if(args[0]==='versions'&&args[1]==='view') process.stdout.write(JSON.stringify({id:args[2],resources:{bindings:${JSON.stringify(CONFIG_NAMES)}.map(name=>({name,type:'secret_text'}))}}))
else if(args[0]==='versions'&&args[1]==='upload'){const tag=args[args.indexOf('--tag')+1],message=args[args.indexOf('--message')+1];state.versions.push({id:${JSON.stringify(candidate)},tag,message});save();process.stdout.write('uploaded\\n')}
else if(args[0]==='versions'&&args[1]==='deploy'){state.serial++;state.version=args[2].split('@')[0];state.deployment=['${activated}','55555555-5555-4555-8555-555555555555'][state.serial-1];save();process.stdout.write('deployed\\n')}
else process.exit(2)
`, { mode:0o700 })
  const helperUrl = new URL('./academy-production-cloudflare-helper.mjs', import.meta.url).href
  await writeFile(harnessPath, `import {executeAcademyCloudflareHelper} from ${JSON.stringify(helperUrl)}
const root=${JSON.stringify(root)}, validUntil=Date.parse('2026-08-29T12:00:00Z')
executeAcademyCloudflareHelper(JSON.parse(process.argv[2]),{clock:()=>Date.parse('2026-08-29T11:00:00Z'),env:{},workRoot:root,release:{root,nodeExecutable:process.execPath,wranglerEntrypoint:${JSON.stringify(wranglerPath)},manifest:{releaseRevision:${JSON.stringify(R)},entries:[{path:'application/worker.js'},{path:'application/wrangler.jsonc'}]}},revalidate:async()=>{}}).then(v=>process.stdout.write(JSON.stringify(v)+'\\n')).catch(()=>process.exit(1))
`, { mode:0o600 })
  const invoke = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [harnessPath, JSON.stringify(args)], { cwd:root, stdio:['ignore','pipe','pipe'] })
    const stdout=[]; child.stdout.on('data', chunk=>stdout.push(chunk)); child.once('error',reject)
    child.once('close', code=>code===0 ? resolve(JSON.parse(Buffer.concat(stdout))) : reject(new Error('helper process failed')))
  })
  const uploaded = await invoke([...common,'--operation','upload','--source',R,'--traffic','0'])
  assert.equal(uploaded.versionId, candidate)
  const promoted = await invoke([...common,'--operation','activate','--expected-deployment',deployment,'--expected-version',version,'--candidate',candidate,'--traffic','100'])
  assert.equal(promoted.deploymentId, activated); assert.equal(promoted.semantics.residualRace, true)
  const rolledBack = await invoke([...common,'--operation','rollback','--expected-deployment',activated,'--expected-version',candidate,'--target',version,'--prior',deployment])
  assert.equal(rolledBack.restoredVersionId, version); assert.equal(rolledBack.semantics.atomicProviderCas, false)
  const finalState = JSON.parse(await readFile(statePath,'utf8'))
  assert.equal(finalState.version, version); assert.equal(finalState.versions.length, 2)
})
