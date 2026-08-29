import assert from 'node:assert/strict'
import test from 'node:test'

import { createAcademyReleaseFakeFilesystem } from './academy-release-fs-fake.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'
import { verifyAcademyRelease } from './academy-release-manifest.mjs'

const REVISION_A = 'a'.repeat(40)
const REVISION_B = 'b'.repeat(40)
const NODE = Buffer.from('#!/fake/node\nconst {} = require("node")\n')
const WRANGLER = Buffer.from('#!/fake/wrangler entrypoint\n')
const HELPER = Buffer.from('// academy production helper source\n')
const NOW = new Date('2026-08-29T10:00:00.000Z')

async function environment() {
  const env = createAcademyReleaseFakeFilesystem()
  await env.fs.mkdir('/source', { recursive: true })
  await env.fs.writeFileDirect('/source/node', NODE, 0o755)
  await env.fs.writeFileDirect('/source/wrangler', WRANGLER, 0o755)
  await env.fs.writeFileDirect('/source/helper.mjs', HELPER, 0o500)
  await env.fs.mkdir('/install', { mode: 0o755, recursive: true })
  return env
}

const spec = revision => ({
  releaseRevision: revision,
  node: { sourcePath: '/source/node', mode: 0o755 },
  wrangler: { sourcePath: '/source/wrangler', mode: 0o755 },
  helpers: [{ sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 }],
})

async function renderedSource(env, revision) {
  return renderAcademyRelease({ spec: spec(revision), stagingRoot: `/staging/${revision}`, fs: env.fs, processLike: env.processLike })
}

async function install(env, source) {
  return installAcademyRelease({ sourceRoot: source.root, installRoot: '/install', now: NOW, fs: env.fs, processLike: env.processLike })
}

test('renderer emits a canonical sorted manifest with pinned executable slots', async () => {
  const env = await environment()
  const { manifest } = await renderedSource(env, REVISION_A)
  assert.equal(manifest.schema, 'academy-release-manifest/v1')
  assert.equal(manifest.executables.node, 'node/bin/node')
  assert.equal(manifest.executables.wrangler, 'wrangler/bin/wrangler')
  assert.deepEqual(manifest.helpers, ['helpers/academy-production-cloudflare-helper.mjs'])
  assert.deepEqual(manifest.entries.map(entry => entry.path),
    ['helpers/academy-production-cloudflare-helper.mjs', 'node/bin/node', 'wrangler/bin/wrangler'])
  assert.ok(manifest.entries.every(entry => entry.nlink === 1 && entry.uid === env.fs.uid && entry.gid === env.fs.gid))
  const selfMeta = await env.fs.lstat(`/staging/${REVISION_A}/manifest.json`)
  assert.equal(selfMeta.mode & 0o777, 0o444)
  await verifyAcademyRelease({ root: `/staging/${REVISION_A}`, fs: env.fs, processLike: env.processLike })
})

test('fresh install publishes an immutable verified release with rollback authority', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const result = await install(env, source)
  assert.equal(result.status, 'INSTALLED')
  assert.equal(result.releaseSha256, source.manifest.releaseSha256)
  assert.equal(result.previousReleaseSha256, null)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  const verified = await verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike })
  assert.equal(verified.nodeExecutable, `${target}/node/bin/node`)
  const authority = JSON.parse(await env.fs.open('/install/rollback-authority.json', 'r').then(handle => handle.readFile('utf8')))
  assert.deepEqual(authority, { schema: 'academy-release-rollback-authority/v1',
    releaseSha256: source.manifest.releaseSha256, previousReleaseSha256: null, installedAt: '2026-08-29T10:00:00.000Z' })
  for (const entry of source.manifest.entries) assert.ok(env.fs.syncLog.some(path => path.endsWith(`/${entry.path}`) && path.includes('.stage-')))
  for (const directory of [target, '/install/releases', '/install']) assert.ok(env.fs.syncLog.includes(directory))
})

test('exact retry is idempotent and performs no writes', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const writes = env.fs.writeLog.length
  const result = await install(env, source)
  assert.equal(result.status, 'IDEMPOTENT')
  assert.equal(env.fs.writeLog.length, writes)
  await verifyAcademyRelease({ root: `/install/releases/${source.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
})

test('foreign target state is rejected without repair', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.mkdir(target, { recursive: true })
  await env.fs.writeFileDirect(`${target}/manifest.json`, '{}\n', 0o444)
  await assert.rejects(install(env, source))
})

test('hash drift in an installed release fails closed and is never overwritten', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.writeFileDirect(`${target}/wrangler/bin/wrangler`, Buffer.from('tampered\n'), 0o755)
  await assert.rejects(install(env, source))
  assert.equal((await env.fs.readNode(`${target}/wrangler/bin/wrangler`)).data.toString(), 'tampered\n')
})

test('mode drift in an installed release fails closed', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(`${target}/node/bin/node`, 0o644)
  await assert.rejects(install(env, source))
})

test('hardlink and symlink drift are rejected before provider trust', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  const second = await renderedSource(env, REVISION_B)
  await install(env, second)
  await env.fs.link(`${target}/node/bin/node`, '/install/extra-node')
  await assert.rejects(verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike }))
  await env.fs.rm('/install/extra-node')
  const targetB = `/install/releases/${second.manifest.releaseSha256}`
  await env.fs.rm(`${targetB}/wrangler/bin/wrangler`)
  await env.fs.symlink(`${target}/node/bin/node`, `${targetB}/wrangler/bin/wrangler`)
  await assert.rejects(verifyAcademyRelease({ root: targetB, fs: env.fs, processLike: env.processLike }))
})

test('interrupted publication is recoverable and preserves the prior release', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  const target = `/install/releases/${second.manifest.releaseSha256}`
  await env.fs.mkdir('/install/releases/.stage-999-0', { recursive: true })
  await env.fs.writeFileDirect('/install/releases/.stage-999-0/junk', Buffer.from('junk'), 0o600)
  await env.fs.mkdir(target, { recursive: true })
  const result = await install(env, second)
  assert.equal(result.status, 'INSTALLED')
  await verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike })
  await verifyAcademyRelease({ root: `/install/releases/${first.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
  const authority = JSON.parse(await env.fs.open('/install/rollback-authority.json', 'r').then(handle => handle.readFile('utf8')))
  assert.equal(authority.releaseSha256, second.manifest.releaseSha256)
  assert.equal(authority.previousReleaseSha256, first.manifest.releaseSha256)
})

test('rollback authority retains the exact prior release after a newer install', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  const result = await install(env, second)
  assert.equal(result.status, 'INSTALLED')
  assert.equal(result.previousReleaseSha256, first.manifest.releaseSha256)
  await verifyAcademyRelease({ root: `/install/releases/${first.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
  await verifyAcademyRelease({ root: `/install/releases/${second.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
})

test('extra foreign entries inside a release are rejected by exact tree walk', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.writeFileDirect(`${target}/helpers/foreign.mjs`, Buffer.from('x'), 0o400)
  await assert.rejects(install(env, source))
})
