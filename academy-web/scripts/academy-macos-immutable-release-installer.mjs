#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_RELEASE_SHA256 = 'fda0394cee9da9b2d1c37d2aa6e6185efc6bc54d072d21bab5e3771c3f7c8f25'
export const EXPECTED_RELEASE_REVISION = '7de1cbfbd9e3606f44379ad0322b75109f10e583'
export const PACKAGE_SOURCE = '/Users/teerakanok/.local/state/cyberskills/academy-release-930f/package.json'
export const SOURCES_SOURCE = '/Users/teerakanok/.local/state/cyberskills/academy-release-930f/sources'
export const ROOT_TOOLING = '/private/var/root/academy-immutable-installer-22aff0e'
const ROOT_TOOLING_MARKER = 'academy-immutable-installer/22aff0e'

const DIRECTORY = dirname(fileURLToPath(import.meta.url))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const quote = value => `'${String(value).replaceAll("'", `'"'"'`)}'`
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
export const isReviewedSourcePath = path => {
  if (typeof path !== 'string' || resolve(path) !== path) return false
  const fromRoot = relative(SOURCES_SOURCE, path)
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot))
}

export const PINNED_ASSETS = Object.freeze([
  Object.freeze({ source: join(DIRECTORY, 'academy-macos-immutable-release-worker.sh'), name: 'worker.sh', mode: 0o500, sha256: 'ddd8c076927d955beaef67e97c1ddf2b134e5a219191f1f531b2da125e30a126' }),
  Object.freeze({ source: join(DIRECTORY, 'academy-release-cli.mjs'), name: 'academy-release-cli.mjs', mode: 0o400, sha256: 'ef405f7b9df4a8ba7ed45d232c347019b09ea4bc344a6cb86070706c811b9d9d' }),
  Object.freeze({ source: join(DIRECTORY, 'academy-release-render.mjs'), name: 'academy-release-render.mjs', mode: 0o400, sha256: '87d5ae93247db5a3ec374c0207d197483451b7e88db2bebcade2f89ba6dfccfc' }),
  Object.freeze({ source: join(DIRECTORY, 'academy-release-install.mjs'), name: 'academy-release-install.mjs', mode: 0o400, sha256: '4ec50af32ac10a26bc5bad2782a5f6faf3da7df3cabc87765007fa240a98eb72' }),
  Object.freeze({ source: join(DIRECTORY, 'academy-release-manifest.mjs'), name: 'academy-release-manifest.mjs', mode: 0o400, sha256: '945460b4c88f413d47dff021f2222907bd6537e84d9cf80414f10ce38a45fadb' }),
  Object.freeze({ source: join(DIRECTORY, 'academy-release-pointer.mjs'), name: 'academy-release-pointer.mjs', mode: 0o400, sha256: '7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee' }),
  Object.freeze({ source: join(SOURCES_SOURCE, 'node'), name: 'node', mode: 0o500, sha256: '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188' }),
])

async function exactRegularFile(path, expectedSha256) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    const bytes = await handle.readFile()
    if (!metadata.isFile() || metadata.nlink !== 1 || sha256(bytes) !== expectedSha256) {
      throw new Error('ACADEMY_IMMUTABLE_INSTALLER_REJECTED')
    }
  } finally { await handle.close() }
}

export async function collectInputs() {
  for (const asset of PINNED_ASSETS) await exactRegularFile(asset.source, asset.sha256)
  const handle = await open(PACKAGE_SOURCE, constants.O_RDONLY | constants.O_NOFOLLOW)
  let packageBytes
  let input
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid()
      || (before.mode & 0o077) || before.size < 2 || before.size > 1024 * 1024) {
      throw new Error('ACADEMY_IMMUTABLE_INSTALLER_REJECTED')
    }
    packageBytes = await handle.readFile()
    const after = await handle.stat()
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || packageBytes.length !== before.size) {
      throw new Error('ACADEMY_IMMUTABLE_INSTALLER_REJECTED')
    }
    input = JSON.parse(packageBytes.toString('utf8'))
  } finally { await handle.close() }
  if (!exact(input, ['schema','releaseRevision','nodeSource','wranglerDirectory','wranglerEntrypoint','applicationDirectory','helpers'])
    || input.schema !== 'academy-release-package-input/v2'
    || input.releaseRevision !== EXPECTED_RELEASE_REVISION
    || typeof input.nodeSource !== 'string' || typeof input.wranglerDirectory !== 'string'
    || typeof input.wranglerEntrypoint !== 'string' || typeof input.applicationDirectory !== 'string'
    || !Array.isArray(input.helpers) || input.helpers.length < 1
    || input.helpers.some(helper => !exact(helper, ['sourcePath','path','mode'])
      || typeof helper.sourcePath !== 'string' || typeof helper.path !== 'string'
      || ![0o400,0o444,0o500,0o555].includes(helper.mode))
    || packageBytes.toString('utf8') !== `${JSON.stringify(input)}\n`) {
    throw new Error('ACADEMY_IMMUTABLE_INSTALLER_REJECTED')
  }
  const paths = [input.nodeSource, input.wranglerDirectory,
    input.applicationDirectory, ...input.helpers.map(helper => helper.sourcePath)]
  if (paths.some(path => !isReviewedSourcePath(path))) {
    throw new Error('ACADEMY_IMMUTABLE_INSTALLER_REJECTED')
  }
  return Object.freeze({ packageSha256: sha256(packageBytes) })
}

