// Real-filesystem smoke tests: render -> install -> pointer publication ->
// pinned process execution on a real POSIX tree in a temp root, plus rollback,
// external digest binding, crash/pointer recovery, and directory drift. No
// credentials, no network, no live /opt/academy writes (install root is a temp
// directory exercising the exact same pointer contract).

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { renderAcademyRelease } from './academy-release-render.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'
import { verifyAcademyRelease } from './academy-release-manifest.mjs'
import {
  forceRemoveAcademyTree,
  readAcademyReleasePointer,
  reconcileAcademyInstallResidue,
  resolveAcademyCurrentRelease,
  rollbackAcademyRelease,
} from './academy-release-pointer.mjs'
import { executeAcademyCloudflareHelper } from './academy-production-cloudflare-helper.mjs'

const REVISION_A = 'a'.repeat(40)
const REVISION_B = 'b'.repeat(40)
const NOW = new Date('2026-08-29T10:00:00.000Z')
const WRANGLER_VERSION = '9.9.9-fixture'
const provider = JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', created_on: '2026-08-29T10:00:00Z',
  versions: [{ version_id: '22222222-2222-4222-8222-222222222222', percentage: 100 }] }])

const WRANGLER_FIXTURE = [
  '// deterministic wrangler distribution fixture — no network, no credentials',
  "if (process.argv.includes('--version')) {",
  `  console.log('${WRANGLER_VERSION}')`,
  '  process.exit(0)',
  '}',
  "if (process.argv.includes('--json')) {",
  `  process.stdout.write('${provider}')`,
  '  process.exit(0)',
  '}',
  "throw new Error('unsupported invocation')",
  '',
].join('\n')

const WRANGLER_DRY_RUN_FIXTURE = [
  "import { existsSync, readFileSync, readdirSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "const args = process.argv.slice(2)",
  `if (args.includes('--version')) { console.log('${WRANGLER_VERSION}'); process.exit(0) }`,
  "if (args[0] !== 'versions' || args[1] !== 'upload' || !args.includes('--dry-run')) throw new Error('non-dry-run')",
  "if (args[2] !== '--config') throw new Error('entrypoint must come from config')",
  "const config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))",
  "const applicationRoot = dirname(args[args.indexOf('--config') + 1])",
  "const entrypoint = join(applicationRoot, config.main)",
  "const source = readFileSync(entrypoint, 'utf8')",
  "for (const match of source.matchAll(/from\\s*['\"]([^'\"]+)['\"]/g)) {",
  "  if (!match[1].startsWith('./')) throw new Error(`unbundled import: ${match[1]}`)",
  "  const imported = join(applicationRoot, config.main, '..', match[1])",
  "  if (!existsSync(imported)) throw new Error(`missing import: ${match[1]}`)",
  '}',
  "const assets = join(applicationRoot, config.assets.directory)",
  "if (!existsSync(assets) || readdirSync(assets).length === 0) throw new Error('missing assets')",
  "console.log('dry-run ok')",
].join('\n')

async function tempRoot(t) {
  const raw = await mkdtemp(join(tmpdir(), 'academy-release-real-'))
  const root = await realpath(raw)
  // The protected install root is operator-created, never installer-created.
  await mkdir(join(root, 'install'), { mode: 0o755 })
  t.after(() => forceRemoveAcademyTree(root))
  return root
}

async function materialize(root, revision, { wranglerBody = WRANGLER_FIXTURE } = {}) {
  const sources = join(root, 'sources', revision)
  await mkdir(join(sources, 'node_modules', 'wrangler', 'bin'), { recursive: true, mode: 0o755 })
  await writeFile(join(sources, 'node'), '#!/bin/sh\n# stand-in; replaced by real node below\n', { mode: 0o755 })
  await writeFile(join(sources, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    wranglerBody, { mode: 0o644 })
  await chmod(join(sources, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 0o755)
  await writeFile(join(sources, 'node_modules', 'wrangler', 'package.json'),
    JSON.stringify({ name: 'wrangler-fixture', version: WRANGLER_VERSION }), { mode: 0o644 })
  await writeFile(join(sources, 'helper.mjs'), '// helper source\n', { mode: 0o500 })
  await mkdir(join(sources, 'application', '.open-next', 'assets'), { recursive: true, mode: 0o755 })
  await writeFile(join(sources, 'application', 'worker.js'), 'import "./chunk.js"\nexport { handler } from "./chunk.js"\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', 'chunk.js'), 'export const handler = () => "academy"\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', 'wrangler.jsonc'),
    '{"main":"worker.js","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', 'src'), '// projection fixture\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', 'worker'), '// projection fixture\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', 'worker.ts'), '// projection fixture\n', { mode: 0o444 })
  await writeFile(join(sources, 'application', '.open-next', 'assets', 'asset.svg'), '<svg/>\n', { mode: 0o444 })
  const { root: staged, manifest } = await renderAcademyRelease({ spec: {
    releaseRevision: revision,
    node: { sourcePath: process.execPath },
    wrangler: { sourceDirectory: join(sources, 'node_modules'), entrypoint: 'wrangler/bin/wrangler.js' },
    application: { sourceDirectory: join(sources, 'application') },
    helpers: [
      { sourcePath: join(sources, 'helper.mjs'), path: 'helpers/academy-production-cloudflare-helper.mjs', mode: 0o500 },
    ],
  }, stagingRoot: join(root, 'staging', revision) })
  return { staged, manifest }
}

