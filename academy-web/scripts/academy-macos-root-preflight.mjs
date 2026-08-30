#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const WORKER = '/private/tmp/academy-result-loss-remediation/academy-web/scripts/academy-macos-root-preflight-worker.sh'
const ROOT_COPY = '/private/var/root/academy-macos-root-preflight-worker-9b3066344e098269.sh'
const EXPECTED_WORKER_SHA256 = '9b3066344e098269128a690a1524001b72d1eafea2c370dc5ab80b08d541e661'
const OBSERVER = '/private/var/root/academy-release-observer-7dca6452'
const RECOVERY = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-macos-release-recovery.mjs`
const POINTER = `${WORKER.slice(0, WORKER.lastIndexOf('/'))}/academy-release-pointer.mjs`
const NODE = '/private/tmp/academy-release-sources-fa7/node'
const EXPECTED_RECOVERY_SHA256 = '726484c435ec2167bd497720db285ad98449e790c65ddb102e25aa816a3a049c'
const EXPECTED_POINTER_SHA256 = '7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee'
const EXPECTED_NODE_SHA256 = '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188'
const fail = () => { throw new Error('ACADEMY_MACOS_ROOT_PREFLIGHT_REJECTED') }

export async function verifyWorker() {
  const bytes = await readFile(WORKER)
  if (createHash('sha256').update(bytes).digest('hex') !== EXPECTED_WORKER_SHA256) fail()
  for (const [path, digest] of [[RECOVERY, EXPECTED_RECOVERY_SHA256], [POINTER, EXPECTED_POINTER_SHA256], [NODE, EXPECTED_NODE_SHA256]]) {
    if (createHash('sha256').update(await readFile(path)).digest('hex') !== digest) fail()
  }
  return bytes
}

export async function main({ spawnProcess = spawn } = {}) {
  await verifyWorker()
  const ensure = (source, target, mode, digest) => `if test -e '${target}'; then test ! -L '${target}' && test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' '${target}')\" = 'root:wheel:${mode}:1' && /usr/bin/shasum -a 256 '${target}' | /usr/bin/grep -q '^${digest} '; else /usr/bin/install -o root -g wheel -m ${mode} '${source}' '${target}'; fi`
  const command = `if test -e '${ROOT_COPY}'; then /usr/bin/shasum -a 256 '${ROOT_COPY}' | /usr/bin/grep -q '^${EXPECTED_WORKER_SHA256} '; else /usr/bin/install -o root -g wheel -m 500 '${WORKER}' '${ROOT_COPY}'; fi && if test -e '${OBSERVER}'; then test \"$(/usr/bin/stat -f '%Su:%Sg:%Lp' '${OBSERVER}')\" = 'root:wheel:700'; else /usr/bin/install -d -o root -g wheel -m 700 '${OBSERVER}'; fi && ${ensure(NODE, `${OBSERVER}/node`, 500, EXPECTED_NODE_SHA256)} && ${ensure(RECOVERY, `${OBSERVER}/academy-macos-release-recovery.mjs`, 400, EXPECTED_RECOVERY_SHA256)} && ${ensure(POINTER, `${OBSERVER}/academy-release-pointer.mjs`, 400, EXPECTED_POINTER_SHA256)} && /usr/bin/shasum -a 256 '${ROOT_COPY}' | /usr/bin/grep -q '^${EXPECTED_WORKER_SHA256} ' && '${ROOT_COPY}'`
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