const envelope = (status, reason) => JSON.stringify({
  schema: 'academy-macos-immutable-release-envelope/v1', status, reason,
})

export function buildRootCommand({ packageSha256 }) {
  const marker = `${ROOT_TOOLING}/.academy-owned`
  const exactAsset = asset => [
    `/usr/bin/test -f ${quote(`${ROOT_TOOLING}/${asset.name}`)}`,
    `/usr/bin/test ! -L ${quote(`${ROOT_TOOLING}/${asset.name}`)}`,
    `/usr/bin/test "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' ${quote(`${ROOT_TOOLING}/${asset.name}`)})" = ${quote(`root:wheel:${asset.mode.toString(8)}:1`)}`,
    `/usr/bin/test "$(/usr/bin/shasum -a 256 ${quote(`${ROOT_TOOLING}/${asset.name}`)} | /usr/bin/awk '{print $1}')" = ${quote(asset.sha256)}`,
  ].join(' && ')
  const installAsset = asset => [
    `/usr/bin/install -o root -g wheel -m ${asset.mode.toString(8)} ${quote(asset.source)} ${quote(`${ROOT_TOOLING}/${asset.name}.new`)}`,
    `/usr/bin/test "$(/usr/bin/shasum -a 256 ${quote(`${ROOT_TOOLING}/${asset.name}.new`)} | /usr/bin/awk '{print $1}')" = ${quote(asset.sha256)}`,
    `/bin/mv ${quote(`${ROOT_TOOLING}/${asset.name}.new`)} ${quote(`${ROOT_TOOLING}/${asset.name}`)}`,
    exactAsset(asset),
  ].join(' && ')
  const ensureAsset = asset => `if /usr/bin/test -e ${quote(`${ROOT_TOOLING}/${asset.name}`)} || /usr/bin/test -L ${quote(`${ROOT_TOOLING}/${asset.name}`)}; then ${exactAsset(asset)}; else ${installAsset(asset)}; fi`
  const bootstrap = [
    'set -eu',
    `if /usr/bin/test -e ${quote(ROOT_TOOLING)} || /usr/bin/test -L ${quote(ROOT_TOOLING)}; then`,
    `  /usr/bin/test -d ${quote(ROOT_TOOLING)} && /usr/bin/test ! -L ${quote(ROOT_TOOLING)} && /usr/bin/test "$(/usr/bin/stat -f '%Su:%Sg:%Lp' ${quote(ROOT_TOOLING)})" = 'root:wheel:700'`,
    `  /usr/bin/test -f ${quote(marker)} && /usr/bin/test "$(/bin/cat ${quote(marker)})" = ${quote(ROOT_TOOLING_MARKER)}`,
    'else',
    `  /usr/bin/install -d -o root -g wheel -m 700 ${quote(ROOT_TOOLING)}`,
    `  /usr/bin/printf '%s\\n' ${quote(ROOT_TOOLING_MARKER)} > ${quote(marker)}`,
    `  /usr/bin/chown root:wheel ${quote(marker)} && /bin/chmod 400 ${quote(marker)}`,
    'fi',
    ...PINNED_ASSETS.map(ensureAsset),
    `/usr/bin/test "$(/usr/bin/find ${quote(ROOT_TOOLING)} -mindepth 1 -maxdepth 1 -print | /usr/bin/wc -l | /usr/bin/tr -d ' ')" = ${quote(String(PINNED_ASSETS.length + 1))}`,
    `EXPECTED_RELEASE_REVISION=${quote(EXPECTED_RELEASE_REVISION)} /bin/sh ${quote(`${ROOT_TOOLING}/worker.sh`)} ${[
      PACKAGE_SOURCE, SOURCES_SOURCE, packageSha256, EXPECTED_RELEASE_SHA256,
      EXPECTED_RELEASE_REVISION, ROOT_TOOLING,
    ].map(quote).join(' ')}`,
  ].join('\n')
  return `if ( ${bootstrap} ); then :; else /usr/bin/printf '%s\\n' ${quote(envelope('FAILED', 'ROOT_BOOTSTRAP_REJECTED'))}; fi`
}

export function parseEnvelope(output) {
  const lines = String(output).split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) return null
  try {
    const value = JSON.parse(lines[0])
    if (Object.keys(value).join(',') !== 'schema,status,reason'
      || value.schema !== 'academy-macos-immutable-release-envelope/v1'
      || !['PASS', 'FAILED'].includes(value.status)
      || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value.reason)) return null
    return Object.freeze({ ...value })
  } catch { return null }
}

export async function main({ spawnProcess = spawn, inputs } = {}) {
  inputs ??= await collectInputs()
  const script = `do shell script ${JSON.stringify(buildRootCommand(inputs))} with administrator privileges`
  const child = spawnProcess('/usr/bin/osascript', ['-e', script], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  let stdout = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  const status = await new Promise(resolve => {
    child.once('error', () => resolve(null))
    child.once('close', resolve)
  })
  if (status !== 0) return Object.freeze({ schema:'academy-macos-immutable-release-envelope/v1', status:'FAILED', reason:'AUTHORIZATION_NOT_COMPLETED' })
  return parseEnvelope(stdout) ?? Object.freeze({ schema:'academy-macos-immutable-release-envelope/v1', status:'FAILED', reason:'INSTALLER_REJECTED' })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.status !== 'PASS') process.exitCode = 1
  }).catch(() => {
    process.stdout.write(`${envelope('FAILED', 'INSTALLER_REJECTED')}\n`)
    process.exitCode = 1
  })
}
