#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const WORKER = '/private/tmp/academy-result-loss-remediation/academy-web/scripts/academy-macos-root-preflight-worker.sh'
const ROOT_COPY = '/private/var/root/academy-macos-root-preflight-worker-1b0bd5170591b009.sh'
const EXPECTED_WORKER_SHA256 = '1b0bd5170591b0093418c985d7ebd3e35e310dd8c7502c71ade1bfb7153943d8'
const OBSERVER = '/private/var/root/academy-release-observer-7dca6452'
const RECOVERY = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-macos-release-recovery.mjs`
const POINTER = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-release-pointer.mjs`
const MANIFEST = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-release-manifest.mjs`
const EXECUTOR = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-bound-worker-executor.cjs`
const NODE = '/private/tmp/academy-release-sources-fa7/node'
const EXPECTED_RECOVERY_SHA256 = '844d92b9734a18fac1d14c842c25c2ff814b2d7a5840a14690bab3ee517a3d41'
const EXPECTED_POINTER_SHA256 = '7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee'
const EXPECTED_MANIFEST_SHA256 = '803f50c7f33ef22f9d199ee8b4e7dfe3810c33861999a8c2109880f62ab4eaec'
const EXPECTED_EXECUTOR_SHA256 = 'd30d89ee73f514970b75314a4e11748b0b7d2ce67b931cac79b13c316e6405dd'
const EXPECTED_NODE_SHA256 = '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188'
const fail = () => { throw new Error('ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED') }

export const OBSERVER_ASSETS = Object.freeze([
  Object.freeze({ source:NODE, name:'node', mode:500, sha256:EXPECTED_NODE_SHA256 }),
  Object.freeze({ source:RECOVERY, name:'academy-macos-release-recovery.mjs', mode:400, sha256:EXPECTED_RECOVERY_SHA256 }),
  Object.freeze({ source:POINTER, name:'academy-release-pointer.mjs', mode:400, sha256:EXPECTED_POINTER_SHA256 }),
  Object.freeze({ source:MANIFEST, name:'academy-release-manifest.mjs', mode:400, sha256:EXPECTED_MANIFEST_SHA256 }),
  Object.freeze({ source:EXECUTOR, name:'academy-bound-worker-executor.cjs', mode:400, sha256:EXPECTED_EXECUTOR_SHA256 }),
])

const shellQuote = value => `'${String(value).replaceAll("'", `'"'"'`)}'`
export const boundWorkerInvocation = ({ node, executor, worker, digest, uid, gid, mode }) =>
  [node, executor, worker, digest, uid, gid, mode].map(shellQuote).join(' ')

export async function verifyWorker() {
  const bytes = await readFile(WORKER)
  if (createHash('sha256').update(bytes).digest('hex') !== EXPECTED_WORKER_SHA256) fail()
  for (const asset of OBSERVER_ASSETS) {
    if (createHash('sha256').update(await readFile(asset.source)).digest('hex') !== asset.sha256) fail()
  }
  return bytes
}

export async function main({ spawnProcess = spawn } = {}) {
  await verifyWorker()
  const exact = (target, mode, digest) => `test -f '${target}' && test ! -L '${target}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${target}')\" = 'root:wheel:${mode}:1' && /usr/bin/shasum -a 256 '${target}' | /usr/bin/grep -q '^${digest} '`
  const ensure = (source, target, mode, digest) => `if test -e '${target}' || test -L '${target}'; then ${exact(target, mode, digest)}; else /usr/bin/install -o root -g wheel -m ${mode} '${source}' '${target}' && ${exact(target, mode, digest)}; fi`
  const rootExecutor = `${OBSERVER}/academy-bound-worker-executor.cjs`
  const invocation = boundWorkerInvocation({ node:`${OBSERVER}/node`, executor:rootExecutor, worker:ROOT_COPY, digest:EXPECTED_WORKER_SHA256, uid:0, gid:0, mode:320 })
  const observerInstall = OBSERVER_ASSETS.map(asset => ensure(asset.source,
    `${OBSERVER}/${asset.name}`, asset.mode, asset.sha256)).join(' && ')
  const command = `if test -e '${ROOT_COPY}' || test -L '${ROOT_COPY}'; then test -f '${ROOT_COPY}' && test ! -L '${ROOT_COPY}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${ROOT_COPY}')\" = 'root:wheel:500:1' && /usr/bin/shasum -a 256 '${ROOT_COPY}' | /usr/bin/grep -q '^${EXPECTED_WORKER_SHA256} '; else /usr/bin/install -o root -g wheel -m 500 '${WORKER}' '${ROOT_COPY}'; fi && if test -e '${OBSERVER}' || test -L '${OBSERVER}'; then test -d '${OBSERVER}' && test ! -L '${OBSERVER}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp' '${OBSERVER}')\" = 'root:wheel:700'; else /usr/bin/install -d -o root -g wheel -m 700 '${OBSERVER}'; fi && ${observerInstall} && ${invocation}`
  const script = `do shell script ${JSON.stringify(command)} with administrator privileges`
  const child = spawnProcess('/usr/bin/osascript', ['-e', script], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (status !== 0) fail()
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => {
  process.stderr.write('ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED\n')
  process.exitCode = 1
})
