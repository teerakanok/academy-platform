#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const WORKER = new URL('./academy-macos-root-preflight-worker.sh', import.meta.url).pathname
const ROOT_COPY = '/private/var/root/academy-macos-root-preflight-worker-5828f4b39d7c8f28.sh'
const EXPECTED_WORKER_SHA256 = '5828f4b39d7c8f289a10119dd604d02cda3a489228a4a3950517c30b03cba51a'
const OBSERVER = '/private/var/root/academy-release-observer-07ed27c0'
const SCRIPTS = WORKER.slice(0, WORKER.lastIndexOf('/'))
const RECOVERY = `${SCRIPTS}/academy-macos-release-recovery.mjs`
const POINTER = `${SCRIPTS}/academy-release-pointer.mjs`
const MANIFEST = `${SCRIPTS}/academy-release-manifest.mjs`
const CLI = `${SCRIPTS}/academy-release-cli.mjs`
const INSTALL = `${SCRIPTS}/academy-release-install.mjs`
const RENDER = `${SCRIPTS}/academy-release-render.mjs`
const EXECUTOR = `${SCRIPTS}/academy-bound-worker-executor.cjs`
const NODE = '/private/tmp/academy-release-sources-fa7/node'
const EXPECTED_RECOVERY_SHA256 = '844d92b9734a18fac1d14c842c25c2ff814b2d7a5840a14690bab3ee517a3d41'
const EXPECTED_POINTER_SHA256 = '7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee'
const EXPECTED_MANIFEST_SHA256 = 'e63128223ff20ef86f6ca1108845848523e7b25f46293cfab39ea66e25d37413'
const EXPECTED_CLI_SHA256 = 'ef405f7b9df4a8ba7ed45d232c347019b09ea4bc344a6cb86070706c811b9d9d'
const EXPECTED_INSTALL_SHA256 = '0505358687fe35ba97789b5700801c27b3405ff5ad66a960c899d646f922e8cf'
const EXPECTED_RENDER_SHA256 = '4b9560748dac8e82afd7719f8a55dca140078293e1b8ec9be453c479eb4a020a'
const EXPECTED_EXECUTOR_SHA256 = '07ed27c084efc6767b010a33a2b80522161bf85b1298d5606fceb8616cf4ab2e'
const EXPECTED_NODE_SHA256 = '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188'
const fail = reason => { throw new Error(reason ?? 'ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED') }
const TERMINAL = '/private/var/root/academy-release-recovery-7dca6452/terminal.json'
const FAILURE_REASONS = new Set(['ROOT_BOOTSTRAP_REJECTED','EXECUTOR_BINDING_REJECTED',
  'EXECUTOR_SPAWN_REJECTED','EXECUTOR_POSTCHECK_REJECTED'])
const PHASES = new Set(['BOOTSTRAP','OBSERVE_RELEASE','CLEANUP_STAGE','PREPARE_PACKAGE','RENDER_RELEASE',
  'INSTALL_RELEASE','VERIFY_RELEASE','REOBSERVE_RELEASE','STAGE_DATABASE','AUTHENTICATE_CLOUDFLARE','COMPLETE'])
const PUBLICATIONS = new Set(['UNKNOWN','CANDIDATE'])
const WORKER_REASONS = new Set(['UNCLASSIFIED','DIAGNOSTIC_FAILED','EXACT_CANDIDATE','CRASH_WINDOW_0700',
  'FOREIGN_TARGET','FOREIGN_STAGE','OWNED_STAGE_RECOVERABLE','TARGET_ABSENT'])

export const OBSERVER_ASSETS = Object.freeze([
  Object.freeze({ source:NODE, name:'node', mode:500, sha256:EXPECTED_NODE_SHA256 }),
  Object.freeze({ source:RECOVERY, name:'academy-macos-release-recovery.mjs', mode:400, sha256:EXPECTED_RECOVERY_SHA256 }),
  Object.freeze({ source:POINTER, name:'academy-release-pointer.mjs', mode:400, sha256:EXPECTED_POINTER_SHA256 }),
  Object.freeze({ source:MANIFEST, name:'academy-release-manifest.mjs', mode:400, sha256:EXPECTED_MANIFEST_SHA256 }),
  Object.freeze({ source:CLI, name:'academy-release-cli.mjs', mode:400, sha256:EXPECTED_CLI_SHA256 }),
  Object.freeze({ source:INSTALL, name:'academy-release-install.mjs', mode:400, sha256:EXPECTED_INSTALL_SHA256 }),
  Object.freeze({ source:RENDER, name:'academy-release-render.mjs', mode:400, sha256:EXPECTED_RENDER_SHA256 }),
  Object.freeze({ source:EXECUTOR, name:'academy-bound-worker-executor.cjs', mode:400, sha256:EXPECTED_EXECUTOR_SHA256 }),
])

