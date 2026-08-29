#!/usr/bin/env node

import { spawn } from 'node:child_process'

import { parseCurrentDeploymentJson } from './current-deployment.mjs'
import { verifyAcademyRelease } from './academy-release-manifest.mjs'
import { resolveAcademyCurrentRelease } from './academy-release-pointer.mjs'

const SHA = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const WORKER = 'cyberskills-academy'
// Fixed installed-release root; the live release is resolved exclusively
// through the protected current pointer (never a symlink) to
// /opt/academy/releases/<releaseSha256> and fully verified before — and again
// immediately before — any provider execution. Legacy ambient env executable /
// release-root inputs are rejected explicitly, never silently ignored.
export const ACADEMY_INSTALLED_RELEASE_ROOT = '/opt/academy'
const LEGACY_AMBIENT_ENV_INPUTS = ['ACADEMY_PINNED_WRANGLER', 'ACADEMY_RELEASE_ROOT']

const fail = () => { throw new Error('Academy production helper failed') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every((key, index) => key === keys[index])

function parseFlags(args) {
  if (!Array.isArray(args) || args.length < 12 || args.length > 24 || args.length % 2 !== 0) fail()
  const values = Object.create(null)
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!/^--[a-z][a-z-]*$/.test(name) || typeof value !== 'string' || value.length > 4096 || name in values) fail()
    values[name] = value
  }
  return values
}

function common(values, now) {
  const validUntil = values['--valid-until']
  if (!UUID.test(values['--authority']) || !REVISION.test(values['--release'])
    || !SHA.test(values['--readiness']) || !ISO_SECOND.test(validUntil)
    || new Date(validUntil).toISOString() !== validUntil.replace('Z', '.000Z')
    || !Number.isFinite(now) || now >= Date.parse(validUntil)) fail()
  return { validUntilMs: Date.parse(validUntil) }
}

export async function runWranglerJson({ executable, args = ['deployments', 'list', '--name', WORKER, '--json'], cwd, deadlineMs, clock = () => Date.now(), verify }) {
  if (typeof executable !== 'string' || !executable.startsWith('/') || typeof cwd !== 'string' || !cwd.startsWith('/')
    || !Array.isArray(args) || args.some(argument => typeof argument !== 'string')) fail()
  const remaining = deadlineMs - clock()
  if (!Number.isFinite(deadlineMs) || remaining < 100) fail()
  // Close the verify-to-spawn window: the release is revalidated (pointer,
  // manifest, full tree digests) immediately before the pinned process starts.
  if (verify !== undefined) {
    if (typeof verify !== 'function') fail()
    await verify()
  }
  const child = spawn(executable, args, {
    cwd, detached: true, stdio: ['ignore', 'pipe', 'ignore'],
    env: { HOME: '/root', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  const chunks = []
  let bytes = 0
  let overflow = false
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) overflow = true; else chunks.push(chunk) })
  const close = new Promise(resolve => {
    child.once('error', () => resolve(null))
    child.once('close', (status, signal) => resolve({ status, signal }))
  })
  let timer
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(remaining, 5_000)) })
  let result = await Promise.race([close, timeout])
  clearTimeout(timer)
  const cleanupFailedGroup = async () => {
    if (Number.isSafeInteger(child.pid)) {
      try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error?.code !== 'ESRCH') fail() }
    }
    result = await Promise.race([close, new Promise(resolve => setTimeout(() => resolve(null), 1_000))])
    if (!result || (Number.isSafeInteger(child.pid) && groupAlive(child.pid))) fail()
    fail()
  }
  if (!result || result.status !== 0 || result.signal || overflow) await cleanupFailedGroup()
  if (Number.isSafeInteger(child.pid) && groupAlive(child.pid)) {
    result = { status: 0, signal: null }
    await cleanupFailedGroup()
  }
  return Buffer.concat(chunks).toString('utf8')
}

function groupAlive(pid) {
  try { process.kill(-pid, 0); return true } catch (error) {
    if (error?.code === 'ESRCH') return false
    fail()
  }
}

function currentFrom(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1024 * 1024) fail()
  const current = parseCurrentDeploymentJson(source)
  if (current.versions.length !== 1 || current.versions[0].percentage !== 100) fail()
  return { deploymentId: current.id, versionId: current.versions[0].id }
}

export async function executeAcademyCloudflareHelper(args, options = {}) {
  const environment = options.env ?? process.env
  if (LEGACY_AMBIENT_ENV_INPUTS.some(name => environment[name] !== undefined)) fail()
  const values = parseFlags(args)
  const clock = options.clock ?? (() => Date.now())
  const { validUntilMs } = common(values, clock())
  const operation = values['--operation']
  const allowed = operation === 'inspect'
    ? ['--authority','--release','--readiness','--valid-until','--operation','--mode','--journal']
    : ['--authority','--release','--readiness','--valid-until','--operation','--deployment','--version']
  if (!allowed || !exact(Object.fromEntries(Object.entries(values)), allowed)) fail()
  const resolveRun = async () => {
    if (options.run) return options.run
    // External binding: --release is the operator-reviewed revision and must
    // equal both the current pointer revision and the verified manifest
    // revision; the pointer digest must equal the manifest releaseSha256.
    const installRoot = options.installRoot ?? ACADEMY_INSTALLED_RELEASE_ROOT
    const release = options.release ?? (await resolveAcademyCurrentRelease({
      installRoot,
      fs: options.fs, processLike: options.processLike,
    })).release
    if (release.manifest.releaseRevision !== values['--release']) fail()
    const runner = options.runWrangler ?? runWranglerJson
    const revalidate = options.revalidate ?? (async () => {
      if (options.release !== undefined) {
        await verifyAcademyRelease({ root: release.root, fs: options.fs, processLike: options.processLike })
        return
      }
      const current = await resolveAcademyCurrentRelease({ installRoot, fs: options.fs, processLike: options.processLike })
      if (current.release.root !== release.root
        || current.release.manifest.releaseSha256 !== release.manifest.releaseSha256
        || current.release.manifest.releaseRevision !== release.manifest.releaseRevision) fail()
    })
    return () => runner({ executable: release.nodeExecutable,
      args: [release.wranglerEntrypoint, 'deployments', 'list', '--name', WORKER, '--json'],
      cwd: release.root, deadlineMs: validUntilMs, clock, verify: revalidate })
  }
  const run = await resolveRun()
  const source = await run()
  const current = currentFrom(source)
  if (operation === 'inspect') {
    if (values['--mode'] === 'discover-current' && values['--journal'] === '') return { deployments: JSON.parse(source) }
    // A journal digest alone cannot prove provider cleanup. Reconciliation remains fail-closed.
    fail()
  }
  // Deployments do not enumerate uploaded zero-traffic versions. Until a pinned
  // versions inventory is part of this helper, it cannot prove residue absence.
  fail()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeAcademyCloudflareHelper(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(() => {
    process.stderr.write('Academy production helper failed\n')
    process.exitCode = 1
  })
}
