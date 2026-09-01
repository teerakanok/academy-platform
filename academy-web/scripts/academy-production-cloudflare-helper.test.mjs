import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test, { after } from 'node:test'

import { executeAcademyCloudflareHelper, runWranglerJson, ACADEMY_INSTALLED_RELEASE_ROOT } from './academy-production-cloudflare-helper.mjs'
import { IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES } from './identity-production-activation-preflight.mjs'
import { createAcademyReleaseFakeFilesystem } from './academy-release-fs-fake.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'

const D = 'a'.repeat(64)
const R = 'b'.repeat(40)
const CONFIG_NAMES = ['IDENTITY_ADAPTER','IDENTITY_RUNTIME_ENABLED','IDENTITY_RUNTIME_WIRED','IDENTITY_RELEASE_APPROVAL','IDENTITY_CODE_EXCHANGE_TIMEOUT_MS','IDENTITY_CLIENT_ASSERTION_KEY_ID','IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK','IDENTITY_RESULT_KEY_SET_DOCUMENT','ASSETS','COURSE_MEDIA','EDGE_RATE_LIMITER','NEXT_PUBLIC_SEARCH_INDEXING']
const deployment = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const common = ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',R,'--readiness',D,'--valid-until','2026-08-29T12:00:00Z']
const provider = [{ id: deployment, created_on: '2026-08-29T10:00:00Z', versions: [{ version_id: version, percentage: 100 }] }]
const options = { clock: () => Date.parse('2026-08-29T11:00:00Z'), run: async () => JSON.stringify(provider) }
const bundleRoot = await mkdtemp(join(tmpdir(), 'academy-protected-bundle-'))
const bundlePath = join(bundleRoot, 'bundle.json')
const protectedBundleValue = 'private-test-secret-value'
await writeFile(bundlePath, JSON.stringify({ ACADEMY_TEST_SECRET: protectedBundleValue }), { mode: 0o600 })
const protectedBundlePath = await realpath(bundlePath)
const bundleSha256 = createHash('sha256').update(await readFile(protectedBundlePath)).digest('hex')
const uploadMessage = `s=${R};c=d901061aa65e;b=${bundleSha256}`
const legacyUploadMessage = 's=bbbbbbbbbbbb;c=d901061aa65e'
const upload = [...common, '--operation', 'upload', '--source', R, '--traffic', '0', '--secrets-file', protectedBundlePath]
after(() => rm(bundleRoot, { recursive: true, force: true }))

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