const shellQuote = value => `'${String(value).replaceAll("'", `'"'"'`)}'`
export const boundWorkerInvocation = ({ node, executor, worker, digest, uid, gid, mode, terminal = TERMINAL }) =>
  [node, executor, worker, digest, uid, gid, mode, terminal].map(shellQuote).join(' ')

export function parseDiagnosticEnvelope(output) {
  const lines=String(output).split('\n').filter(Boolean)
  if (lines.length !== 1) return null
  if (lines[0] === 'ACADEMY_ROOT_PREFLIGHT_RESULT status=PASS') return Object.freeze({status:'PASS'})
  let match=lines[0].match(/^ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=([A-Z_]+)$/)
  if (match && FAILURE_REASONS.has(match[1])) return Object.freeze({status:'FAILED',reason:match[1]})
  match=lines[0].match(/^ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=WORKER_REJECTED phase=([A-Z_]+) publication=([A-Z_]+) worker_reason=([A-Z_]+)$/)
  if (match && PHASES.has(match[1]) && PUBLICATIONS.has(match[2]) && WORKER_REASONS.has(match[3])) {
    return Object.freeze({status:'FAILED',reason:'WORKER_REJECTED',phase:match[1],publication:match[2],workerReason:match[3]})
  }
  return null
}

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
  const bootstrap = `if test -e '${ROOT_COPY}' || test -L '${ROOT_COPY}'; then test -f '${ROOT_COPY}' && test ! -L '${ROOT_COPY}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${ROOT_COPY}')\" = 'root:wheel:500:1' && /usr/bin/shasum -a 256 '${ROOT_COPY}' | /usr/bin/grep -q '^${EXPECTED_WORKER_SHA256} '; else /usr/bin/install -o root -g wheel -m 500 '${WORKER}' '${ROOT_COPY}'; fi && if test -e '${OBSERVER}' || test -L '${OBSERVER}'; then test -d '${OBSERVER}' && test ! -L '${OBSERVER}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp' '${OBSERVER}')\" = 'root:wheel:700'; else /usr/bin/install -d -o root -g wheel -m 700 '${OBSERVER}'; fi && ${observerInstall}`
  const command = `if ${bootstrap}; then ${invocation} || /usr/bin/printf 'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=EXECUTOR_POSTCHECK_REJECTED\\n'; else /usr/bin/printf 'ACADEMY_ROOT_PREFLIGHT_RESULT status=FAILED reason=ROOT_BOOTSTRAP_REJECTED\\n'; fi`
  const script = `do shell script ${JSON.stringify(command)} with administrator privileges`
  const child = spawnProcess('/usr/bin/osascript', ['-e', script], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  let stdout=''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  const status = await new Promise(resolve => {
    child.once('error', () => resolve(null))
    child.once('close', resolve)
  })
  if (status !== 0) fail('AUTHORIZATION_NOT_COMPLETED')
  const envelope=parseDiagnosticEnvelope(stdout)
  if (!envelope) fail('ROOT_BOOTSTRAP_REJECTED')
  if (envelope.status === 'FAILED') {
    if (envelope.reason === 'WORKER_REJECTED') fail(`WORKER_REJECTED phase=${envelope.phase} publication=${envelope.publication} reason=${envelope.workerReason}`)
    fail(envelope.reason)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => {
  const candidate=error instanceof Error ? error.message : ''
  const message=/^(?:AUTHORIZATION_NOT_COMPLETED|ROOT_BOOTSTRAP_REJECTED|EXECUTOR_(?:BINDING|SPAWN|POSTCHECK)_REJECTED|WORKER_REJECTED phase=[A-Z_]+ publication=[A-Z_]+ reason=[A-Z_]+)$/.test(candidate)
    ? candidate : 'ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
