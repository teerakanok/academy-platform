import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { runExecutable } from './academy-production-activation-cli.mjs'

async function script(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'academy-cli-runner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'helper')
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 })
  await chmod(path, 0o700)
  return path
}

test('runner uses a least-privilege environment and returns bounded JSON', async t => {
  const executable = await script(t, "printf '{\"home\":\"%s\",\"lang\":\"%s\"}' \"$HOME\" \"$LANG\"")
  const result = await runExecutable({ executable, args: [], validUntilMs: Date.now() + 2_000 })
  assert.deepEqual(JSON.parse(result.stdout), { home: '/var/empty', lang: 'C' })
})

test('runner kills and reaps output overflow, hang, and signal exits', async t => {
  const overflow = await script(t, "dd if=/dev/zero bs=1048577 count=1 2>/dev/null | tr '\\000' x; sleep 30")
  await assert.rejects(runExecutable({ executable: overflow, args: [], validUntilMs: Date.now() + 2_000 }))

  const pidPath = join(tmpdir(), `academy-hang-${process.pid}.pid`)
  t.after(() => rm(pidPath, { force: true }))
  const hang = await script(t, `echo $$ > '${pidPath}'; trap '' TERM; while :; do sleep 1; done`)
  const execution = runExecutable({ executable: hang, args: [], validUntilMs: Date.now() + 1_500 })
  const completion = execution.then(() => null, error => error)
  const { readFile } = await import('node:fs/promises')
  let pid
  const readyDeadline = Date.now() + 1_000
  while (Date.now() < readyDeadline) {
    try { pid = Number((await readFile(pidPath, 'utf8')).trim()); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
  }
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  assert.ok(await completion instanceof Error)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })

  const signaled = await script(t, 'kill -TERM $$')
  await assert.rejects(runExecutable({ executable: signaled, args: [], validUntilMs: Date.now() + 2_000 }))
})
