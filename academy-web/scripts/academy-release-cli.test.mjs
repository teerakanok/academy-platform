import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { main } from './academy-release-cli.mjs'
import { forceRemoveAcademyTree } from './academy-release-pointer.mjs'

const REVISION = 'a'.repeat(40)

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'academy-release-cli-')))
  t.after(async () => { await forceRemoveAcademyTree(root); await rm(root, { recursive: true, force: true }) })
  const sources = join(root, 'sources')
  await mkdir(join(sources, 'wrangler', 'bin'), { recursive: true, mode: 0o700 })
  await writeFile(join(sources, 'node'), '#!/bin/sh\n', { mode: 0o500 })
  await writeFile(join(sources, 'wrangler', 'bin', 'wrangler'), '#!/usr/bin/env node\n', { mode: 0o500 })
  await writeFile(join(sources, 'wrangler', 'package.json'), '{}\n', { mode: 0o400 })
  await writeFile(join(sources, 'helper.mjs'), 'export {}\n', { mode: 0o400 })
  await mkdir(join(sources, 'application', '.open-next', 'assets'), { recursive: true, mode: 0o700 })
  await writeFile(join(sources, 'application', 'worker.js'), 'import "./chunk.js"\nexport { handler } from "./chunk.js"\n', { mode: 0o400 })
  await writeFile(join(sources, 'application', 'chunk.js'), 'export const handler = () => "academy"\n', { mode: 0o400 })
  await writeFile(join(sources, 'application', 'wrangler.jsonc'),
    '{"main":"worker.js","assets":{"directory":".open-next/assets","binding":"ASSETS"}}\n', { mode: 0o400 })
  await writeFile(join(sources, 'application', '.open-next', 'assets', 'asset.svg'), '<svg/>\n', { mode: 0o400 })
  await chmod(join(sources, 'application', '.open-next', 'assets'), 0o500)
  await chmod(join(sources, 'application', '.open-next'), 0o500)
  await chmod(join(sources, 'application'), 0o500)
  await chmod(join(sources, 'wrangler', 'bin'), 0o500)
  await chmod(join(sources, 'wrangler'), 0o500)
  await chmod(sources, 0o500)
  const packagePath = join(root, 'package.json')
  const packageInput = { schema:'academy-release-package-input/v2', releaseRevision:REVISION,
    nodeSource:join(sources,'node'), wranglerDirectory:join(sources,'wrangler'), wranglerEntrypoint:'bin/wrangler',
    applicationDirectory:join(sources,'application'),
    helpers:[{sourcePath:join(sources,'helper.mjs'),path:'helpers/helper.mjs',mode:0o400}] }
  await writeFile(packagePath, `${JSON.stringify(packageInput)}\n`, { mode: 0o600 })
  return { root, packagePath }
}

const run = args => main(args, { requireRoot: false })

test('real filesystem CLI renders, installs, verifies, reconciles and rolls back exact releases', async t => {
  const first = await fixture(t)
  const renderedA = await run(['render', first.packagePath, join(first.root, 'render-a')])
  await mkdir(join(first.root, 'install'), { mode: 0o700 })
  const installedA = await run(['install', join(first.root, 'render-a'), join(first.root, 'install'), renderedA.releaseSha256, REVISION])
  assert.equal(installedA.status, 'INSTALLED')
  assert.equal((await run(['verify', join(first.root, 'install'), renderedA.releaseSha256, REVISION])).status, 'VERIFIED')

  await chmod(join(first.root, 'sources'), 0o700)
  await chmod(join(first.root, 'sources', 'wrangler'), 0o700)
  await chmod(join(first.root, 'sources', 'wrangler', 'package.json'), 0o600)
  await writeFile(join(first.root, 'sources', 'wrangler', 'package.json'), '{"version":"2"}\n', { mode: 0o400 })
  await chmod(join(first.root, 'sources', 'wrangler', 'package.json'), 0o400)
  await chmod(join(first.root, 'sources', 'wrangler'), 0o500)
  await chmod(join(first.root, 'sources'), 0o500)
  const renderedB = await run(['render', first.packagePath, join(first.root, 'render-b')])
  await run(['install', join(first.root, 'render-b'), join(first.root, 'install'), renderedB.releaseSha256, REVISION])
  await mkdir(join(first.root, 'install', 'releases', '.stage-999-0'), { mode: 0o700 })
  assert.equal((await run(['reconcile', join(first.root, 'install'), renderedB.releaseSha256, REVISION])).status, 'RECONCILED')
  const rolled = await run(['rollback', join(first.root, 'install'), renderedB.releaseSha256, REVISION])
  assert.equal(rolled.releaseSha256, renderedA.releaseSha256)
})

test('CLI rejects digest drift, noncanonical package JSON, writable sources and symlinks', async t => {
  const value = await fixture(t)
  const rendered = await run(['render', value.packagePath, join(value.root, 'render')])
  await mkdir(join(value.root, 'install'), { mode: 0o700 })
  await assert.rejects(run(['install', join(value.root, 'render'), join(value.root, 'install'), 'f'.repeat(64), REVISION]))
  const canonical = await readFile(value.packagePath, 'utf8')
  await writeFile(value.packagePath, ` ${canonical}`, { mode: 0o600 })
  await assert.rejects(run(['render', value.packagePath, join(value.root, 'bad-json')]))
  await writeFile(value.packagePath, canonical, { mode: 0o600 })
  const missingApplication = JSON.parse(canonical)
  delete missingApplication.applicationDirectory
  await writeFile(value.packagePath, `${JSON.stringify(missingApplication)}\n`, { mode: 0o600 })
  await assert.rejects(run(['render', value.packagePath, join(value.root, 'missing-application')]))
  await writeFile(value.packagePath, canonical, { mode: 0o600 })
  await chmod(join(value.root, 'sources'), 0o700)
  await chmod(join(value.root, 'sources', 'node'), 0o700)
  await chmod(join(value.root, 'sources'), 0o500)
  await assert.rejects(run(['render', value.packagePath, join(value.root, 'writable')]))
  await symlink(value.packagePath, join(value.root, 'package-link.json'))
  await assert.rejects(run(['render', join(value.root, 'package-link.json'), join(value.root, 'symlink')]))
  assert.equal(rendered.releaseRevision, REVISION)
})

test('spawned CLI requires root and emits only a generic failure on an untrusted invocation', () => {
  const result = spawnSync(process.execPath, [new URL('./academy-release-cli.mjs', import.meta.url).pathname, 'render', '/private/missing', '/private/output'], { encoding:'utf8' })
  if (process.getuid() !== 0) assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Academy release operation failed\n')
  assert.ok(Buffer.byteLength(result.stderr) < 128)
})
