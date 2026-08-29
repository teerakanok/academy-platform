#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, open, realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createAcademyProductionLivePorts } from './academy-production-live-ports.mjs'
import { intakeIdentityLiveReadiness, readProtectedIdentityLiveReadiness } from './identity-live-readiness-intake.mjs'
import { ACTIVATION_RELEASE, runAcademyProductionActivation, writeControllerReceipt } from './identity-production-activation-controller.mjs'

const fail = () => { throw new Error('Academy production activation failed') }

async function stableParent(path) {
  let cursor = dirname(resolve(path))
  while (true) {
    if (await realpath(cursor) !== cursor) fail()
    const metadata = await stat(cursor)
    const stickyRoot = metadata.uid === 0 && Boolean(metadata.mode & 0o1000)
    if (!metadata.isDirectory() || (metadata.uid !== process.getuid() && metadata.uid !== 0)
      || ((metadata.mode & 0o022) && !stickyRoot)) fail()
    const next = dirname(cursor)
    if (next === cursor) return
    cursor = next
  }
}

async function readProtected(path) {
  const target = resolve(path)
  await stableParent(target)
  if (await realpath(target) !== target) fail()
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o077) || metadata.uid !== process.getuid()
      || metadata.size < 2 || metadata.size > 1024 * 1024) fail()
    const source = await handle.readFile('utf8')
    const value = JSON.parse(source)
    if (source !== `${JSON.stringify(value)}\n`) fail()
    return value
  } finally { await handle.close() }
}

function groupAlive(pid) {
  try { process.kill(-pid, 0); return true } catch (error) {
    if (error?.code === 'ESRCH') return false
    fail()
  }
}

async function waitGroup(pid, deadlineMs, clock) {
  while (clock() < deadlineMs) {
    if (!groupAlive(pid)) return true
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
  }
  return !groupAlive(pid)
}

async function terminateGroup(pid, deadlineMs, clock) {
  if (!Number.isSafeInteger(pid) || pid < 2 || !groupAlive(pid)) return
  try { process.kill(-pid, 'SIGTERM') } catch (error) { if (error?.code !== 'ESRCH') fail() }
  const remaining = deadlineMs - clock()
  const termDeadline = Math.min(deadlineMs, clock() + Math.max(20, Math.floor(remaining / 2)))
  if (await waitGroup(pid, termDeadline, clock)) return
  try { process.kill(-pid, 'SIGKILL') } catch (error) { if (error?.code !== 'ESRCH') fail() }
  if (!(await waitGroup(pid, deadlineMs, clock))) fail()
}

export async function runExecutable({ executable, args, validUntilMs, clock = () => Date.now() }) {
  const now = clock()
  const remaining = validUntilMs - now
  if (!Number.isFinite(validUntilMs) || remaining < 100) fail()
  const cleanupReserve = Math.max(50, Math.min(1000, Math.floor(remaining / 3)))
  const executionDeadline = validUntilMs - cleanupReserve
  const child = spawn(executable, args, {
    detached: true,
    stdio: ['ignore','pipe','ignore'],
    env: { HOME: '/var/empty', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  const chunks = []
  let bytes = 0
  let overflow = false
  child.stdout.on('data', chunk => {
    bytes += chunk.length
    if (bytes > 1024 * 1024) overflow = true
    else chunks.push(chunk)
  })
  const exit = new Promise(resolvePromise => {
    child.once('error', error => resolvePromise({ error }))
    child.once('exit', (status, signal) => resolvePromise({ status, signal }))
  })
  let result
  while (clock() < executionDeadline) {
    result = await Promise.race([exit, new Promise(resolvePromise => setTimeout(() => resolvePromise(null), 10))])
    if (result || overflow) break
  }
  if (!result || overflow) {
    await terminateGroup(child.pid, validUntilMs, clock)
    result = await exit
  } else if (groupAlive(child.pid)) {
    await terminateGroup(child.pid, validUntilMs, clock)
    fail()
  }
  if (clock() >= validUntilMs || overflow || result.error || result.signal || !Number.isInteger(result.status)) fail()
  return { status: result.status, stdout: Buffer.concat(chunks).toString('utf8') }
}

export async function main(args, options = {}) {
  if (args.length !== 5) fail()
  const [planPath, authorityPath, journalPath, receiptPath, release] = args
  if (release !== ACTIVATION_RELEASE) fail()
  const observedAt = options.observedAt ?? new Date()
  const plan = await readProtected(planPath)
  const readiness = intakeIdentityLiveReadiness(await readProtectedIdentityLiveReadiness(plan.identityReadinessPath), observedAt)
  const ports = await createAcademyProductionLivePorts({
    authorityPath,
    run: options.run ?? runExecutable,
    expected: { releaseRevision: plan.academy?.releaseRevision, identityReadinessSha256: readiness.receiptSha256 },
    clock: options.clock ?? (() => Date.now()),
  })
  const receipt = await runAcademyProductionActivation({ plan, ports, release, observedAt,
    journalPath: resolve(journalPath), receiptPath: resolve(receiptPath) })
  try {
    await access(resolve(journalPath))
    await writeControllerReceipt(resolve(receiptPath), receipt, { journalPath: resolve(journalPath) })
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  return receipt.status
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(status => console.log(status)).catch(() => {
    console.error('Academy production activation failed; inspect protected receipt/journal')
    process.exitCode = 1
  })
}