async function install(root, source, overrides = {}) {
  return installAcademyRelease({ sourceRoot: source.staged, installRoot: join(root, 'install'),
    expectedReleaseSha256: source.manifest.releaseSha256,
    expectedReleaseRevision: source.manifest.releaseRevision, now: NOW, ...overrides })
}

test('real install publishes through the pointer and runs the pinned node + wrangler --version', async t => {
  const root = await tempRoot(t)
  const source = await materialize(root, REVISION_A)
  await mkdir(join(root,'wrangler-work'),{mode:0o700})
  const result = await install(root, source)
  assert.equal(result.status, 'INSTALLED')
  const { release } = await resolveAcademyCurrentRelease({ installRoot: join(root, 'install') })
  // Pinned process execution: installed node binary runs installed wrangler entrypoint.
  const version = spawnSync(release.nodeExecutable, [release.wranglerEntrypoint, '--version'], { encoding: 'utf8' })
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), WRANGLER_VERSION)
  // End to end through the helper contract: pointer resolution, revision
  // binding, pre-spawn revalidation, real process execution.
  const value = await executeAcademyCloudflareHelper(
    ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',REVISION_A,
      '--readiness','a'.repeat(64),'--valid-until','2999-01-01T00:00:00Z',
      '--operation','inspect','--mode','discover-current','--journal',''],
    { clock: () => Date.parse('2026-08-29T11:00:00Z'), installRoot: join(root, 'install'), workRoot:join(root,'wrangler-work') })
  assert.deepEqual(value, { deployments: JSON.parse(provider) })
})

test('real rollback atomically switches the pointer to the retained previous release', async t => {
  const root = await tempRoot(t)
  const first = await materialize(root, REVISION_A)
  await install(root, first)
  const second = await materialize(root, REVISION_B)
  await install(root, second)
  const rolled = await rollbackAcademyRelease({ installRoot: join(root, 'install'), now: NOW })
  assert.equal(rolled.status, 'ROLLED_BACK')
  assert.equal(rolled.releaseSha256, first.manifest.releaseSha256)
  const resolved = await resolveAcademyCurrentRelease({ installRoot: join(root, 'install') })
  assert.equal(resolved.release.manifest.releaseRevision, REVISION_A)
  assert.equal(resolved.pointer.previousReleaseSha256, second.manifest.releaseSha256)
  // The rolled-back pinned process still runs.
  const version = spawnSync(resolved.release.nodeExecutable, [resolved.release.wranglerEntrypoint, '--version'], { encoding: 'utf8' })
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), WRANGLER_VERSION)
})

test('real installer rejects an external digest mismatch without publishing', async t => {
  const root = await tempRoot(t)
  const source = await materialize(root, REVISION_A)
  await assert.rejects(install(root, source, { expectedReleaseSha256: 'c'.repeat(64) }))
  const pointer = await readAcademyReleasePointer({ installRoot: join(root, 'install') })
  assert.equal(pointer, null)
})

