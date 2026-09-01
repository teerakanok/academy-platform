import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import {
  EXPECTED_RELEASE_REVISION,
  EXPECTED_RELEASE_SHA256,
  PACKAGE_SOURCE,
  PINNED_ASSETS,
  PINNED_HELPER_CLOSURE,
  SOURCES_SOURCE,
  ROOT_TOOLING,
  buildRootCommand,
  collectInputs,
  isReviewedSourcePath,
  main,
  parseEnvelope,
  wrapRootBootstrap,
} from './academy-macos-immutable-release-installer.mjs'
import { main as runReleaseCommand } from './academy-release-cli.mjs'
import { installAcademyRelease } from './academy-release-install.mjs'

test('reviewed source containment rejects traversal and textual-prefix siblings', () => {
  assert.equal(isReviewedSourcePath(`${SOURCES_SOURCE}`), true)
  assert.equal(isReviewedSourcePath(`${SOURCES_SOURCE}/application/worker.ts`), true)
  assert.equal(isReviewedSourcePath(`${SOURCES_SOURCE}/../outside`), false)
  assert.equal(isReviewedSourcePath(`${SOURCES_SOURCE}-foreign/node`), false)
  assert.equal(isReviewedSourcePath('relative/source'), false)
})

test('installer pins the reviewed release and every root executable input', async () => {
  assert.equal(EXPECTED_RELEASE_REVISION, '4c7361cd875167485ba36b256c90478dfbff8185')
  assert.equal(EXPECTED_RELEASE_SHA256, '2537eb1343aaea5f33dbf6c9abcbd34a10bf78a54d16674fcf0491b305481588')
  for (const asset of PINNED_ASSETS) {
    const digest = createHash('sha256').update(await readFile(asset.source)).digest('hex')
    assert.equal(digest, asset.sha256, asset.name)
  }
})

test('production package preflight installs a rendered release whose helper graph self-verifies under umask 077', async () => {
  const inputs = await collectInputs()
  assert.match(inputs.packageSha256, /^[a-f0-9]{64}$/)
  const stage = await mkdtemp('/private/tmp/academy-production-package-preflight-')
  const priorUmask = process.umask(0o077)
  try {
    const stagedSources = join(stage, 'sources')
    const stagedHelpers = join(stagedSources, 'helpers')
    const installRoot = join(stage, 'install')
    const workRoot = join(stage, 'wrangler-work')
    await cp(SOURCES_SOURCE, stagedSources, { recursive: true, preserveTimestamps: true })
    await chmod(stagedSources, 0o700)
    await chmod(stagedHelpers, 0o700).catch(async () => { await mkdir(stagedHelpers, { recursive: true, mode: 0o700 }) })
    for (const asset of PINNED_ASSETS.filter(candidate => PINNED_HELPER_CLOSURE.includes(candidate.name))) {
      await chmod(join(stagedHelpers, asset.name), 0o700).catch(() => {})
      await rm(join(stagedHelpers, asset.name), { force: true }).catch(() => {})
      await cp(asset.source, join(stagedHelpers, asset.name), { preserveTimestamps: true })
      await chmod(join(stagedHelpers, asset.name), asset.mode)
    }
    const packageInput = JSON.parse(await readFile(PACKAGE_SOURCE, 'utf8'))
    const rewrite = value => {
      if (typeof value === 'string') {
        if (value === SOURCES_SOURCE) return stagedSources
        if (value.startsWith(`${SOURCES_SOURCE}/`)) return `${stagedSources}${value.slice(SOURCES_SOURCE.length)}`
      }
      if (Array.isArray(value)) return value.map(rewrite)
      if (value && typeof value === 'object') return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, rewrite(nested)]))
      return value
    }
    const reviewedPackage = rewrite(packageInput)
    await writeFile(join(stage, 'package.json'), `${JSON.stringify(reviewedPackage)}\n`, { mode: 0o600, flag: 'wx' })
    const rendered = await runReleaseCommand(['render', join(stage, 'package.json'), join(stage, 'rendered')], {
      requireRoot: false,
    })
    assert.deepEqual(rendered, {
      status: 'RENDERED',
      releaseSha256: EXPECTED_RELEASE_SHA256,
      releaseRevision: EXPECTED_RELEASE_REVISION,
    })
    await mkdir(installRoot, { mode: 0o755 })
    await mkdir(workRoot, { mode: 0o700 })
    await installAcademyRelease({
      sourceRoot: join(stage, 'rendered'),
      installRoot,
      expectedReleaseSha256: EXPECTED_RELEASE_SHA256,
      expectedReleaseRevision: EXPECTED_RELEASE_REVISION,
    })
    const installedHelper = await import(`file://${join(installRoot, 'releases', EXPECTED_RELEASE_SHA256, 'helpers', 'academy-production-cloudflare-helper.mjs')}`)
    const value = await installedHelper.executeAcademyCloudflareHelper(
      ['--authority','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','--release',EXPECTED_RELEASE_REVISION,
        '--readiness','a'.repeat(64),'--valid-until','2999-01-01T00:00:00Z',
        '--operation','inspect','--mode','discover-current','--journal',''],
      {
        clock: () => Date.parse('2026-08-29T11:00:00Z'),
        installRoot,
        workRoot,
        run: async () => JSON.stringify([{
          id: '11111111-1111-4111-8111-111111111111',
          created_on: '2026-08-29T10:00:00Z',
          versions: [{ version_id: '22222222-2222-4222-8222-222222222222', percentage: 100 }],
        }]),
      },
    )
    assert.deepEqual(value, { deployments: [{
      id: '11111111-1111-4111-8111-111111111111',
      created_on: '2026-08-29T10:00:00Z',
      versions: [{ version_id: '22222222-2222-4222-8222-222222222222', percentage: 100 }],
    }] })
  } finally {
    process.umask(priorUmask)
    spawnSync('/bin/chmod', ['-R', 'u+w', stage])
    await rm(stage, { recursive: true, force: true })
  }
})

