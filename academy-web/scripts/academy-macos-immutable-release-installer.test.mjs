import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  EXPECTED_RELEASE_REVISION,
  EXPECTED_RELEASE_SHA256,
  PINNED_ASSETS,
  buildRootCommand,
  collectPackageInput,
  main,
  parseEnvelope,
} from './academy-macos-immutable-release-installer.mjs'

const WORKER = new URL('./academy-macos-immutable-release-worker.sh', import.meta.url).pathname
const CLI = new URL('./academy-release-cli.mjs', import.meta.url).pathname
const REVISION = 'a'.repeat(40)
const RELEASE = 'b'.repeat(64)
const PASS = '{"schema":"academy-macos-immutable-release-envelope/v1","status":"PASS","reason":"COMPLETE"}\n'
const temporaryRoot = () => mkdtemp(join(tmpdir(), 'academy-installer-test-'))

const writeExecutable = async (path, source) => {
  await writeFile(path, source, { mode: 0o700 })
  return path
}

const packageFixture = async root => {
  const sources = join(root, 'sources')
  await mkdir(join(sources, 'application'), { recursive: true })
  await mkdir(join(sources, 'node_modules'), { recursive: true })
  await mkdir(join(sources, 'node_modules', 'wrangler', 'bin'), { recursive: true })
  await writeFile(join(sources, 'node'), '#!/bin/sh\nexec /usr/bin/true\n', { mode: 0o500 })
  await writeFile(join(sources, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '#!/bin/sh\n', { mode: 0o500 })
  await writeFile(join(sources, 'application', 'worker.js'), 'export default {}\n', { mode: 0o400 })
  const packagePath = join(root, 'package.json')
  await writeFile(packagePath, `${JSON.stringify({
    schema: 'academy-release-package-input/v2', releaseRevision: EXPECTED_RELEASE_REVISION,
    nodeSource: join(sources, 'node'), wranglerDirectory: join(sources, 'node_modules'),
    wranglerEntrypoint: 'wrangler/bin/wrangler.js', applicationDirectory: join(sources, 'application'),
    helpers: [{ sourcePath: join(sources, 'node'), path: 'helpers/node.mjs', mode: 0o500 }],
  })}\n`, { mode: 0o400 })
  await chmod(sources, 0o500)
  return { packagePath, sources }
}

const fakeNode = root => writeExecutable(join(root, 'fake-node'), `#!/bin/sh
if test "$1" = -; then exec ${JSON.stringify(process.execPath)} "$@"; fi
command=$2
if test "$command" = render; then
  /usr/bin/printf '{"status":"RENDERED","releaseSha256":"${RELEASE}","releaseRevision":"${REVISION}"}\\n'
  exit 0
fi
if test "$command" = diagnose-install; then
  if test -e "$4/current.json"; then reason=TARGET_PRESENT; else reason=TARGET_ABSENT; fi
  /usr/bin/printf '{"schema":"academy-release-install-diagnostic/v1","status":"INSPECTED","reason":"%s"}\\n' "$reason"
  exit 0
fi
if test "$command" = install; then
  if test -e "$4/current.json"; then status=IDEMPOTENT; else
    status=INSTALLED
    /bin/mkdir -p "$4/releases/${RELEASE}" "$4/releases/prior-release"
    /usr/bin/printf 'prior\\n' > "$4/releases/prior-release/manifest.json"
    /usr/bin/printf 'candidate\\n' > "$4/releases/${RELEASE}/manifest.json"
    /usr/bin/printf '{"schema":"academy-release-pointer/v1","releaseSha256":"${RELEASE}","releaseRevision":"${REVISION}","previousReleaseSha256":null,"updatedAt":"2026-08-31T00:00:00Z"}\\n' > "$4/current.json"
    /bin/chmod 400 "$4/current.json" "$4/releases/${RELEASE}/manifest.json"
  fi
  /usr/bin/printf '{"status":"%s","releaseSha256":"${RELEASE}","releaseRevision":"${REVISION}"}\\n' "$status"
  exit 0
fi
if test "$command" = verify; then
  /usr/bin/printf '{"status":"VERIFIED","releaseSha256":"${RELEASE}","releaseRevision":"${REVISION}"}\\n'
  exit 0
fi
exit 90
`)

const runWorker = async (options = {}) => {
  const root = await temporaryRoot()
  const stageParent = join(root, 'owned')
  await mkdir(stageParent, { mode: 0o700 })
  await mkdir(join(root, 'preserve'), { mode: 0o700 })
  await writeFile(join(root, 'preserve', 'foreign'), 'foreign\n', { mode: 0o400 })
  const { packagePath, sources } = await packageFixture(root)
  const installRoot = join(root, 'install')
  if (options.foreign) {
    await mkdir(join(installRoot, 'releases'), { recursive: true, mode: 0o700 })
    await writeFile(join(installRoot, 'current.json'), '{"foreign":true}\n', { mode: 0o400 })
  }
  const packageBytes = await readFile(packagePath)
  const digest = createHash('sha256').update(packageBytes).digest('hex')
  const node = await fakeNode(root)
  let remove = '/bin/rm'
  if (options.failRemove) {
    const removeLog = join(root, 'remove.log')
    remove = await writeExecutable(join(root, 'failing-rm'), `#!/bin/sh
test "$#" -eq 2 && test "$1" = -rf || exit 64
/usr/bin/printf '%s\\n' "$2" > '${removeLog}'
exit 64
`)
  }
  const arguments_ = [packagePath, sources, options.digest ?? digest, RELEASE, REVISION,
    join(root, 'tooling'), installRoot, stageParent, node, CLI, '/usr/bin/true', remove]
  const repeat = options.repeat ?? 1
  const results = Array.from({ length: repeat }, () => spawnSync(WORKER, arguments_, {
    encoding: 'utf8', env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  }))
  return { root, stageParent, packagePath, packageBytes, installRoot, results, repeat }
}

test('installer pins the reviewed release and every root executable input', async () => {
  assert.equal(EXPECTED_RELEASE_REVISION, '7de1cbfbd9e3606f44379ad0322b75109f10e583')
  assert.equal(EXPECTED_RELEASE_SHA256, 'fda0394cee9da9b2d1c37d2aa6e6185efc6bc54d072d21bab5e3771c3f7c8f25')
  for (const asset of PINNED_ASSETS) {
    const digest = createHash('sha256').update(await readFile(asset.source)).digest('hex')
    assert.equal(digest, asset.sha256, asset.name)
  }
})

test('package snapshot hashes and validates one immutable open', async t => {
  const root = await temporaryRoot()
  t.after(() => rm(root, { recursive: true, force: true }))
  const sources = join(root, 'sources')
  await mkdir(join(sources, 'application'), { recursive: true })
  await mkdir(join(sources, 'node_modules'), { recursive: true })
  await writeFile(join(sources, 'node'), '#!/bin/sh\n', { mode: 0o500 })
  await writeFile(join(sources, 'application', 'worker.js'), 'export {}\n', { mode: 0o400 })
  const packagePath = join(root, 'package.json')
  const packageValue = {
    schema: 'academy-release-package-input/v2', releaseRevision: EXPECTED_RELEASE_REVISION,
    nodeSource: join(sources, 'node'), wranglerDirectory: join(sources, 'node_modules'),
    wranglerEntrypoint: 'wrangler/bin/wrangler.js', applicationDirectory: join(sources, 'application'),
    helpers: [{ sourcePath: join(sources, 'node'), path: 'helpers/node.mjs', mode: 0o500 }],
  }
  await writeFile(packagePath, `${JSON.stringify(packageValue)}\n`, { mode: 0o400 })
  await chmod(sources, 0o500)
  const accepted = await collectPackageInput(packagePath, sources)
  const bytes = await readFile(packagePath)
  assert.deepEqual(accepted, { packageSha256: createHash('sha256').update(bytes).digest('hex') })

  const semanticDrift = join(root, 'semantic-drift.json')
  const invalid = { ...packageValue, releaseRevision: 'c'.repeat(40) }
  await writeFile(semanticDrift, `${JSON.stringify(invalid)}\n`, { mode: 0o400 })
  await assert.rejects(collectPackageInput(semanticDrift, sources))
  await chmod(packagePath, 0o604)
  await assert.rejects(collectPackageInput(packagePath, sources))
})

test('root command rehashes copied tooling and performs no DB, Cloudflare, or secret operation', () => {
  const command = buildRootCommand({ packageSha256: 'a'.repeat(64) })
  assert.match(command, /academy-release-cli\.mjs/)
  assert.match(command, /fda0394cee9da9b2d1c37d2aa6e6185efc6bc54d072d21bab5e3771c3f7c8f25/)
  assert.match(command, /ROOT_BOOTSTRAP_REJECTED/)
  assert.match(command, /\/opt\/academy/)
  assert.match(command, /\/private\/var\/root/)
  assert.doesNotMatch(command, /wrangler|cloudflare|DATABASE|secret|sudo/iu)
})

test('launcher asks once and accepts only one sanitized envelope', async () => {
  const calls = []
  const expected = { schema:'academy-macos-immutable-release-envelope/v1', status:'PASS', reason:'COMPLETE' }
  const result = await main({
    inputs: { packageSha256: 'a'.repeat(64) },
    spawnProcess(executable, args, options) {
      calls.push({ executable, args, options })
      return {
        stdout: { setEncoding() {}, on(name, callback) { if (name === 'data') callback(`${JSON.stringify(expected)}\n`) } },
        once(name, callback) { if (name === 'close') queueMicrotask(() => callback(0)) },
      }
    },
  })
  assert.deepEqual(result, expected)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, '/usr/bin/osascript')
  assert.equal((calls[0].args.at(-1).match(/with administrator privileges/g) ?? []).length, 1)
  assert.equal(parseEnvelope(`${JSON.stringify(expected)}\nforeign\n`), null)
})