async function listAuthorityWorkspaces(env) {
  return (await env.fs.readdir('/private/var/lib/academy/wrangler'))
    .filter(entry => entry.startsWith(`application-${common[1]}-`))
    .sort()
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

test('real runner kills and reaps descendants after successful leader exit without failing the command', async t => {
  const pidPath = join(tmpdir(), `academy-helper-success-descendant-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const fixture = await executable(t, `sleep 30 </dev/null >/dev/null 2>&1 & echo $! > '${pidPath}'; printf '%s' '${JSON.stringify(provider)}'; exit 0`)
  const execution = runWranglerJson({ executable: fixture.path, cwd: fixture.root, deadlineMs: Date.now() + 2_000 })
  let pid
  const readyDeadline = Date.now() + 2_500
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  assert.equal(await execution, JSON.stringify(provider))
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
  await env.fs.mkdir('/source/node_modules/wrangler/bin', { mode: 0o755, recursive: true })
  await env.fs.writeFileDirect('/source/node', Buffer.from('#!/fake/node\n'), 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/bin/wrangler.js',
    Buffer.from('// wrangler entrypoint\n'), 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/package.json', Buffer.from('{}'), 0o644)
  await env.fs.writeFileDirect('/source/helper.mjs', Buffer.from('// helper source\n'), 0o500)
  await env.fs.mkdir('/source/application/.open-next/assets', { recursive: true })
  await env.fs.mkdir('/source/application/src', { recursive: true })
  await env.fs.mkdir('/source/application/worker', { recursive: true })
  await env.fs.writeFileDirect('/source/application/src/entry.js', Buffer.from('export {}\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/worker/object.js', Buffer.from('export {}\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/worker.js', Buffer.from('import "./chunk.js"\nexport { handler } from "./chunk.js"\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/worker.ts', Buffer.from('export { handler } from "./worker.js"\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/chunk.js', Buffer.from('export const handler = () => "academy"\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/wrangler.jsonc',
    Buffer.from('{"main":"worker.ts","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n'), 0o444)
  await env.fs.writeFileDirect('/source/application/.open-next/assets/asset.svg', Buffer.from('<svg/>\n'), 0o444)
  const { root, manifest } = await renderAcademyRelease({ spec: {
    releaseRevision: R,
    node: { sourcePath: '/source/node' },
    wrangler: { sourceDirectory: '/source/node_modules', entrypoint: 'wrangler/bin/wrangler.js' },
    application: { sourceDirectory: '/source/application' },
    helpers: [
      { sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 },
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
  const calls = []
  const run = async args => {
    calls.push(args ?? ['deployments'])
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({id:candidate,resources:{bindings:CONFIG_NAMES.map(name=>({name,type:'secret_text'}))}})
    const listCount = calls.filter(call => call?.[1] === 'list').length
    return listCount === 1 ? versionInventory(version) : JSON.stringify([
      ...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, tag, uploadMessage))])
  }
  const value = await executeAcademyCloudflareHelper(upload, { ...options, run })
  assert.equal(value.versionId, candidate)
  assert.equal(value.trafficPercentage, 0)
  const uploadCall = calls.find(call => call?.[0] === 'versions' && call?.[1] === 'upload')
  assert.ok(uploadCall.includes('--strict') && uploadCall.includes('--keep-vars'))
  assert.equal(uploadCall[uploadCall.indexOf('--secrets-file') + 1], protectedBundlePath)
  assert.equal(uploadCall[uploadCall.indexOf('--message') + 1], uploadMessage)
  assert.equal(JSON.stringify(value).includes(uploadMessage), false)
  assert.ok(calls.some(call => call?.[0] === 'versions' && call[1] === 'view' && call[2] === candidate))
})

test('upload rejects unprotected secret bundles before provider execution', async () => {
  let calls = 0
  const run = async () => { calls += 1; return JSON.stringify(provider) }
  const link = `${protectedBundlePath}-link`
  await symlink(protectedBundlePath, link)
  await assert.rejects(executeAcademyCloudflareHelper([...upload.slice(0, -1), link], { ...options, run }))
  await rm(link)
  await chmod(protectedBundlePath, 0o644)
  await assert.rejects(executeAcademyCloudflareHelper(upload, { ...options, run }))
  await chmod(protectedBundlePath, 0o600)
  await assert.rejects(executeAcademyCloudflareHelper([...upload.slice(0, -1), `${protectedBundlePath}-missing`], { ...options, run }))
  assert.equal(calls, 0)
})

test('upload rejects an old incomplete candidate and verifies complete Identity bindings', async () => {
  const oldCandidate = '77777777-7777-4777-8777-777777777777'
  let lists = 0
  const oldInventory = JSON.parse(versionInventory(oldCandidate, `release-${R.slice(0,12)}`, legacyUploadMessage)).at(0)
  const newInventory = JSON.parse(versionInventory(candidate, `release-${R.slice(0,12)}`, uploadMessage)).at(0)
  const run = async args => {
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return JSON.stringify(lists === 1 ? [...JSON.parse(versionInventory(version)), oldInventory]
        : [...JSON.parse(versionInventory(version)), oldInventory, newInventory])
    }
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload, { ...options, run })
  assert.equal(value.versionId, candidate)
})

test('upload fails closed if a production Identity binding is absent', async () => {
  const missing = IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES.at(-1)
  const bindings = CONFIG_NAMES.filter(name => name !== missing).map(name => ({ name, type: 'secret_text' }))
  let lists = 0
  const run = async args => {
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({ id: candidate, resources: { bindings } })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return JSON.stringify(lists === 1 ? JSON.parse(versionInventory(version))
        : [...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, `release-${R.slice(0,12)}`, uploadMessage))])
    }
    throw new Error('unexpected provider invocation')
  }
  await assert.rejects(executeAcademyCloudflareHelper(upload, { ...options, run }))
})

test('upload invocation and receipt do not contain protected bundle values', async () => {
  let lists = 0
  const calls = []
  const run = async args => {
    calls.push(args)
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return JSON.stringify(lists === 1 ? JSON.parse(versionInventory(version))
        : [...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, `release-${R.slice(0,12)}`, uploadMessage))])
    }
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload, { ...options, run })
  assert.equal(JSON.stringify([calls, value]).includes(protectedBundleValue), false)
  assert.equal(value.versionId, candidate)
})

test('live upload requires release-bound worker and config and uses a separate writable cwd', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  const calls = []
  const tag = `release-${R.slice(0,12)}`
  const message = uploadMessage
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
  const value = await executeAcademyCloudflareHelper(upload,
    { ...pinnedOptions, fs:env.fs, processLike:env.processLike, installRoot:'/opt/academy', runWrangler })
  assert.equal(value.versionId,candidate)
  const uploadCall = calls.find(call=>call.args.includes('upload'))
  const workspace = uploadCall.cwd
  assert.match(workspace, new RegExp(`/private/var/lib/academy/wrangler/application-${common[1]}-[a-f0-9]{12}$`))
  assert.equal(uploadCall.cwd,workspace)
  assert.equal(uploadCall.args.includes(`${root}/application/worker.js`), false)
  assert.equal(uploadCall.args.includes(`${root}/application/worker.ts`), false)
  assert.ok(uploadCall.args.includes(`${workspace}/application/wrangler.jsonc`))

  const missing = await pinnedReleaseEnvironment(undefined,false)
  let providerCalls=0
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,{...pinnedOptions,
    release:{root:missing.root,nodeExecutable:missing.env.fs.readNode('/source/node') ? '/source/node' : '/source/node',
      wranglerEntrypoint:'/source/node_modules/wrangler/bin/wrangler.js',manifest:{releaseRevision:R,entries:[]}},
    workRoot:'/private/var/lib/academy/wrangler',runWrangler:async()=>{providerCalls+=1}}))
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
  await assert.rejects(executeAcademyCloudflareHelper(upload, { ...options, run:wrong }))
  assert.equal(uploads, 0)
  const duplicate = async args => {
    if (!args) return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    return `[{"id":"${version}","id":"${candidate}","metadata":{"created_on":"2026-08-29T10:01:00Z"},"annotations":{}}]`
  }
  await assert.rejects(executeAcademyCloudflareHelper(upload, { ...options, run:duplicate }))
  await assert.rejects(executeAcademyCloudflareHelper([...common,'--operation','upload','--source','c'.repeat(40),'--traffic','0','--secrets-file',protectedBundlePath], { ...options, run:wrong }))
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
  let workspaceDuringProviderCall
  const runWrangler = async invocation => {
    observed = invocation
    await invocation.verify()
    workspaceDuringProviderCall = (await listAuthorityWorkspaces(env)).length === 1
    return JSON.stringify(provider)
  }
  const value = await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  assert.deepEqual(value, { deployments: provider })
  const workspace = observed.cwd
  assert.equal(observed.executable, `${root}/node/bin/node`)
  assert.deepEqual(observed.args, [
    `${root}/wrangler/node_modules/wrangler/bin/wrangler.js`,
    'deployments', 'list', '--name', 'cyberskills-academy', '--json',
  ])
  assert.equal(observed.cwd, workspace)
  // The runner receives a revalidation hook that must succeed pre-spawn.
  assert.equal(typeof observed.verify, 'function')
  assert.equal(workspaceDuringProviderCall, true)
})

test('successful projected invocation uses copied config and exact release links, then cleans', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  const observedList = []
  let lists = 0
  const tag = `release-${R.slice(0,12)}`
  const versionInventory = (id, versionTag = '', message = '') => JSON.stringify([{
    id, metadata: { created_on: '2026-08-29T10:01:00Z' },
    annotations: { 'workers/tag': versionTag, 'workers/message': message },
  }])
  const runWrangler = async invocation => {
    observedList.push(invocation)
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return lists === 1 ? versionInventory(version) : JSON.stringify([
        ...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, tag, uploadMessage)),
      ])
    }
    throw new Error('unexpected provider invocation')
  }
  await executeAcademyCloudflareHelper(upload,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  const workspace = observedList.find(call => call.args.includes('upload')).cwd
  const application = `${workspace}/application`
  const observed = observedList.find(call => call.args.includes('versions upload') || call.args.includes('upload'))
  assert.equal(observed.cwd, workspace)
  assert.deepEqual(observed.args.slice(0, 2), [
    `${root}/wrangler/node_modules/wrangler/bin/wrangler.js`,
    'versions',
  ])
  assert.ok(observed.args.includes(`${application}/wrangler.jsonc`))
  assert.equal(observed.args.includes(`${root}/application/wrangler.jsonc`), false)
  assert.equal(await env.fs.lstat(workspace).then(() => true, () => false), false)
})

test('multi-call upload recreates exact workspace after Wrangler residue in the shared cwd', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const tag = `release-${R.slice(0,12)}`
  let lists = 0
  let firstWorkspace
  const runWrangler = async invocation => {
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') {
      firstWorkspace = invocation.cwd
      await env.fs.writeFileDirect(`${firstWorkspace}/provider-cache.json`, Buffer.from('residue\n'), 0o600)
      return JSON.stringify(provider)
    }
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return lists === 1 ? versionInventory(version) : JSON.stringify([
        ...JSON.parse(versionInventory(version)), ...JSON.parse(versionInventory(candidate, tag, uploadMessage)),
      ])
    }
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  assert.equal(value.versionId, candidate)
  assert.equal(await env.fs.lstat(`${firstWorkspace}/provider-cache.json`).then(() => true, () => false), false)
  assert.equal(await env.fs.lstat(firstWorkspace).then(() => true, () => false), false)
})

test('upload reconciles delayed provider visibility after successful mutation', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const tag = `release-${R.slice(0,12)}`
  let lists = 0
  let now = Date.parse('2026-08-29T11:00:00Z')
  const runWrangler = async invocation => {
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      if (lists < 4) return versionInventory(version)
      return JSON.stringify([
        ...JSON.parse(versionInventory(version)),
        ...JSON.parse(versionInventory(candidate, tag, uploadMessage)),
      ])
    }
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload, {
    ...pinnedOptions,
    fs: env.fs,
    processLike: env.processLike,
    installRoot: '/opt/academy',
    clock: () => now,
    delay: async ms => { now += ms },
    runWrangler,
  })
  assert.equal(value.versionId, candidate)
  assert.equal(lists, 4)
})

test('upload fails closed when matching version remains ambiguous after mutation', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const tag = `release-${R.slice(0,12)}`
  const priorCandidate = '77777777-7777-4777-8777-777777777777'
  let now = Date.parse('2026-08-29T11:00:00Z')
  const inventory = JSON.stringify([
    ...JSON.parse(versionInventory(version)),
    ...JSON.parse(versionInventory(priorCandidate, tag, uploadMessage)),
  ])
  const runWrangler = async invocation => {
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') return 'uploaded\n'
    if (args[0] === 'versions' && args[1] === 'list') return inventory
    throw new Error('unexpected provider invocation')
  }
  await assert.rejects(executeAcademyCloudflareHelper(upload, {
    ...pinnedOptions,
    fs: env.fs,
    processLike: env.processLike,
    installRoot: '/opt/academy',
    clock: () => now,
    delay: async ms => { now += ms },
    runWrangler,
  }))
})

test('upload reconciles exact unique candidate when provider mutates then exits nonzero', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const tag = `release-${R.slice(0,12)}`
  let lists = 0
  const runWrangler = async invocation => {
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') throw new Error('wrangler exited nonzero after mutation')
    if (args[0] === 'versions' && args[1] === 'view') return JSON.stringify({
      id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) },
    })
    if (args[0] === 'versions' && args[1] === 'list') {
      lists += 1
      return lists === 1 ? versionInventory(version) : JSON.stringify([
        ...JSON.parse(versionInventory(version)),
        ...JSON.parse(versionInventory(candidate, tag, uploadMessage)),
      ])
    }
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload, {
    ...pinnedOptions,
    fs: env.fs,
    processLike: env.processLike,
    installRoot: '/opt/academy',
    runWrangler,
  })
  assert.equal(value.versionId, candidate)
  assert.equal(lists, 2)
})

test('upload retry reuses one exact pre-existing candidate and skips second mutation', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const tag = `release-${R.slice(0,12)}`
  let uploadCalls = 0
  let viewCalls = 0
  const runWrangler = async invocation => {
    await invocation.verify()
    const args = invocation.args.slice(1)
    if (args[0] === 'deployments') return JSON.stringify(provider)
    if (args[0] === '--version') return '4.120.0\n'
    if (args[0] === 'versions' && args[1] === 'upload') { uploadCalls += 1; return 'uploaded\n' }
    if (args[0] === 'versions' && args[1] === 'view') {
      viewCalls += 1
      return JSON.stringify({ id: candidate, resources: { bindings: CONFIG_NAMES.map(name => ({ name, type: 'secret_text' })) } })
    }
    if (args[0] === 'versions' && args[1] === 'list') return JSON.stringify([
      ...JSON.parse(versionInventory(version)),
      ...JSON.parse(versionInventory(candidate, tag, uploadMessage)),
    ])
    throw new Error('unexpected provider invocation')
  }
  const value = await executeAcademyCloudflareHelper(upload, {
    ...pinnedOptions,
    fs: env.fs,
    processLike: env.processLike,
    installRoot: '/opt/academy',
    runWrangler,
  })
  assert.equal(value.versionId, candidate)
  assert.equal(uploadCalls, 0)
  assert.equal(viewCalls, 1)
})

test('projected config and target drift are rejected before provider calls', async () => {
  for (const tamperConfig of [true, false]) {
    const { env } = await pinnedReleaseEnvironment()
    await env.fs.mkdir('/foreign', { mode: 0o700 })
    await env.fs.writeFileDirect('/foreign/config.jsonc', Buffer.from('{"main":"evil.js"}\n'), 0o600)
    await env.fs.mkdir('/private/var/lib/academy/wrangler/foreign-target', { mode: 0o700 })
    await env.fs.writeFileDirect('/private/var/lib/academy/wrangler/foreign-target/evil.js',
      Buffer.from('export {}\n'), 0o600)
    let stage = 0
    const revalidate = async () => {
      stage += 1
      if (stage !== 2) return
      const [workspace] = await listAuthorityWorkspaces(env)
      if (!workspace) throw new Error('workspace missing')
      const absoluteWorkspace = `/private/var/lib/academy/wrangler/${workspace}`
      const application = `${absoluteWorkspace}/application`
      if (tamperConfig) {
        await env.fs.rm(`${application}/wrangler.jsonc`)
        await env.fs.writeFileDirect(`${application}/wrangler.jsonc`, Buffer.from('{"main":"evil.js"}\n'), 0o600)
      } else {
        await env.fs.rm(`${application}/worker.ts`)
        await env.fs.symlink('/private/var/lib/academy/wrangler/foreign-target', `${application}/worker.ts`)
      }
    }
    let providerCalls = 0
    await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,
      { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy',
        release: undefined, revalidate,
        runWrangler: async invocation => { await invocation.verify(); providerCalls += 1 } }))
    assert.equal(providerCalls, 0)
  assert.equal(await env.fs.digestOf('/foreign/config.jsonc'),
    'bb450872ea93c37853bf39bb686417c7eb34d66d8f1bdf6ebbfc29571beac528')
  }
})

test('foreign sibling residue is preserved and does not block isolated helper workspaces', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const workspace = `/private/var/lib/academy/wrangler/application-${common[1]}-foreign`
  await env.fs.mkdir(workspace, { mode: 0o700 })
  await env.fs.writeFileDirect(`${workspace}/operator-owned.json`, Buffer.from('preserve\\n'), 0o600)
  let providerCalls = 0
  const value = await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy',
      runWrangler: async () => { providerCalls += 1; return JSON.stringify(provider) } })
  assert.equal(providerCalls, 1)
  assert.deepEqual(value, { deployments: provider })
  assert.equal(await env.fs.lstat(`${workspace}/operator-owned.json`).then(() => true, () => false), true)
})

test('operation failure preserves unrelated residue and removes only exact workspace', async () => {
  const { env } = await pinnedReleaseEnvironment()
  const workRoot = '/private/var/lib/academy/wrangler'
  await env.fs.mkdir(`${workRoot}/unrelated`, { mode: 0o700 })
  await env.fs.writeFileDirect(`${workRoot}/unrelated/evidence.json`, Buffer.from('keep\\n'), 0o600)
  await assert.rejects(executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy',
      runWrangler: async () => { throw new Error('provider failed') } }))
  assert.equal(await env.fs.lstat(`${workRoot}/unrelated/evidence.json`).then(() => true, () => false), true)
  assert.equal(await env.fs.lstat(`${workRoot}/application-${common[1]}`).then(() => true, () => false), false)
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
    await environment.fs.writeFileDirect(`${releaseRoot}/wrangler/node_modules/wrangler/package.json`,
      Buffer.from('tampered\n'), 0o444)
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
  await env.fs.writeFileDirect(`${root}/wrangler/node_modules/wrangler/package.json`,
    Buffer.from('substituted\n'), 0o444)
  await env.fs.chmod(`${root}/wrangler`, 0o555)
  await assert.rejects(observed.verify())
})

test('pre-spawn revalidation rejects a pointer switch even when the revision is unchanged', async () => {
  const { env } = await pinnedReleaseEnvironment()
  let observed
  await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy',
      runWrangler: async invocation => { observed = invocation; return JSON.stringify(provider) } })
  await env.fs.writeFileDirect('/source/node_modules/wrangler/package.json', Buffer.from('{"changed":true}'), 0o644)
  const replacement = await renderAcademyRelease({ spec: {
    releaseRevision: R,
    node: { sourcePath: '/source/node' },
    wrangler: { sourceDirectory: '/source/node_modules', entrypoint: 'wrangler/bin/wrangler.js' },
    application: { sourceDirectory: '/source/application' },
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
  const application = join(root, 'application')
  const applicationConfigBytes = Buffer.from('{"main":"worker.ts","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n')
  const applicationWorkerBytes = Buffer.from('export {}\n')
  await mkdir(join(application, '.open-next', 'assets'), { recursive: true, mode: 0o700 })
  await mkdir(join(application, 'src'), { recursive: true, mode: 0o700 })
  await mkdir(join(application, 'worker'), { recursive: true, mode: 0o700 })
  await writeFile(join(application, 'wrangler.jsonc'), applicationConfigBytes, { mode: 0o600 })
  await writeFile(join(application, 'worker.ts'), applicationWorkerBytes, { mode: 0o600 })
  const uid = process.getuid(); const gid = process.getgid()
  const entry = (path, bytes) => ({ path, sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length, mode: 0o444, uid, gid, nlink: 1 })
  const directory = path => ({ path, mode: 0o500, uid, gid })
  const manifest = {
    releaseRevision: R,
    entries: [
      entry('application/wrangler.jsonc', applicationConfigBytes),
      entry('application/worker.ts', applicationWorkerBytes),
    ],
    directories: [
      directory('application/.open-next'), directory('application/src'), directory('application/worker'),
    ],
  }
  const helperUrl = new URL('./academy-production-cloudflare-helper.mjs', import.meta.url).href
  await writeFile(harnessPath, `import {executeAcademyCloudflareHelper} from ${JSON.stringify(helperUrl)}
const root=${JSON.stringify(root)}, validUntil=Date.parse('2026-08-29T12:00:00Z')
executeAcademyCloudflareHelper(JSON.parse(process.argv[2]),{clock:()=>Date.parse('2026-08-29T11:00:00Z'),env:{},workRoot:root,release:{root,uid:${uid},gid:${gid},nodeExecutable:process.execPath,wranglerEntrypoint:${JSON.stringify(wranglerPath)},manifest:${JSON.stringify(manifest)}},revalidate:async()=>{}}).then(v=>process.stdout.write(JSON.stringify(v)+'\\n')).catch(()=>process.exit(1))
`, { mode:0o600 })
  const invoke = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [harnessPath, JSON.stringify(args)], { cwd:root, stdio:['ignore','pipe','pipe'] })
    const stdout=[]; child.stdout.on('data', chunk=>stdout.push(chunk)); child.once('error',reject)
    const stderr=[]; child.stderr.on('data', chunk=>stderr.push(chunk))
    child.once('close', code=>code===0 ? resolve(JSON.parse(Buffer.concat(stdout))) : reject(new Error(Buffer.concat(stderr).toString('utf8'))))
  })
  const uploaded = await invoke(upload)
  assert.equal(uploaded.versionId, candidate)
  const promoted = await invoke([...common,'--operation','activate','--expected-deployment',deployment,'--expected-version',version,'--candidate',candidate,'--traffic','100'])
  assert.equal(promoted.deploymentId, activated); assert.equal(promoted.semantics.residualRace, true)
  const rolledBack = await invoke([...common,'--operation','rollback','--expected-deployment',activated,'--expected-version',candidate,'--target',version,'--prior',deployment])
  assert.equal(rolledBack.restoredVersionId, version); assert.equal(rolledBack.semantics.atomicProviderCas, false)
  const finalState = JSON.parse(await readFile(statePath,'utf8'))
  assert.equal(finalState.version, version); assert.equal(finalState.versions.length, 2)
})
