#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

import { parseCurrentDeploymentJson } from './current-deployment.mjs'

const SHA = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const WORKER = 'cyberskills-academy'

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

export async function runWranglerJson({ executable, cwd, deadlineMs, clock = () => Date.now() }) {
  if (typeof executable !== 'string' || !executable.startsWith('/') || typeof cwd !== 'string' || !cwd.startsWith('/')) fail()
  const remaining = deadlineMs - clock()
  if (!Number.isFinite(deadlineMs) || remaining < 100) fail()
  const child = spawn(executable, ['deployments', 'list', '--name', WORKER, '--json'], {
    cwd, detached: true, stdio: ['ignore', 'pipe', 'ignore'],
    env: { HOME: '/root', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  const chunks = []
  let bytes = 0
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes <= 1024 * 1024) chunks.push(chunk) })
  const exit = new Promise(resolve => { child.once('error', () => resolve(null)); child.once('exit', (status, signal) => resolve({ status, signal })) })
  let result = await Promise.race([
    exit,
    new Promise(resolve => setTimeout(() => resolve(null), Math.min(remaining, 5_000))),
  ])
  if (!result || result.status !== 0 || result.signal || bytes > 1024 * 1024) {
    if (Number.isSafeInteger(child.pid)) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
    result = await Promise.race([exit, new Promise(resolve => setTimeout(() => resolve(null), 1_000))])
    if (!result) fail()
    fail()
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail() }
}

function currentFrom(value) {
  const deployments = Array.isArray(value) ? value : value?.deployments
  const current = parseCurrentDeploymentJson(JSON.stringify(deployments))
  if (current.versions.length !== 1 || current.versions[0].percentage !== 100) fail()
  return { deployments, deploymentId: current.id, versionId: current.versions[0].id }
}

export async function executeAcademyCloudflareHelper(args, options = {}) {
  const values = parseFlags(args)
  const clock = options.clock ?? (() => Date.now())
  const { validUntilMs } = common(values, clock())
  const operation = values['--operation']
  const allowed = operation === 'inspect'
    ? ['--authority','--release','--readiness','--valid-until','--operation','--mode','--journal']
    : ['--authority','--release','--readiness','--valid-until','--operation','--deployment','--version']
  if (!allowed || !exact(Object.fromEntries(Object.entries(values)), allowed)) fail()
  const run = options.run ?? (() => runWranglerJson({ executable: options.wranglerExecutable, cwd: options.cwd, deadlineMs: validUntilMs, clock }))
  const current = currentFrom(await run())
  if (operation === 'inspect') {
    if (values['--mode'] === 'discover-current' && values['--journal'] === '') return { deployments: current.deployments }
    // A journal digest alone cannot prove provider cleanup. Reconciliation remains fail-closed.
    fail()
  }
  if (operation !== 'residue' || !UUID.test(values['--deployment']) || !UUID.test(values['--version'])
    || current.deploymentId !== values['--deployment'] || current.versionId !== values['--version']) fail()
  const receipt = { status: 'PASS', deploymentId: current.deploymentId, versionId: current.versionId }
  return { ...receipt, receiptSha256: createHash('sha256').update(`${JSON.stringify(receipt)}\n`).digest('hex') }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeAcademyCloudflareHelper(process.argv.slice(2), {
    wranglerExecutable: process.env.ACADEMY_PINNED_WRANGLER,
    cwd: process.env.ACADEMY_RELEASE_ROOT,
  }).then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(() => {
    process.stderr.write('Academy production helper failed\n')
    process.exitCode = 1
  })
}