test('worker passes strict evidence, preserves modes, cleans exactly and is idempotent', async () => {
  const run = await runWorker({ repeat: 2 })
  for (const result of run.results) {
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, PASS)
  }
  assert.deepEqual(await readdir(run.stageParent), [])
  assert.equal(await readFile(join(run.root, 'preserve', 'foreign')), 'foreign\n')
  assert.deepEqual(await readFile(run.packagePath), run.packageBytes)
  assert.equal((await stat(join(run.root, 'sources', 'node'))).mode & 0o777, 0o500)
  assert.equal(await readFile(join(run.installRoot, 'releases', 'prior-release', 'manifest.json')), 'prior\n')
})

test('worker rejects package digest drift and foreign state without residue or values', async () => {
  const drift = await runWorker({ digest: 'd'.repeat(64) })
  assert.equal(drift.results[0].status, 0)
  assert.equal(drift.results[0].stdout, '{"schema":"academy-macos-immutable-release-envelope/v1","status":"FAILED","reason":"INSTALLER_REJECTED"}\n')
  assert.deepEqual(await readdir(drift.stageParent), [])

  const foreign = await runWorker({ foreign: true })
  assert.equal(foreign.results[0].status, 0)
  assert.equal(foreign.results[0].stdout, '{"schema":"academy-macos-immutable-release-envelope/v1","status":"FAILED","reason":"FOREIGN_STATE_REJECTED"}\n')
  assert.deepEqual(await readdir(foreign.stageParent), [])
  assert.equal(await readFile(join(foreign.installRoot, 'current.json')), '{"foreign":true}\n')
})

test('worker turns cleanup failure into a sanitized non-PASS envelope', async () => {
  const failed = await runWorker({ failRemove: true })
  assert.equal(failed.results[0].status, 0)
  assert.equal(failed.results[0].stdout, '{"schema":"academy-macos-immutable-release-envelope/v1","status":"FAILED","reason":"CLEANUP_FAILED"}\n')
  const residue = await readdir(failed.stageParent)
  assert.equal(residue.length, 1)
  assert.match(residue[0], /^academy-immutable-release\./)
  assert.match(await readFile(join(failed.root, 'remove.log'), 'utf8'), /\/academy-immutable-release\.[^/]+$/)
})
