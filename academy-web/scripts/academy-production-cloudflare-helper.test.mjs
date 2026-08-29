import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { executeAcademyCloudflareHelper, runWranglerJson, ACADEMY_INSTALLED_RELEASE_ROOT } from './academy-production-cloudflare-helper.mjs'
import { createAcademyReleaseFakeFilesystem } from './academy-release-fs-fake.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'

const D = 'a'.repeat(64)
const R = 'b'.repeat(40)
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

async function pinnedReleaseEnvironment(tamper) {
  const env = createAcademyReleaseFakeFilesystem()
  await env.fs.mkdir('/source/wrangler/bin', { mode: 0o755, recursive: true })
  await env.fs.writeFileDirect('/source/node', Buffer.from('#!/fake/node\n'), 0o755)
  await env.fs.writeFileDirect('/source/wrangler/bin/wrangler', Buffer.from('// wrangler entrypoint\n'), 0o755)
  await env.fs.writeFileDirect('/source/wrangler/package.json', Buffer.from('{}'), 0o644)
  await env.fs.writeFileDirect('/source/helper.mjs', Buffer.from('// helper source\n'), 0o500)
  const { root, manifest } = await renderAcademyRelease({ spec: {
    releaseRevision: R,
    node: { sourcePath: '/source/node' },
    wrangler: { sourceDirectory: '/source/wrangler', entrypoint: 'bin/wrangler' },
    helpers: [{ sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 }],
  }, stagingRoot: '/staging/release', fs: env.fs, processLike: env.processLike })
  await env.fs.mkdir('/opt/academy', { mode: 0o755, recursive: true })
  await installAcademyRelease({ sourceRoot: root, installRoot: '/opt/academy',
    expectedReleaseSha256: manifest.releaseSha256, expectedReleaseRevision: R,
    now: new Date('2026-08-29T10:00:00.000Z'), fs: env.fs, processLike: env.processLike })
  if (tamper) await tamper(env, `/opt/academy/releases/${manifest.releaseSha256}`)
  return { env, root: `/opt/academy/releases/${manifest.releaseSha256}` }
}

const inspectArgs = [...common,'--operation','inspect','--mode','discover-current','--journal','']

test('live path resolves the pointer release and executes only pinned node and wrangler entrypoint', async () => {
  const { env, root } = await pinnedReleaseEnvironment()
  let observed
  const runWrangler = async invocation => { observed = invocation; return JSON.stringify(provider) }
  const value = await executeAcademyCloudflareHelper(inspectArgs,
    { ...pinnedOptions, fs: env.fs, processLike: env.processLike, installRoot: '/opt/academy', runWrangler })
  assert.deepEqual(value, { deployments: provider })
  assert.equal(observed.executable, `${root}/node/bin/node`)
  assert.deepEqual(observed.args, [`${root}/wrangler/bin/wrangler`, 'deployments', 'list', '--name', 'cyberskills-academy', '--json'])
  assert.equal(observed.cwd, root)
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