test('real crash and pointer recovery: stage leftovers are reconciled, idempotent reinstall is clean', async t => {
  const root = await tempRoot(t)
  const source = await materialize(root, REVISION_A)
  await install(root, source)
  const second = await materialize(root, REVISION_B)
  await install(root, second)
  // Simulated crash leftovers inside releases/ and a stray pointer temp file.
  const releases = join(root, 'install', 'releases')
  await mkdir(join(releases, '.stage-999-0'), { recursive: true, mode: 0o700 })
  await writeFile(join(releases, '.stage-999-0', 'junk'), 'junk', { mode: 0o600 })
  await writeFile(join(root, 'install', 'current.json.tmp-999'), '{}', { mode: 0o400 })
  const outcome = await reconcileAcademyInstallResidue({ installRoot: join(root, 'install') })
  assert.equal(outcome.status, 'CLEAN')
  await assert.rejects(readFile(join(releases, '.stage-999-0', 'junk')))
  // Idempotent reinstall of the current release performs no publication.
  const again = await install(root, second)
  assert.equal(again.status, 'IDEMPOTENT')
  // A pointer naming a missing release fails closed.
  const drifted = { schema: 'academy-release-pointer/v1', releaseSha256: 'e'.repeat(64),
    releaseRevision: REVISION_B, previousReleaseSha256: null, updatedAt: NOW.toISOString() }
  const pointerPath = join(root, 'install', 'current.json')
  await chmod(pointerPath, 0o600)
  await writeFile(pointerPath, `${JSON.stringify(drifted)}\n`)
  await chmod(pointerPath, 0o400)
  await assert.rejects(resolveAcademyCurrentRelease({ installRoot: join(root, 'install') }))
})

test('real directory drift: writable release directories are rejected until repaired', async t => {
  const root = await tempRoot(t)
  const source = await materialize(root, REVISION_A)
  await install(root, source)
  const target = join(root, 'install', 'releases', source.manifest.releaseSha256)
  await chmod(join(target, 'wrangler'), 0o755)
  await assert.rejects(verifyAcademyRelease({ root: target }))
  await assert.rejects(resolveAcademyCurrentRelease({ installRoot: join(root, 'install') }))
  await chmod(join(target, 'wrangler'), 0o555)
  await verifyAcademyRelease({ root: target })
})

test('canonical application passes dry-run from an unrelated cwd', async t => {
  const root = await tempRoot(t)
  const source = await materialize(root, REVISION_A, { wranglerBody: WRANGLER_DRY_RUN_FIXTURE })
  await install(root, source)
  const { release } = await resolveAcademyCurrentRelease({ installRoot: join(root, 'install') })
  const config = join(release.root, 'application', 'wrangler.jsonc')
  const work = join(root, 'unrelated-work')
  await mkdir(work, { mode: 0o700 })
  const dryRun = spawnSync(release.nodeExecutable, [release.wranglerEntrypoint,
    'versions', 'upload', '--config', config, '--dry-run'], { cwd: work, encoding: 'utf8' })
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.equal(dryRun.stdout.trim(), 'dry-run ok')
})

test('real setgid parent: recorded gid follows the actual fstat, not the process gid', async t => {
  if (process.getuid() !== 0) {
    t.skip('creating a setgid directory requires root (live POSIX input)')
    return
  }
  const root = await tempRoot(t)
  await materialize(root, REVISION_A)
  const setgidRoot = join(root, 'setgid')
  await mkdir(setgidRoot, { mode: 0o2755 })
  const { manifest } = await renderAcademyRelease({ spec: {
    releaseRevision: REVISION_A,
    node: { sourcePath: process.execPath },
    wrangler: {
      sourceDirectory: join(root, 'sources', REVISION_A, 'node_modules'),
      entrypoint: 'wrangler/bin/wrangler.js',
    },
    application: { sourceDirectory: join(root, 'sources', REVISION_A, 'application') },
    helpers: [{ sourcePath: join(root, 'sources', REVISION_A, 'helper.mjs'), path: 'helpers/h.mjs', mode: 0o500 }],
  }, stagingRoot: join(setgidRoot, 'release') })
  const release = await verifyAcademyRelease({ root: join(setgidRoot, 'release') })
  // The manifest gid must be whatever fstat actually reported for the inodes
  // created under the setgid parent — never an assumption from the process.
  const parentStat = await stat(setgidRoot)
  assert.ok(manifest.entries.every(entry => entry.gid === release.gid))
  assert.ok(manifest.directories.every(directory => directory.gid === parentStat.gid))
})

test('installed wrangler package layout is verified offline when present', async t => {
  const wranglerPackage = join(process.cwd(), 'node_modules', 'wrangler')
  let manifest
  try { manifest = JSON.parse(await readFile(join(wranglerPackage, 'package.json'), 'utf8')) }
  catch (error) {
    if (error.code === 'ENOENT') { t.skip('no installed wrangler package in this checkout'); return }
    throw error
  }
  assert.equal(manifest.name, 'wrangler')
  const entry = manifest.bin?.wrangler ?? manifest.bin
  assert.ok(typeof entry === 'string' || typeof entry === 'object')
  const binary = typeof entry === 'string' ? entry : entry.wrangler
  await assert.doesNotReject(readFile(join(wranglerPackage, binary)))
  // Offline check only: no network, no credentials, no execution.
  await rm(join(tmpdir(), '.academy-wrangler-layout-probe'), { force: true }).catch(() => {})
})
