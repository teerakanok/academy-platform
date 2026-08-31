import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import test from 'node:test'

import { createAcademyReleaseFakeFilesystem } from './academy-release-fs-fake.mjs'
import { renderAcademyRelease } from './academy-release-render.mjs'
import { diagnoseAcademyInstall, installAcademyRelease } from './academy-release-install.mjs'
import {
  ACADEMY_RELEASE_PREDECESSOR_MANIFEST_SCHEMA,
  computeAcademyReleaseSha256,
  isAcademyReleasePath,
  verifyAcademyRelease,
} from './academy-release-manifest.mjs'
import {
  readAcademyReleasePointer,
  resolveAcademyCurrentRelease,
  rollbackAcademyRelease,
  reconcileAcademyInstallResidue,
} from './academy-release-pointer.mjs'

const REVISION_A = 'a'.repeat(40)
const REVISION_B = 'b'.repeat(40)
const NODE = Buffer.from('#!/fake/node\nconst {} = require("node")\n')
const WRANGLER_ENTRY = Buffer.from('#!/fake/wrangler entrypoint\n')
const WRANGLER_DEP = Buffer.from('// deterministic runtime dependency\n')
const HELPER = Buffer.from('// academy production helper source\n')
const APPLICATION_ENTRY = Buffer.from('import "./chunk.js"\nexport { handler } from "./chunk.js"\n')
const APPLICATION_CHUNK = Buffer.from('export const handler = () => "academy"\n')
const APPLICATION_CONFIG = Buffer.from('{"main":"worker.js","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n')
const APPLICATION_ASSET = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>\n')
const NOW = new Date('2026-08-29T10:00:00.000Z')
const WRANGLER_ENTRYPOINT = 'wrangler/bin/wrangler.js'

async function environment({ uid = 1000, gid = 1000 } = {}) {
  const env = createAcademyReleaseFakeFilesystem({ uid, gid })
  await env.fs.mkdir('/source/node_modules/wrangler/bin', { recursive: true })
  await env.fs.writeFileDirect('/source/node', NODE, 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/bin/wrangler.js', WRANGLER_ENTRY, 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/package.json', WRANGLER_DEP, 0o644)
  await env.fs.writeFileDirect('/source/helper.mjs', HELPER, 0o500)
  await env.fs.mkdir('/source/application/.open-next/assets', { recursive: true })
  await env.fs.writeFileDirect('/source/application/worker.js', APPLICATION_ENTRY, 0o444)
  await env.fs.writeFileDirect('/source/application/chunk.js', APPLICATION_CHUNK, 0o444)
  await env.fs.writeFileDirect('/source/application/wrangler.jsonc', APPLICATION_CONFIG, 0o444)
  await env.fs.writeFileDirect('/source/application/.open-next/assets/asset.svg', APPLICATION_ASSET, 0o444)
  await env.fs.mkdir('/install', { mode: 0o755, recursive: true })
  return env
}