test('root command rehashes copied tooling and performs no DB, Cloudflare, or secret operation', () => {
  const command = buildRootCommand({ packageSha256: 'a'.repeat(64) })
  const toolingId = createHash('sha256').update(['academy-root-bootstrap/v2', ...PINNED_ASSETS
    .map(asset => `${asset.name}:${asset.mode.toString(8)}:${asset.sha256}`)]
    .join('\n')).digest('hex').slice(0, 16)
  assert.equal(ROOT_TOOLING, `/private/var/root/academy-immutable-installer-${toolingId}`)
  assert.match(command, /academy-release-cli\.mjs/)
  assert.match(command, new RegExp(EXPECTED_RELEASE_SHA256))
  assert.match(command, /\/usr\/sbin\/chown root:wheel/)
  assert.match(command, /root:wheel:400:1/)
  assert.match(command, /\/bin\/test/)
  assert.doesNotMatch(command, /\/usr\/bin\/chown/)
  assert.doesNotMatch(command, /\/usr\/bin\/test/)
  assert.match(command, /ROOT_BOOTSTRAP_REJECTED/)
  assert.doesNotMatch(command, /DATABASE|secret|sudo/iu)
})

test('root bootstrap aborts on the first failed command outside conditional errexit semantics', () => {
  const command = wrapRootBootstrap("/usr/bin/false\n/usr/bin/printf 'UNREACHABLE\\n'")
  const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, `${JSON.stringify({
    schema: 'academy-macos-immutable-release-envelope/v1',
    status: 'FAILED',
    reason: 'ROOT_BOOTSTRAP_REJECTED',
  })}\n`)
  assert.doesNotMatch(result.stdout, /UNREACHABLE/)
})

test('launcher asks once and accepts only one sanitized envelope', async () => {
  const calls = []
  const expected = { schema:'academy-macos-immutable-release-envelope/v1', status:'PASS', reason:'COMPLETE' }
  const result = await main({
    inputs: { packageSha256: 'a'.repeat(64) },
    spawnProcess(executable, args, options) {
      calls.push({ executable, args, options })
      const listeners = new Map()
      return {
        stdout: { setEncoding() {}, on(name, callback) { if (name === 'data') callback(`${JSON.stringify(expected)}\n`) } },
        once(name, callback) { listeners.set(name, callback); if (name === 'close') queueMicrotask(() => callback(0)) },
      }
    },
  })
  assert.deepEqual(result, expected)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal((calls[0].args.at(-1).match(/with administrator privileges/g) ?? []).length, 1)
  assert.equal(parseEnvelope(`${JSON.stringify(expected)}\nforeign\n`), null)
})

test('root worker binds render, diagnosis, install, verify and preserves executable modes', async () => {
  const worker = await readFile(new URL('./academy-macos-immutable-release-worker.sh', import.meta.url), 'utf8')
  assert.ok(worker.indexOf('render "$STAGE/package.json"') < worker.indexOf('diagnose-install'))
  assert.ok(worker.indexOf('diagnose-install') < worker.indexOf('"$CLI" install'))
  assert.ok(worker.indexOf('"$CLI" install') < worker.indexOf('"$CLI" verify'))
  assert.match(worker, /find "\$STAGE\/sources" -type d -exec \/bin\/chmod a\+rx,a-w/)
  assert.match(worker, /find "\$STAGE\/sources" -type f -exec \/bin\/chmod a\+rX,a-w/)
  assert.match(worker, /for helper in academy-production-cloudflare-helper\.mjs identity-production-activation-preflight\.mjs academy-release-manifest\.mjs academy-release-pointer\.mjs current-deployment\.mjs; do/)
  assert.match(worker, /\/bin\/cp -p "\$TOOLING_ROOT\/\$helper" "\$STAGE\/sources\/helpers\/\$helper"/)
  assert.match(worker, /FOREIGN_STATE_REJECTED/)
  for (const reason of ['RENDER_REJECTED', 'DIAGNOSIS_REJECTED', 'INSTALL_REJECTED', 'VERIFY_REJECTED']) {
    assert.match(worker, new RegExp(`FAIL_REASON=${reason}`))
  }
  assert.doesNotMatch(worker, /DATABASE|secret/iu)
})