async function openNextEnvironment(options = {}) {
  const env = createAcademyReleaseFakeFilesystem()
  await env.fs.mkdir('/source/node_modules/wrangler/bin', { recursive: true })
  await env.fs.writeFileDirect('/source/node', NODE, 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/bin/wrangler.js', WRANGLER_ENTRY, 0o755)
  await env.fs.writeFileDirect('/source/node_modules/wrangler/package.json', WRANGLER_DEP, 0o644)
  await env.fs.writeFileDirect('/source/helper.mjs', HELPER, 0o500)
  await env.fs.mkdir('/source/application/.open-next/assets', { recursive: true })
  await env.fs.writeFileDirect('/source/application/worker.js', Buffer.from(
    'import "./.open-next/worker.js"\nexport { handler } from "./.open-next/worker.js"\n'), 0o444)
  if (!options.missingOpenNextEntry) {
    await env.fs.writeFileDirect('/source/application/.open-next/worker.js', Buffer.from([
      'const deceptiveSource = [',
      '  `import "./missing.js"`,',
      '  `import("./missing.js")`,',
      '  `require("./missing.js")`,',
      '  `from "missing-package"`,',
      '  `from "node:fake"`,',
      '  `from "cloudflare:workers/subpath"`',
      ']',
      'import "node:fs"',
      'import { DurableObject } from "cloudflare:workers"',
      'export const handler = () => "academy"',
    ].join('\n') + '\n'), 0o444)
  }
  await env.fs.writeFileDirect('/source/application/wrangler.jsonc', APPLICATION_CONFIG, 0o444)
  await env.fs.writeFileDirect('/source/application/.open-next/assets/asset.svg', APPLICATION_ASSET, 0o444)
  await env.fs.mkdir('/install', { mode: 0o755, recursive: true })
  return env
}

const spec = revision => ({
  releaseRevision: revision,
  node: { sourcePath: '/source/node' },
  wrangler: { sourceDirectory: '/source/node_modules', entrypoint: WRANGLER_ENTRYPOINT },
  application: { sourceDirectory: '/source/application' },
  helpers: [{ sourcePath: '/source/helper.mjs', path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 }],
})

async function renderedSource(env, revision) {
  return renderAcademyRelease({ spec: spec(revision), stagingRoot: `/staging/${revision}`, fs: env.fs, processLike: env.processLike })
}

async function install(env, source, overrides = {}) {
  return installAcademyRelease({ sourceRoot: source.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: source.manifest.releaseRevision,
    now: NOW, fs: env.fs, processLike: env.processLike, ...overrides })
}

const SOURCE_UID = 1000
const SOURCE_GID = 2000
const TARGET_UID = 0
const TARGET_GID = 100

async function readFileBytes(path, fs) {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { return await handle.readFile() } finally { await handle.close() }
}

async function v2Predecessor(env, source) {
  const manifest = { ...source.manifest, schema: ACADEMY_RELEASE_PREDECESSOR_MANIFEST_SCHEMA }
  manifest.releaseSha256 = computeAcademyReleaseSha256(manifest)
  const root = `/install/releases/${manifest.releaseSha256}`
  await env.fs.mkdir(root, { recursive: true, mode: 0o700 })
  await cloneRenderedSource(env, source, env, root)
  await env.fs.rm(`${root}/manifest.json`)
  await env.fs.writeFileDirect(`${root}/manifest.json`,
    Buffer.from(`${JSON.stringify(manifest)}\n`), 0o444)
  await env.fs.chown(root, manifest.entries[0].uid, manifest.entries[0].gid)
  await env.fs.writeFileDirect('/install/current.json', Buffer.from(`${JSON.stringify({
    schema: 'academy-release-pointer/v1', releaseSha256: manifest.releaseSha256,
    releaseRevision: source.manifest.releaseRevision, previousReleaseSha256: null,
    updatedAt: NOW.toISOString(),
  })}\n`), 0o400)
  return manifest
}

async function predecessorSnapshot(env, manifest) {
  const root = `/install/releases/${manifest.releaseSha256}`
  const files = [`${root}/manifest.json`,
    ...manifest.entries.map(entry => `${root}/${entry.path}`)]
  const directories = [root,
    ...manifest.directories.map(directory => `${root}/${directory.path}`)]
  return JSON.stringify({
    manifest: await readFileBytes(`${root}/manifest.json`, env.fs),
    files: await Promise.all(files.map(async path => ({
      path, data: await readFileBytes(path, env.fs), stat: await env.fs.lstat(path) }))),
    directories: await Promise.all(directories.map(async path => ({
      path, stat: await env.fs.lstat(path) }))),
  })
}

async function cloneRenderedSource(sourceEnvironment, source, targetEnvironment, targetRoot) {
  const manifestBytes = await (await sourceEnvironment.fs.open(`${source.root}/manifest.json`)).readFile()
  for (const directory of source.manifest.directories) {
    await targetEnvironment.fs.mkdir(`${targetRoot}/${directory.path}`, { recursive: true, mode: 0o700 })
    await targetEnvironment.fs.chmod(`${targetRoot}/${directory.path}`, directory.mode)
  }
  for (const entry of source.manifest.entries) {
    const bytes = await (await sourceEnvironment.fs.open(`${source.root}/${entry.path}`)).readFile()
    await targetEnvironment.fs.writeFileDirect(`${targetRoot}/${entry.path}`, bytes, entry.mode)
    await targetEnvironment.fs.chown(`${targetRoot}/${entry.path}`, entry.uid, entry.gid)
  }
  await targetEnvironment.fs.writeFileDirect(`${targetRoot}/manifest.json`, manifestBytes, 0o444)
  await targetEnvironment.fs.chown(`${targetRoot}/manifest.json`, SOURCE_UID, SOURCE_GID)
  for (const directory of source.manifest.directories) {
    await targetEnvironment.fs.chown(`${targetRoot}/${directory.path}`, directory.uid, directory.gid)
  }
  await targetEnvironment.fs.chown(targetRoot, SOURCE_UID, SOURCE_GID)
  await targetEnvironment.fs.chmod(targetRoot, 0o555)
  return { root: targetRoot, manifest: source.manifest }
}

const ownershipIndependentProjection = manifest => JSON.stringify({
  schema: manifest.schema, releaseRevision: manifest.releaseRevision,
  executables: manifest.executables, helpers: manifest.helpers,
  directories: manifest.directories.map(({ path, mode }) => ({ path, mode })),
  entries: manifest.entries.map(({ path, sha256, size, mode, nlink }) =>
    ({ path, sha256, size, mode, nlink })),
})

test('release identity is stable while source fstat ownership changes', async () => {
  const first = await environment({ uid: SOURCE_UID, gid: SOURCE_GID })
  const second = await environment({ uid: 3000, gid: 4000 })
  const firstSource = await renderedSource(first, REVISION_A)
  const secondSource = await renderedSource(second, REVISION_A)
  assert.equal(firstSource.manifest.releaseSha256, secondSource.manifest.releaseSha256)
  assert.equal(ownershipIndependentProjection(firstSource.manifest),
    ownershipIndependentProjection(secondSource.manifest))
  assert.equal(computeAcademyReleaseSha256(secondSource.manifest),
    firstSource.manifest.releaseSha256)
  assert.notEqual(firstSource.manifest.entries[0].uid, secondSource.manifest.entries[0].uid)
  assert.notEqual(firstSource.manifest.directories[0].gid, secondSource.manifest.directories[0].gid)
})

test('installer strictly verifies source and rebinds target fstat ownership', async () => {
  const sourceEnvironment = await environment({ uid: SOURCE_UID, gid: SOURCE_GID })
  const targetEnvironment = await environment({ uid: TARGET_UID, gid: TARGET_GID })
  const source = await renderedSource(sourceEnvironment, REVISION_A)
  const reviewed = await cloneRenderedSource(sourceEnvironment, source,
    targetEnvironment, '/reviewed-release')
  await verifyAcademyRelease({ root: reviewed.root, fs: targetEnvironment.fs,
    processLike: sourceEnvironment.processLike })
  const result = await installAcademyRelease({ sourceRoot: reviewed.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  assert.equal(result.status, 'INSTALLED')
  const target = `/install/releases/${source.manifest.releaseSha256}`
  const installed = await verifyAcademyRelease({ root: target,
    fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  assert.equal(installed.uid, TARGET_UID)
  assert.equal(installed.gid, TARGET_GID)
  assert.equal(installed.manifest.releaseSha256, source.manifest.releaseSha256)
  assert.equal(ownershipIndependentProjection(installed.manifest),
    ownershipIndependentProjection(source.manifest))
  assert.ok(installed.manifest.entries.every(entry => entry.uid === TARGET_UID && entry.gid === TARGET_GID))
  assert.ok(installed.manifest.directories.every(directory =>
    directory.uid === TARGET_UID && directory.gid === TARGET_GID))
})

test('setgid install target derives and rebinds its actual inherited gid', async () => {
  const sourceEnvironment = await environment({ uid: SOURCE_UID, gid: SOURCE_GID })
  const targetEnvironment = await environment({ uid: TARGET_UID, gid: 6000 })
  const source = await renderedSource(sourceEnvironment, REVISION_A)
  const reviewed = await cloneRenderedSource(sourceEnvironment, source,
    targetEnvironment, '/reviewed-release')
  await targetEnvironment.fs.chown('/install', TARGET_UID, TARGET_GID)
  await targetEnvironment.fs.chmod('/install', 0o2750)
  await installAcademyRelease({ sourceRoot: reviewed.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  const target = `/install/releases/${source.manifest.releaseSha256}`
  const installed = await verifyAcademyRelease({ root: target,
    fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  const releases = await targetEnvironment.fs.lstat('/install/releases')
  assert.equal(installed.uid, TARGET_UID)
  assert.equal((releases.mode & 0o777), 0o755)
  assert.equal(installed.gid, releases.gid)
  assert.ok(installed.manifest.entries.every(entry => entry.gid === releases.gid))
  assert.ok(installed.manifest.directories.every(directory => directory.gid === releases.gid))
})

test('different-ownership releases retain tamper rejection and immutable rollback', async () => {
  const sourceEnvironment = await environment({ uid: SOURCE_UID, gid: SOURCE_GID })
  const targetEnvironment = await environment({ uid: TARGET_UID, gid: TARGET_GID })
  const first = await renderedSource(sourceEnvironment, REVISION_A)
  const second = await renderedSource(sourceEnvironment, REVISION_B)
  const reviewedFirst = await cloneRenderedSource(sourceEnvironment, first,
    targetEnvironment, '/reviewed-first')
  await installAcademyRelease({ sourceRoot: reviewedFirst.root, installRoot: '/install',
    expectedReleaseSha256: first.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  const firstTarget = `/install/releases/${first.manifest.releaseSha256}`
  const tamperedPath = `${firstTarget}/wrangler/node_modules/wrangler/package.json`
  const originalBytes = await (await targetEnvironment.fs.open(tamperedPath)).readFile()
  await targetEnvironment.fs.chmod(`${firstTarget}/wrangler`, 0o700)
  await targetEnvironment.fs.writeFileDirect(tamperedPath, Buffer.from('tampered\n'), 0o444)
  await targetEnvironment.fs.chown(tamperedPath, TARGET_UID, TARGET_GID)
  await targetEnvironment.fs.chmod(`${firstTarget}/wrangler`, 0o555)
  await assert.rejects(installAcademyRelease({ sourceRoot: reviewedFirst.root, installRoot: '/install',
    expectedReleaseSha256: first.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: targetEnvironment.fs, processLike: targetEnvironment.processLike }))
  await targetEnvironment.fs.chmod(`${firstTarget}/wrangler`, 0o700)
  await targetEnvironment.fs.writeFileDirect(tamperedPath, originalBytes, 0o444)
  await targetEnvironment.fs.chown(tamperedPath, TARGET_UID, TARGET_GID)
  await targetEnvironment.fs.chmod(`${firstTarget}/wrangler`, 0o555)
  const reviewedSecond = await cloneRenderedSource(sourceEnvironment, second,
    targetEnvironment, '/reviewed-second')
  await installAcademyRelease({ sourceRoot: reviewedSecond.root, installRoot: '/install',
    expectedReleaseSha256: second.manifest.releaseSha256, expectedReleaseRevision: REVISION_B,
    now: NOW, fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  const rolled = await rollbackAcademyRelease({ installRoot: '/install', now: NOW,
    fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
  assert.equal(rolled.releaseSha256, first.manifest.releaseSha256)
  await verifyAcademyRelease({ root: firstTarget, fs: targetEnvironment.fs,
    processLike: targetEnvironment.processLike })
  await verifyAcademyRelease({ root: `/install/releases/${second.manifest.releaseSha256}`,
    fs: targetEnvironment.fs, processLike: targetEnvironment.processLike })
})

test('renderer emits a canonical sorted manifest with directories and pinned executable slots', async () => {
  const env = await environment()
  const { manifest } = await renderedSource(env, REVISION_A)
  assert.equal(manifest.schema, 'academy-release-manifest/v3')
  assert.equal(manifest.executables.node, 'node/bin/node')
  assert.equal(manifest.executables.wrangler, 'wrangler/node_modules/wrangler/bin/wrangler.js')
  assert.deepEqual(manifest.helpers, ['helpers/academy-production-cloudflare-helper.mjs'])
  assert.deepEqual(manifest.entries.map(entry => entry.path),
    ['application/.open-next/assets/asset.svg', 'application/chunk.js',
      'application/worker.js', 'application/wrangler.jsonc',
      'helpers/academy-production-cloudflare-helper.mjs', 'node/bin/node',
      'wrangler/node_modules/wrangler/bin/wrangler.js',
      'wrangler/node_modules/wrangler/package.json'])
  assert.deepEqual(manifest.directories.map(directory => directory.path),
    ['application', 'application/.open-next', 'application/.open-next/assets', 'helpers',
      'node', 'node/bin', 'wrangler', 'wrangler/node_modules', 'wrangler/node_modules/wrangler',
      'wrangler/node_modules/wrangler/bin'])
  assert.ok(manifest.directories.every(directory => directory.mode === 0o555
    && directory.uid === env.fs.uid && directory.gid === env.fs.gid))
  assert.ok(manifest.entries.every(entry => entry.nlink === 1 && entry.uid === env.fs.uid && entry.gid === env.fs.gid))
  assert.equal(manifest.entries.find(entry => entry.path ===
    'wrangler/node_modules/wrangler/bin/wrangler.js').mode, 0o555)
  assert.equal(manifest.entries.find(entry => entry.path ===
    'wrangler/node_modules/wrangler/package.json').mode, 0o444)
  const selfMeta = await env.fs.lstat(`/staging/${REVISION_A}/manifest.json`)
  assert.equal(selfMeta.mode & 0o777, 0o444)
  await verifyAcademyRelease({ root: `/staging/${REVISION_A}`, fs: env.fs, processLike: env.processLike })
})

test('renderer accepts inventoried OpenNext output without parsing generated source', async () => {
  const env = await openNextEnvironment()
  const { manifest } = await renderedSource(env, REVISION_A)
  assert.ok(manifest.entries.some(entry => entry.path === 'application/.open-next/worker.js'))
})

test('renderer rejects a missing imported OpenNext entry', async () => {
  const env = await openNextEnvironment({ missingOpenNextEntry: true })
  await assert.rejects(renderedSource(env, REVISION_A))
})

test('renderer rejects a missing authored relative import', async () => {
  const env = await openNextEnvironment()
  await env.fs.rm('/source/application/.open-next/worker.js')
  await env.fs.writeFileDirect('/source/application/worker.js', Buffer.from(
    'import "./chunk.js"\nexport { handler } from "./chunk.js"\n'), 0o444)
  await assert.rejects(renderedSource(env, REVISION_A))
})

test('renderer fails closed without canonical entrypoint, imports or assets', async () => {
  const env = await environment()
  const render = () => renderedSource(env, REVISION_A)
  await env.fs.rm('/source/application/chunk.js')
  await assert.rejects(render)
  await env.fs.writeFileDirect('/source/application/chunk.js', APPLICATION_CHUNK, 0o444)
  await env.fs.rm('/source/application/.open-next/assets/asset.svg')
  await assert.rejects(render)
  await env.fs.writeFileDirect('/source/application/.open-next/assets/asset.svg', APPLICATION_ASSET, 0o444)
  await env.fs.writeFileDirect('/source/application/wrangler.jsonc',
    Buffer.from('{"main":"missing.js","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n'), 0o444)
  await assert.rejects(render)
})

test('renderer accepts the exact Cloudflare Workers platform builtin', async () => {
  const env = await environment()
  await env.fs.writeFileDirect('/source/application/worker.js', Buffer.from(
    'import { deepEqual } from "node:assert"\n'
    + 'import { DurableObject } from "cloudflare:workers"\n'
    + 'import "./chunk.js"\nexport { handler } from "./chunk.js"\n'), 0o444)
  const { manifest } = await renderedSource(env, REVISION_B)
  assert.ok(manifest.entries.some(entry => entry.path === 'application/worker.js'))
})

test('renderer rejects non-allowlisted platform and missing imports', async () => {
  const env = await environment()
  const render = () => renderedSource(env, REVISION_B)
  for (const moduleSpecifier of [
    'node:fake',
    'cloudflare:worker',
    'cloudflare:workers/subpath',
    'cloudflare:workers?query',
    'https://example.invalid/worker',
    'missing-academy-package',
  ]) {
    await env.fs.writeFileDirect('/source/application/worker.js', Buffer.from(
      `import academyModule from "${moduleSpecifier}"\n`
      + 'export { handler } from "./chunk.js"\n'), 0o444)
    await assert.rejects(render)
    await env.fs.rm(`/staging/${REVISION_B}`, { recursive: true, force: true })
  }
})

test('renderer records actual fstat gid from a setgid parent, not the process gid', async () => {
  const env = createAcademyReleaseFakeFilesystem({ uid: 1000, gid: 1000 })
  await env.fs.mkdir('/setgid-source/node_modules/wrangler/bin', { mode: 0o2755, recursive: true })
  await env.fs.writeFileDirect('/setgid-source/node', NODE, 0o755)
  await env.fs.writeFileDirect('/setgid-source/node_modules/wrangler/bin/wrangler.js', WRANGLER_ENTRY, 0o755)
  await env.fs.writeFileDirect('/setgid-source/helper.mjs', HELPER, 0o500)
  await env.fs.mkdir('/setgid-source/application/.open-next/assets', { recursive: true })
  await env.fs.writeFileDirect('/setgid-source/application/worker.js', APPLICATION_ENTRY, 0o444)
  await env.fs.writeFileDirect('/setgid-source/application/chunk.js', APPLICATION_CHUNK, 0o444)
  await env.fs.writeFileDirect('/setgid-source/application/wrangler.jsonc', APPLICATION_CONFIG, 0o444)
  await env.fs.writeFileDirect('/setgid-source/application/.open-next/assets/asset.svg', APPLICATION_ASSET, 0o444)
  await env.fs.mkdir('/setgid-staging', { mode: 0o755, recursive: true })
  await env.fs.chown('/setgid-staging', 1000, 2000)
  await env.fs.chmod('/setgid-staging', 0o2755)
  const { root } = await renderAcademyRelease({ spec: {
    releaseRevision: REVISION_A,
    node: { sourcePath: '/setgid-source/node' },
    wrangler: { sourceDirectory: '/setgid-source/node_modules', entrypoint: WRANGLER_ENTRYPOINT },
    application: { sourceDirectory: '/setgid-source/application' },
    helpers: [{ sourcePath: '/setgid-source/helper.mjs', path: 'helpers/helper.mjs', mode: 0o500 }],
  }, stagingRoot: '/setgid-staging/release', fs: env.fs, processLike: env.processLike })
  // The setgid staging parent assigns its gid to every newly created inode.
  const parentGid = (await env.fs.lstat('/setgid-staging')).gid
  assert.notEqual(parentGid, env.processLike.getgid())
  assert.ok((await env.fs.lstat(`${root}/node/bin/node`)).gid === parentGid)
  const verified = await verifyAcademyRelease({ root, fs: env.fs, processLike: env.processLike })
  assert.ok(verified.manifest.entries.every(entry => entry.gid === parentGid))
  assert.ok(verified.manifest.directories.every(directory => directory.gid === parentGid))
})

test('wrangler source execute bits preserve native files and ordinary dependencies', async () => {
  const env = await environment()
  const nativeExecutable = Buffer.from('#!/fake/esbuild\n')
  const executableData = Buffer.from('{"executable":"because-mode-says-so"}\n')
  const ordinaryDependency = Buffer.from('// ordinary dependency\n')
  const ordinaryNativeName = Buffer.from('// mode, not filename, controls rendering\n')
  await env.fs.mkdir('/source/node_modules/@esbuild/darwin-arm64/bin', { recursive: true })
  await env.fs.mkdir('/source/node_modules/fake-package', { recursive: true })
  await env.fs.writeFileDirect(
    '/source/node_modules/@esbuild/darwin-arm64/bin/esbuild', nativeExecutable, 0o755)
  await env.fs.writeFileDirect(
    '/source/node_modules/fake-package/native-data', executableData, 0o700)
  await env.fs.writeFileDirect(
    '/source/node_modules/@esbuild/darwin-arm64/package.json', ordinaryDependency, 0o644)
  await env.fs.writeFileDirect(
    '/source/node_modules/workerd', ordinaryNativeName, 0o644)

  const { manifest, root } = await renderedSource(env, REVISION_A)
  const nativePath = 'wrangler/node_modules/@esbuild/darwin-arm64/bin/esbuild'
  assert.equal(manifest.entries.find(entry => entry.path === nativePath).mode, 0o555)
  assert.equal(
    manifest.entries.find(entry =>
      entry.path === 'wrangler/node_modules/fake-package/native-data').mode, 0o555)
  assert.equal(
    manifest.entries.find(entry =>
      entry.path === 'wrangler/node_modules/@esbuild/darwin-arm64/package.json').mode, 0o444)
  assert.equal(
    manifest.entries.find(entry =>
      entry.path === 'wrangler/node_modules/workerd').mode, 0o444)
  assert.equal((await env.fs.lstat(`${root}/${nativePath}`)).mode & 0o777, 0o555)
  await verifyAcademyRelease({ root, fs: env.fs, processLike: env.processLike })

  await installAcademyRelease({
    sourceRoot: root,
    installRoot: '/install',
    expectedReleaseSha256: manifest.releaseSha256,
    expectedReleaseRevision: manifest.releaseRevision,
    now: NOW,
    fs: env.fs,
    processLike: env.processLike,
  })
  const installed = `/install/releases/${manifest.releaseSha256}`
  await verifyAcademyRelease({ root: installed, fs: env.fs, processLike: env.processLike })
  assert.equal((await env.fs.lstat(`${installed}/${nativePath}`)).mode & 0o777, 0o555)
  assert.equal((await env.fs.lstat(`${installed}/wrangler/node_modules/workerd`)).mode & 0o777, 0o444)
})

test('renderer rejects a non-executable Wrangler entrypoint', async () => {
  const env = await environment()
  await env.fs.chmod('/source/node_modules/wrangler/bin/wrangler.js', 0o644)
  await assert.rejects(renderedSource(env, REVISION_A))
})

test('renderer rejects a wrangler source with a symlink or empty inventory', async () => {
  const env = await environment()
  await env.fs.symlink('/source/node', '/source/node_modules/linked-node')
  await assert.rejects(renderedSource(env, REVISION_A))
  await env.fs.rm('/source/node_modules/linked-node')
  await env.fs.mkdir('/source-empty/node_modules', { recursive: true })
  await env.fs.writeFileDirect('/source-empty/node', NODE, 0o755)
  await env.fs.writeFileDirect('/source-empty/helper.mjs', HELPER, 0o500)
  await env.fs.mkdir('/source-empty/application/.open-next/assets', { recursive: true })
  await env.fs.writeFileDirect('/source-empty/application/worker.js', APPLICATION_ENTRY, 0o444)
  await env.fs.writeFileDirect('/source-empty/application/chunk.js', APPLICATION_CHUNK, 0o444)
  await env.fs.writeFileDirect('/source-empty/application/wrangler.jsonc', APPLICATION_CONFIG, 0o444)
  await env.fs.writeFileDirect('/source-empty/application/.open-next/assets/asset.svg', APPLICATION_ASSET, 0o444)
  await assert.rejects(renderAcademyRelease({ spec: {
    releaseRevision: REVISION_A, node: { sourcePath: '/source-empty/node' },
    wrangler: { sourceDirectory: '/source-empty/node_modules', entrypoint: WRANGLER_ENTRYPOINT },
    application: { sourceDirectory: '/source-empty/application' },
    helpers: [{ sourcePath: '/source-empty/helper.mjs', path: 'helpers/helper.mjs', mode: 0o500 }],
  }, stagingRoot: '/staging-empty', fs: env.fs, processLike: env.processLike }))
})

test('release paths accept real package segments and reject traversal or unsafe names', () => {
  assert.equal(isAcademyReleasePath('application/.next/server/app/(site)/page.js'), true)
  assert.equal(isAcademyReleasePath('application/.build/cache/(localized)/courses/[slug]/[locale]/page.js'), true)
  assert.equal(isAcademyReleasePath('application/(site)/courses/[slug]/lessons/[nodeId]/page.js'), true)
  assert.equal(isAcademyReleasePath('application/(site)/course-media/[assetId]/route.js'), true)
  assert.equal(isAcademyReleasePath('application/(localized)/courses/[slug]/[locale]/page.js'), true)
  assert.equal(isAcademyReleasePath('node_modules/@cloudflare/workers-shared/dist/index.js'), true)
  assert.equal(isAcademyReleasePath('node_modules/.bin/wrangler'), true)
  assert.equal(isAcademyReleasePath('node_modules/unenv/dist/runtime/_internal/_shared.mjs'), true)
  assert.equal(isAcademyReleasePath('node_modules/wrangler/templates/__tests__/fixture.js'), true)
  const unsafe = ['', 'lib//index.js', './lib/index.js', '../lib/index.js',
    'lib/../lib/index.js', 'lib\\index.js', 'lib\u0007index.js', 'lib:index.js',
    'lib*.js', '.hidden/lib.js', '.next/../page.js', '@/index.js',
    '(site/../page.js', '(.hidden)/page.js', '[slug]/../page.js', '[..]/page.js',
    '[[slug]]/page.js', '[...slug]/page.js']
  for (const path of unsafe) assert.equal(isAcademyReleasePath(path), false, path)
})

test('canonical inventory handles siblings that sort differently from traversal', async () => {
  const env = await environment()
  await env.fs.mkdir('/source/node_modules/lib', { recursive: true })
  await env.fs.mkdir('/source/node_modules/wrangler-dist/cli', { recursive: true })
  await env.fs.writeFileDirect('/source/node_modules/lib-x.js', Buffer.from('sibling x\n'), 0o444)
  await env.fs.writeFileDirect('/source/node_modules/lib/index.js', Buffer.from('lib index\n'), 0o444)
  await env.fs.writeFileDirect('/source/node_modules/wrangler-dist/cli.js', Buffer.from('cli entry\n'), 0o444)
  await env.fs.writeFileDirect('/source/node_modules/wrangler-dist/cli/index.js', Buffer.from('cli module\n'), 0o444)
  await env.fs.mkdir('/source/node_modules/node_modules/@cloudflare/workers-shared/dist', { recursive: true })
  await env.fs.writeFileDirect('/source/node_modules/node_modules/@cloudflare/workers-shared/dist/index.js',
    Buffer.from('scoped dependency\n'), 0o444)
  await env.fs.mkdir('/source/node_modules/node_modules/.bin', { recursive: true })
  await env.fs.writeFileDirect('/source/node_modules/node_modules/.bin/wrangler', WRANGLER_ENTRY, 0o755)
  const { manifest, root } = await renderAcademyRelease({ spec: spec(REVISION_A),
    stagingRoot: `/staging/${REVISION_A}`, fs: env.fs, processLike: env.processLike })
  assert.deepEqual(manifest.entries.filter(entry => entry.path.startsWith('wrangler/')).map(entry => entry.path), [
    'wrangler/node_modules/lib-x.js',
    'wrangler/node_modules/lib/index.js',
    'wrangler/node_modules/node_modules/.bin/wrangler',
    'wrangler/node_modules/node_modules/@cloudflare/workers-shared/dist/index.js',
    'wrangler/node_modules/wrangler-dist/cli.js',
    'wrangler/node_modules/wrangler-dist/cli/index.js',
    'wrangler/node_modules/wrangler/bin/wrangler.js',
    'wrangler/node_modules/wrangler/package.json',
  ])
  await assert.doesNotReject(verifyAcademyRelease({ root, fs: env.fs, processLike: env.processLike }))
})

test('pinned wrangler keeps its entrypoint adjacent to sibling dependencies', async () => {
  const env = await environment()
  await env.fs.mkdir('/source/node_modules/esbuild/lib', { recursive: true })
  await env.fs.writeFileDirect('/source/node_modules/esbuild/package.json',
    Buffer.from('{"name":"esbuild"}\n'), 0o444)
  await env.fs.writeFileDirect('/source/node_modules/esbuild/lib/main.js',
    Buffer.from('module.exports = "sibling dependency"\n'), 0o444)
  const { manifest } = await renderedSource(env, REVISION_A)
  assert.deepEqual(manifest.entries.filter(entry => entry.path.startsWith('wrangler/')).map(entry => entry.path), [
    'wrangler/node_modules/esbuild/lib/main.js',
    'wrangler/node_modules/esbuild/package.json',
    'wrangler/node_modules/wrangler/bin/wrangler.js',
    'wrangler/node_modules/wrangler/package.json',
  ])
})

test('fresh install publishes an immutable verified release and switches the current pointer', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const result = await install(env, source)
  assert.equal(result.status, 'INSTALLED')
  assert.equal(result.releaseSha256, source.manifest.releaseSha256)
  assert.equal(result.releaseRevision, REVISION_A)
  assert.equal(result.previousReleaseSha256, null)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  const verified = await verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike })
  assert.equal(verified.nodeExecutable, `${target}/node/bin/node`)
  assert.equal(verified.wranglerEntrypoint,
    `${target}/wrangler/node_modules/wrangler/bin/wrangler.js`)
  const pointer = await readAcademyReleasePointer({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(pointer.schema, 'academy-release-pointer/v1')
  assert.equal(pointer.releaseSha256, source.manifest.releaseSha256)
  assert.equal(pointer.releaseRevision, REVISION_A)
  assert.equal(pointer.previousReleaseSha256, null)
  const resolved = await resolveAcademyCurrentRelease({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(resolved.release.root, target)
  const pointerMeta = await env.fs.lstat('/install/current.json')
  assert.equal(pointerMeta.mode & 0o777, 0o400)
  assert.equal(pointerMeta.nlink, 1)
  for (const entry of source.manifest.entries) assert.ok(env.fs.syncLog.some(path => path.endsWith(`/${entry.path}`) && path.includes('.stage-')))
  for (const directory of [target, '/install/releases', '/install']) assert.ok(env.fs.syncLog.includes(directory))
})

test('install diagnostic distinguishes exact candidate, verified crash window, and foreign target', async () => {
  const env=await environment(), source=await renderedSource(env,REVISION_A)
  const diagnose=()=>diagnoseAcademyInstall({sourceRoot:source.root,installRoot:'/install',
    expectedReleaseSha256:source.manifest.releaseSha256,expectedReleaseRevision:REVISION_A,
    fs:env.fs,processLike:env.processLike})
  assert.equal((await diagnose()).reason,'TARGET_ABSENT')
  await install(env,source)
  assert.equal((await diagnose()).reason,'EXACT_CANDIDATE')
  const target=`/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(target,0o700)
  assert.equal((await diagnose()).reason,'CRASH_WINDOW_0700')
  await env.fs.writeFileDirect(`${target}/foreign`,Buffer.from('foreign'),0o444)
  assert.equal((await diagnose()).reason,'FOREIGN_TARGET')
})

test('installer removes only an exact candidate-bound owned stage residue', async () => {
  const env=await environment(), source=await renderedSource(env,REVISION_A)
  const releases='/install/releases', owned=`${releases}/.stage-${source.manifest.releaseSha256}-owned`, foreign=`${releases}/.stage-foreign`
  await env.fs.mkdir(owned,{recursive:true,mode:0o700})
  await env.fs.writeFileDirect(`${owned}/.academy-install-owned`,Buffer.from(`${JSON.stringify({
    schema:'academy-release-install-stage/v1',releaseSha256:source.manifest.releaseSha256,releaseRevision:REVISION_A,
  })}\n`),0o400)
  assert.equal((await diagnoseAcademyInstall({sourceRoot:source.root,installRoot:'/install',
    expectedReleaseSha256:source.manifest.releaseSha256,expectedReleaseRevision:REVISION_A,
    fs:env.fs,processLike:env.processLike})).reason,'OWNED_STAGE_RECOVERABLE')
  await install(env,source)
  await assert.rejects(env.fs.lstat(owned))
  const next=await environment(), nextSource=await renderedSource(next,REVISION_A)
  await next.fs.mkdir(foreign,{recursive:true,mode:0o700})
  await next.fs.writeFileDirect(`${foreign}/unowned`,Buffer.from('retain'),0o400)
  await assert.rejects(install(next,nextSource))
  const retained=await next.fs.open(`${foreign}/unowned`,0)
  try { assert.equal((await retained.readFile()).toString(),'retain') } finally { await retained.close() }
})

test('empty exact-candidate directory is foreign and remains byte-for-byte absent of installer writes', async () => {
  const env=await environment(), source=await renderedSource(env,REVISION_A)
  const target=`/install/releases/${source.manifest.releaseSha256}`
  await env.fs.mkdir(target,{recursive:true,mode:0o700})
  assert.equal((await diagnoseAcademyInstall({sourceRoot:source.root,installRoot:'/install',
    expectedReleaseSha256:source.manifest.releaseSha256,expectedReleaseRevision:REVISION_A,
    fs:env.fs,processLike:env.processLike})).reason,'FOREIGN_TARGET')
  await assert.rejects(install(env,source))
  assert.deepEqual(await env.fs.readdir(target),[])
})

for (const order of ['owned-first','foreign-first']) test(`mixed stage residues ${order} preserve both`,async()=>{
  const env=await environment(),source=await renderedSource(env,REVISION_A),releases='/install/releases'
  const owned=`${releases}/.stage-${source.manifest.releaseSha256}-owned`,foreign=`${releases}/.stage-foreign`
  for(const path of order==='owned-first'?[owned,foreign]:[foreign,owned]) await env.fs.mkdir(path,{recursive:true,mode:0o700})
  await env.fs.writeFileDirect(`${owned}/.academy-install-owned`,Buffer.from(`${JSON.stringify({
    schema:'academy-release-install-stage/v1',releaseSha256:source.manifest.releaseSha256,releaseRevision:REVISION_A,
  })}\n`),0o400)
  await env.fs.writeFileDirect(`${foreign}/foreign`,Buffer.from('retain'),0o400)
  await assert.rejects(install(env,source))
  assert.ok((await env.fs.readdir(owned)).includes('.academy-install-owned'))
  assert.deepEqual(await env.fs.readdir(foreign),['foreign'])
})

test('installer rejects an external digest or revision mismatch', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await assert.rejects(install(env, source, { expectedReleaseSha256: 'c'.repeat(64) }))
  await assert.rejects(install(env, source, { expectedReleaseRevision: 'd'.repeat(40) }))
  await assert.rejects(install(env, source, { expectedReleaseSha256: undefined }))
  const pointer = await readAcademyReleasePointer({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(pointer, null)
})

test('a self-consistent substituted manifest never passes the external binding', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  // Re-render a different content under the same revision: internally valid,
  // self-consistent, but its digest differs from the externally reviewed one.
  await env.fs.writeFileDirect('/source/node_modules/wrangler/package.json', Buffer.from('// substituted dependency\n'), 0o644)
  const substituted = await renderAcademyRelease({ spec: spec(REVISION_A),
    stagingRoot: '/staging/substituted', fs: env.fs, processLike: env.processLike })
  assert.notEqual(substituted.manifest.releaseSha256, source.manifest.releaseSha256)
  await assert.rejects(installAcademyRelease({ sourceRoot: substituted.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: env.fs, processLike: env.processLike }))
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
  await env.fs.chmod(`${target}/wrangler`, 0o700)
  await env.fs.writeFileDirect(`${target}/wrangler/node_modules/wrangler/package.json`, Buffer.from('tampered\n'), 0o444)
  await env.fs.chmod(`${target}/wrangler`, 0o555)
  await assert.rejects(install(env, source))
})

test('mode drift in an installed release fails closed', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(`${target}/node/bin/node`, 0o444)
  await assert.rejects(install(env, source))
})

test('writable or substituted release directories are rejected', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(`${target}/wrangler`, 0o755)
  await assert.rejects(verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike }))
  await assert.rejects(resolveAcademyCurrentRelease({ installRoot: '/install', fs: env.fs, processLike: env.processLike }))
  await env.fs.chmod(`${target}/wrangler`, 0o555)
  await env.fs.mkdir(`${target}/wrangler/rogue`, { mode: 0o555 })
  await assert.rejects(verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike }))
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
  const executable = `${targetB}/wrangler/node_modules/wrangler/bin/wrangler.js`
  await env.fs.rm(executable)
  await env.fs.symlink(`${target}/node/bin/node`, executable)
  await assert.rejects(verifyAcademyRelease({ root: targetB, fs: env.fs, processLike: env.processLike }))
  // The live pointer path also fails closed while the current release is drifted.
  await assert.rejects(resolveAcademyCurrentRelease({ installRoot: '/install', fs: env.fs, processLike: env.processLike }))
})

test('interrupted publication is recoverable and preserves the prior release', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  await env.fs.mkdir(`/install/releases/.stage-${second.manifest.releaseSha256}-999-0/nested`, { recursive: true })
  await env.fs.writeFileDirect(`/install/releases/.stage-${second.manifest.releaseSha256}-999-0/junk`, Buffer.from('junk'), 0o600)
  await env.fs.writeFileDirect(`/install/releases/.stage-${second.manifest.releaseSha256}-999-0/.academy-install-owned`,Buffer.from(`${JSON.stringify({
    schema:'academy-release-install-stage/v1',releaseSha256:second.manifest.releaseSha256,releaseRevision:REVISION_B,
  })}\n`),0o400)
  const result = await install(env, second)
  assert.equal(result.status, 'INSTALLED')
  await verifyAcademyRelease({ root: `/install/releases/${second.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
  await verifyAcademyRelease({ root: `/install/releases/${first.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
  const pointer = await readAcademyReleasePointer({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(pointer.releaseSha256, second.manifest.releaseSha256)
  assert.equal(pointer.previousReleaseSha256, first.manifest.releaseSha256)
})

test('v3 install accepts an exact v2 predecessor and preserves rollback continuity', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  const predecessor = await v2Predecessor(env, first)
  const root = `/install/releases/${predecessor.releaseSha256}`
  await verifyAcademyRelease({ root, fs: env.fs, processLike: env.processLike })
  const before = await predecessorSnapshot(env, predecessor)
  const second = await renderedSource(env, REVISION_B)
  const installed = await install(env, second)
  assert.equal(installed.status, 'INSTALLED')
  const pointer = await readAcademyReleasePointer({ installRoot: '/install',
    fs: env.fs, processLike: env.processLike })
  assert.equal(pointer.releaseSha256, second.manifest.releaseSha256)
  assert.equal(pointer.previousReleaseSha256, predecessor.releaseSha256)
  assert.deepEqual(await predecessorSnapshot(env, predecessor), before)
  const rolled = await rollbackAcademyRelease({ installRoot: '/install', now: NOW,
    fs: env.fs, processLike: env.processLike })
  assert.equal(rolled.releaseSha256, predecessor.releaseSha256)
  assert.equal(rolled.releaseRevision, REVISION_A)
  const resolved = await resolveAcademyCurrentRelease({ installRoot: '/install',
    fs: env.fs, processLike: env.processLike })
  assert.equal(resolved.release.manifest.schema, ACADEMY_RELEASE_PREDECESSOR_MANIFEST_SCHEMA)
})

test('v3 install rejects drifted v2 digest, ownership, tree, and incompatible predecessor', async () => {
  const prepare = async mutate => {
    const env = await environment()
    const first = await renderedSource(env, REVISION_A)
    const predecessor = await v2Predecessor(env, first)
    const predecessorPath = `/install/releases/${predecessor.releaseSha256}/manifest.json`
    await mutate(env, predecessor)
    await env.fs.writeFileDirect(predecessorPath,
      Buffer.from(`${JSON.stringify(predecessor)}\n`), 0o444)
    const second = await renderedSource(env, REVISION_B)
    return { env, second }
  }
  const changeIdentity = (manifest, uid, gid) => {
    manifest.entries = manifest.entries.map(entry => ({ ...entry, uid, gid }))
    manifest.directories = manifest.directories.map(directory => ({ ...directory, uid, gid }))
    manifest.releaseSha256 = computeAcademyReleaseSha256(manifest)
  }
  const digest = await prepare((env, manifest) => { manifest.releaseSha256 = 'e'.repeat(64) })
  await assert.rejects(install(digest.env, digest.second))
  const uid = await prepare((env, manifest) => changeIdentity(manifest, 3000, manifest.entries[0].gid))
  await assert.rejects(install(uid.env, uid.second))
  const gid = await prepare((env, manifest) => changeIdentity(manifest, manifest.entries[0].uid, 4000))
  await assert.rejects(install(gid.env, gid.second))
  const tree = await prepare(async env => {
    const target = `/install/releases/${(await readAcademyReleasePointer({ installRoot: '/install',
      fs: env.fs, processLike: env.processLike })).releaseSha256}`
    await env.fs.writeFileDirect(`${target}/foreign`, Buffer.from('foreign'), 0o400)
  })
  await assert.rejects(install(tree.env, tree.second))
  const incompatible = await prepare(async env => {
    await env.fs.rm('/install/current.json')
    await env.fs.writeFileDirect('/install/current.json', Buffer.from(`${JSON.stringify({
      schema: 'academy-release-pointer/v1', releaseSha256: 'f'.repeat(64),
      releaseRevision: REVISION_A, previousReleaseSha256: null, updatedAt: NOW.toISOString(),
    })}\n`), 0o400)
  })
  await assert.rejects(install(incompatible.env, incompatible.second))
})

test('stage marker is corrected and rechecked under restrictive umask', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const open = (path, flags, mode = 0o666) => env.fs.open(path, flags,
    (flags & constants.O_CREAT) ? mode & ~0o777 : mode)
  await assert.doesNotReject(installAcademyRelease({ sourceRoot: source.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: { ...env.fs, open }, processLike: env.processLike }))
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike })
})

test('releases directory is corrected to 0755 under restrictive umask', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const mkdir = (path, options = {}) => env.fs.mkdir(path, {
    ...options,
    mode: typeof options.mode === 'number' ? options.mode & ~0o077 : options.mode,
  })
  await assert.doesNotReject(installAcademyRelease({ sourceRoot: source.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs: { ...env.fs, mkdir }, processLike: env.processLike }))
  assert.equal((await env.fs.lstat('/install/releases')).mode & 0o777, 0o755)
})

test('unmarked exact stage residue is recovered after pre-rename crash window', async () => {
  const env = await environment({ uid: SOURCE_UID, gid: SOURCE_GID })
  const source = await renderedSource(env, REVISION_A)
  const releaseStage = `/install/releases/.stage-${source.manifest.releaseSha256}-${env.processLike.pid}-0`
  await env.fs.mkdir(releaseStage, { recursive: true, mode: 0o700 })
  const clone = await cloneRenderedSource(env, source, env, releaseStage)
  await env.fs.chmod(releaseStage, 0o555)
  await env.fs.rm(`${releaseStage}/.academy-install-owned`, { force: true }).catch(() => {})
  await verifyAcademyRelease({ root: clone.root, fs: env.fs, processLike: env.processLike })
  const stageEntries = await env.fs.readdir(releaseStage)
  assert.ok(stageEntries.includes('manifest.json'))
  assert.ok(!stageEntries.includes('.academy-install-owned'))
  assert.equal((await diagnoseAcademyInstall({ sourceRoot: source.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    fs: env.fs, processLike: env.processLike })).reason, 'OWNED_STAGE_RECOVERABLE')
  const result = await install(env, source)
  assert.equal(result.status, 'INSTALLED')
  await assert.rejects(env.fs.lstat(releaseStage))
})

test('concurrent verified winner cleans its exact unmarked stage residue', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  const releaseStage = `/install/releases/.stage-${source.manifest.releaseSha256}-${env.processLike.pid}-0`
  let conflictInjected = false
  const fs = {
    ...env.fs,
    rename: async (from, to) => {
      if (from === releaseStage && to === `/install/releases/${source.manifest.releaseSha256}` && !conflictInjected) {
        conflictInjected = true
        await env.fs.rename(from, to)
        const error = new Error('ENOTEMPTY')
        error.code = 'ENOTEMPTY'
        throw error
      }
      return env.fs.rename(from, to)
    },
  }
  const result = await installAcademyRelease({ sourceRoot: source.root, installRoot: '/install',
    expectedReleaseSha256: source.manifest.releaseSha256, expectedReleaseRevision: REVISION_A,
    now: NOW, fs, processLike: env.processLike })
  assert.equal(result.status, 'INSTALLED')
  await assert.rejects(env.fs.lstat(releaseStage))
  await verifyAcademyRelease({ root: `/install/releases/${source.manifest.releaseSha256}`, fs: env.fs, processLike: env.processLike })
})

test('rollback atomically switches the pointer to the exact retained previous release', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  await install(env, second)
  const result = await rollbackAcademyRelease({ installRoot: '/install', now: NOW,
    fs: env.fs, processLike: env.processLike })
  assert.equal(result.status, 'ROLLED_BACK')
  assert.equal(result.releaseSha256, first.manifest.releaseSha256)
  assert.equal(result.releaseRevision, REVISION_A)
  assert.equal(result.previousReleaseSha256, second.manifest.releaseSha256)
  const resolved = await resolveAcademyCurrentRelease({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(resolved.release.manifest.releaseRevision, REVISION_A)
  assert.equal(resolved.pointer.previousReleaseSha256, second.manifest.releaseSha256)
  // The exact-revision guard refuses rollback when the operator expectation mismatches.
  await assert.rejects(rollbackAcademyRelease({ installRoot: '/install',
    expectedReleaseRevision: REVISION_B, fs: env.fs, processLike: env.processLike }))
  // Rolling back again returns to the previous release (B), still verified.
  const again = await rollbackAcademyRelease({ installRoot: '/install', now: NOW, fs: env.fs, processLike: env.processLike })
  assert.equal(again.releaseSha256, second.manifest.releaseSha256)
})

test('pointer publication preserves a colliding unowned temporary file', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  await install(env, second)
  const temporary = `/install/current.json.tmp-${env.processLike.pid}`
  const sentinel = Buffer.from('foreign transaction state')
  await env.fs.writeFileDirect(temporary, sentinel, 0o400)
  await assert.rejects(rollbackAcademyRelease({ installRoot: '/install', now: NOW,
    fs: env.fs, processLike: env.processLike }))
  assert.deepEqual(env.fs.readNode(temporary).data, sentinel)
})

test('rollback without a retained previous release fails closed', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  await assert.rejects(rollbackAcademyRelease({ installRoot: '/install', now: NOW, fs: env.fs, processLike: env.processLike }))
})

test('pointer drift fails closed: missing release, tampered pointer, symlink pointer', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  const second = await renderedSource(env, REVISION_B)
  await install(env, second)
  const pointerPath = '/install/current.json'
  // Pointer names a release directory that is not the manifest it points at.
  await env.fs.rm(pointerPath)
  await env.fs.symlink('/install/other.json', pointerPath)
  await assert.rejects(readAcademyReleasePointer({ installRoot: '/install', fs: env.fs, processLike: env.processLike }))
  await env.fs.rm(pointerPath)
  await env.fs.writeFileDirect(pointerPath, JSON.stringify({ schema: 'academy-release-pointer/v1',
    releaseSha256: 'e'.repeat(64), releaseRevision: REVISION_A, previousReleaseSha256: null,
    updatedAt: '2026-08-29T10:00:00.000Z' }), 0o400)
  await assert.rejects(resolveAcademyCurrentRelease({ installRoot: '/install', fs: env.fs, processLike: env.processLike }))
})

test('crash window between rename and root freeze is recoverable', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(target, 0o700)
  const result = await install(env, source)
  assert.equal(result.status, 'IDEMPOTENT')
  await verifyAcademyRelease({ root: target, fs: env.fs, processLike: env.processLike })
})

test('extra foreign entries inside a release are rejected by exact tree walk', async () => {
  const env = await environment()
  const source = await renderedSource(env, REVISION_A)
  await install(env, source)
  const target = `/install/releases/${source.manifest.releaseSha256}`
  await env.fs.chmod(`${target}/helpers`, 0o700)
  await env.fs.writeFileDirect(`${target}/helpers/foreign.mjs`, Buffer.from('x'), 0o400)
  await assert.rejects(install(env, source))
})

test('reconcile removes crash leftovers fail-closed around unknown release directories', async () => {
  const env = await environment()
  const first = await renderedSource(env, REVISION_A)
  await install(env, first)
  await env.fs.mkdir('/install/releases/.stage-777-0', { recursive: true })
  await env.fs.writeFileDirect('/install/releases/.stage-777-0/junk', Buffer.from('junk'), 0o600)
  const outcome = await reconcileAcademyInstallResidue({ installRoot: '/install', fs: env.fs, processLike: env.processLike })
  assert.equal(outcome.status, 'CLEAN')
  await assert.rejects(env.fs.stat('/install/releases/.stage-777-0'))
  await env.fs.mkdir(`/install/releases/${'f'.repeat(64)}`, { recursive: true })
  await assert.rejects(reconcileAcademyInstallResidue({ installRoot: '/install', fs: env.fs, processLike: env.processLike }))
})
