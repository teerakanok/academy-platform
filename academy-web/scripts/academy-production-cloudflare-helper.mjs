#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, rm, stat, symlink } from 'node:fs/promises'

import { assertNoDuplicateJsonMembers, parseCurrentDeploymentJson } from './current-deployment.mjs'
import { verifyAcademyRelease } from './academy-release-manifest.mjs'
import { resolveAcademyCurrentRelease } from './academy-release-pointer.mjs'

const SHA = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const WORKER = 'cyberskills-academy'
const WRANGLER_VERSION = '4.120.0'
const APPLICATION_CONFIG = 'application/wrangler.jsonc'
const APPLICATION_DIRECTORY = 'application'
const APPLICATION_CONFIG_NAME = 'wrangler.jsonc'
const APPLICATION_LINKS = Object.freeze(['.open-next', 'src', 'worker', 'worker.ts'])
const DEFAULT_WORK_ROOT = '/private/var/lib/academy/wrangler'
const IDENTITY_CONFIG_NAMES = ['IDENTITY_ADAPTER','IDENTITY_RUNTIME_ENABLED','IDENTITY_RUNTIME_WIRED','IDENTITY_RELEASE_APPROVAL','IDENTITY_CODE_EXCHANGE_TIMEOUT_MS','IDENTITY_CLIENT_ASSERTION_KEY_ID','IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK','IDENTITY_RESULT_KEY_SET_DOCUMENT']
const CONFIG_NAMES = [...IDENTITY_CONFIG_NAMES,'ASSETS','COURSE_MEDIA','EDGE_RATE_LIMITER','NEXT_PUBLIC_SEARCH_INDEXING']
const CONFIG_SHA = createHash('sha256').update(`${JSON.stringify(CONFIG_NAMES)}\n`).digest('hex')
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
  if (!Array.isArray(args) || args.length < 12 || args.length > 32 || args.length % 2 !== 0) fail()
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

export async function runWranglerJson({ executable, args = ['deployments', 'list', '--name', WORKER, '--json'], cwd, deadlineMs, clock = () => Date.now(), verify, stdin }) {
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
    cwd, detached: true, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
    env: { HOME: '/private/var/root', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  })
  if (stdin !== undefined) { child.stdin.end(stdin) }
  const chunks = []
  let bytes = 0
  let overflow = false
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) overflow = true; else chunks.push(chunk) })
  const close = new Promise(resolve => {
    child.once('error', () => resolve(null))
    child.once('close', (status, signal) => resolve({ status, signal }))
  })
  let timer
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(remaining, 30_000)) })
  let result = await Promise.race([close, timeout])
  clearTimeout(timer)
  const cleanupGroup = async () => {
    if (!Number.isSafeInteger(child.pid)) return true
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) {
      if (error?.code === 'ESRCH') return true
      fail()
    }
    const stopWaitingAt = clock() + 1_000
    while (clock() < stopWaitingAt) {
      result = await Promise.race([close, new Promise(resolve => setTimeout(() => resolve(null), 50))])
      if (result) return true
    }
    return false
  }
  if (!result || result.status !== 0 || result.signal || overflow) {
    await cleanupGroup()
    fail()
  }
  if (Number.isSafeInteger(child.pid) && groupAlive(child.pid) && !await cleanupGroup()) fail()
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

function duplicateSafe(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1024 * 1024) fail()
  try { assertNoDuplicateJsonMembers(source); return JSON.parse(source) } catch { fail() }
}

function versionsFrom(source) {
  const values = duplicateSafe(source)
  if (!Array.isArray(values) || values.length > 100) fail()
  return values.map(value => {
    const id = value?.id
    const createdOn = value?.metadata?.created_on
    const tag = value?.annotations?.['workers/tag'] ?? ''
    const message = value?.annotations?.['workers/message'] ?? ''
    if (!UUID.test(id) || typeof createdOn !== 'string' || typeof tag !== 'string' || typeof message !== 'string') fail()
    return { id, createdOn, tag, message }
  })
}

function exactUploadMatches(inventory, tag, message) {
  if (!Array.isArray(inventory) || typeof tag !== 'string' || typeof message !== 'string') fail()
  return inventory.filter(item => item.tag === tag && item.message === message)
}

async function verifiedUploadedVersion({ candidate, invoke }) {
  if (!candidate || typeof candidate !== 'object' || typeof invoke !== 'function' || !UUID.test(candidate.id)) fail()
  configuredNamesFrom(await invoke(['versions','view',candidate.id,'--name',WORKER,'--json']), candidate.id)
  return candidate
}

async function reconcileUploadedVersion({ before, invoke, tag, message, validUntilMs, clock, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Array.isArray(before) || typeof invoke !== 'function' || typeof tag !== 'string'
    || typeof message !== 'string' || !Number.isFinite(validUntilMs) || typeof clock !== 'function'
    || typeof delay !== 'function') fail()
  const priorIds = new Set(before.map(item => item.id))
  const beforeMatches = exactUploadMatches(before, tag, message)
  const stopAt = Math.min(validUntilMs, clock() + 2_000)
  let inventory = before
  for (;;) {
    inventory = versionsFrom(await invoke(['versions','list','--name',WORKER,'--json']))
    const matches = exactUploadMatches(inventory, tag, message)
    const added = matches.filter(item => !priorIds.has(item.id))
    if (added.length === 1) return added[0]
    if (added.length > 1) fail()
    if (beforeMatches.length === 0 && matches.length === 1) return matches[0]
    const remaining = stopAt - clock()
    if (remaining < 200) fail()
    await delay(Math.min(remaining - 100, 250))
  }
}

async function resolveUploadVersion({ before, invoke, tag, message, validUntilMs, clock, delay }) {
  if (!Array.isArray(before) || typeof invoke !== 'function' || typeof tag !== 'string'
    || typeof message !== 'string' || !Number.isFinite(validUntilMs) || typeof clock !== 'function') fail()
  const existing = exactUploadMatches(before, tag, message)
  if (existing.length === 1) return verifiedUploadedVersion({ candidate: existing[0], invoke })
  if (existing.length > 1) fail()
  return verifiedUploadedVersion({
    candidate: await reconcileUploadedVersion({ before, invoke, tag, message, validUntilMs, clock, delay }),
    invoke,
  })
}

function configuredNamesFrom(source, expectedVersionId) {
  const value = duplicateSafe(source)
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== expectedVersionId
    || !value.resources || typeof value.resources !== 'object' || !Array.isArray(value.resources.bindings)
    || value.resources.bindings.length > 256) fail()
  const names = value.resources.bindings.map(binding => binding?.name)
    .filter(name => typeof name === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(name))
  if (new Set(names).size !== names.length || CONFIG_NAMES.some(name => !names.includes(name))) fail()
  return names.sort()
}

async function verifyPrivateDirectory(path, runtimeFs, expectedUid, expectedGid) {
  if (await runtimeFs.realpath(path) !== path) fail()
  const metadata = await runtimeFs.lstat(path)
  if (!metadata.isDirectory() || metadata.uid !== expectedUid || metadata.gid !== expectedGid
    || metadata.mode & 0o7077) fail()
}

async function verifyProjection({ workspace, applicationDirectory, configPath, configBytes,
  configDigest, releaseRoot, manifest, runtimeFs, expectedUid, expectedGid }) {
  await verifyPrivateDirectory(workspace, runtimeFs, expectedUid, expectedGid)
  if ((await runtimeFs.readdir(workspace)).some(entry => entry !== APPLICATION_DIRECTORY)) fail()
  await verifyPrivateDirectory(applicationDirectory, runtimeFs, expectedUid, expectedGid)
  const configEntry = manifest.entries?.find(entry => entry.path === APPLICATION_CONFIG)
  if (!configEntry) fail()
  const handle = await runtimeFs.open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    const bytes = await handle.readFile()
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.uid !== expectedUid
      || metadata.gid !== expectedGid || metadata.mode & 0o077
      || Buffer.compare(bytes, configBytes) !== 0
      || createHash('sha256').update(bytes).digest('hex') !== configDigest
      || configDigest !== configEntry.sha256) fail()
  } finally { await handle.close() }

  const createdEntries = new Set([APPLICATION_CONFIG_NAME, ...APPLICATION_LINKS])
  const entries = await runtimeFs.readdir(applicationDirectory)
  if (entries.some(entry => !createdEntries.has(entry) && entry !== '.wrangler')) fail()
  const wranglerMetadata = await runtimeFs.lstat(`${applicationDirectory}/.wrangler`)
    .catch(error => error?.code === 'ENOENT' ? undefined : fail())
  if (wranglerMetadata && (!wranglerMetadata.isDirectory() || wranglerMetadata.uid !== expectedUid
    || wranglerMetadata.gid !== expectedGid)) fail()

  for (const relativePath of APPLICATION_LINKS) {
    const manifestEntry = manifest.entries?.find(entry => entry.path === `application/${relativePath}`)
    const manifestDirectory = manifest.directories?.find(directory => directory.path === `application/${relativePath}`)
    const linkPath = `${applicationDirectory}/${relativePath}`
    const targetPath = `${releaseRoot}/application/${relativePath}`
    const linkMetadata = await runtimeFs.lstat(linkPath)
    const targetMetadata = await runtimeFs.lstat(targetPath)
    const expectedMetadata = manifestDirectory ?? manifestEntry
    const expectedType = manifestDirectory ? targetMetadata.isDirectory() : targetMetadata.isFile()
    if (!linkMetadata.isSymbolicLink() || linkMetadata.uid !== expectedUid
      || linkMetadata.gid !== expectedGid || !expectedMetadata
      || !expectedType || targetMetadata.uid !== expectedMetadata.uid
      || targetMetadata.gid !== expectedMetadata.gid
      || await runtimeFs.realpath(linkPath) !== targetPath
      || await runtimeFs.realpath(targetPath) !== targetPath) fail()
  }
}

async function removeOperationWorkspace(path, runtimeFs, expectedUid, expectedGid) {
  try {
    const metadata = await runtimeFs.lstat(path)
    if (!metadata.isDirectory() || metadata.uid !== expectedUid || metadata.gid !== expectedGid
      || metadata.mode & 0o7077 || await runtimeFs.realpath(path) !== path) fail()
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  await runtimeFs.rm(path, { recursive: true })
  if (await runtimeFs.lstat(path).then(() => true, error => {
    if (error?.code === 'ENOENT') return false
    fail()
  })) fail()
}

const receipt = body => ({ ...body, receiptSha256: createHash('sha256').update(`${JSON.stringify(body)}\n`).digest('hex') })

export async function readProtectedSecretBundle(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || await realpath(path) !== path) fail()
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.uid !== process.getuid() || metadata.mode & 0o077 || metadata.size < 3 || metadata.size > 64 * 1024) fail()
    const source = await handle.readFile('utf8'); const value = duplicateSafe(source)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length < 1
      || Object.entries(value).some(([key, secret]) => !/^[A-Z][A-Z0-9_]{1,127}$/.test(key) || typeof secret !== 'string' || !secret)) fail()
    return source
  } finally { await handle.close() }
}

export async function executeAcademyCloudflareHelper(args, options = {}) {
  const environment = options.env ?? process.env
  if (LEGACY_AMBIENT_ENV_INPUTS.some(name => environment[name] !== undefined)) fail()
  const values = parseFlags(args)
  const clock = options.clock ?? (() => Date.now())
  const { validUntilMs } = common(values, clock())
  const operation = values['--operation']
  const operationFlags = {
    inspect: ['--mode','--journal'], residue: ['--deployment','--version'],
    upload: ['--source','--traffic'], activate: ['--expected-deployment','--expected-version','--candidate','--traffic'],
    rollback: ['--expected-deployment','--expected-version','--target','--prior'], secrets: ['--secrets-file','--tag'],
  }
  const allowed = operationFlags[operation] && ['--authority','--release','--readiness','--valid-until','--operation',...operationFlags[operation]]
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
    if (!release.manifest.entries?.some(entry => entry.path === APPLICATION_CONFIG)) fail()
    const workRoot = options.workRoot ?? DEFAULT_WORK_ROOT
    const runtimeFs = options.fs ?? { lstat, mkdir, open, readdir, readFile, realpath, rm, stat, symlink }
    if (await runtimeFs.realpath(workRoot) !== workRoot) fail()
    const workMetadata = await runtimeFs.stat(workRoot)
    const expectedUid = options.processLike?.getuid() ?? process.getuid()
    const expectedGid = options.processLike?.getgid() ?? process.getgid()
    if (!workMetadata.isDirectory() || workMetadata.uid !== expectedUid || workMetadata.gid !== expectedGid
      || workMetadata.mode & 0o077) fail()
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
    await revalidate()
    let cleanup
    try {
      const configEntry = release.manifest.entries.find(entry => entry.path === APPLICATION_CONFIG)
      const sourceHandle = await runtimeFs.open(`${release.root}/${APPLICATION_CONFIG}`,
        constants.O_RDONLY | constants.O_NOFOLLOW)
      let configBytes
      try {
        const configMetadata = await sourceHandle.stat()
        configBytes = await sourceHandle.readFile()
        if (!configEntry || !configMetadata.isFile() || configMetadata.nlink !== 1
          || configMetadata.uid !== release.uid || configMetadata.gid !== release.gid
          || configMetadata.size !== configEntry.size || configBytes.length !== configEntry.size
          || createHash('sha256').update(configBytes).digest('hex') !== configEntry.sha256) fail()
      } finally { await sourceHandle.close() }
      let invocationIndex = 0
      const invoke = async (args, extra = {}) => {
        const workspaceTag = createHash('sha256')
          .update(`${values['--authority']}\n${clock()}\n${++invocationIndex}\n`)
          .digest('hex')
          .slice(0, 12)
        const workspace = `${workRoot}/application-${values['--authority']}-${workspaceTag}`
        const applicationDirectory = `${workspace}/${APPLICATION_DIRECTORY}`
        const projectedConfigPath = `${applicationDirectory}/wrangler.jsonc`
        const verifyWorkspace = () => verifyProjection({
          workspace, applicationDirectory, configPath: projectedConfigPath, configBytes,
          configDigest: configEntry.sha256, releaseRoot: release.root, manifest: release.manifest,
          runtimeFs, expectedUid, expectedGid,
        })
        const prepareWorkspace = async () => {
          await runtimeFs.mkdir(workspace, { mode: 0o700 })
          await runtimeFs.mkdir(applicationDirectory, { mode: 0o700 })
          const configHandle = await runtimeFs.open(projectedConfigPath,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
          try {
            await configHandle.writeFile(configBytes)
            await configHandle.sync()
          } finally { await configHandle.close() }
          for (const relativePath of APPLICATION_LINKS) {
            const manifestEntry = release.manifest.entries.find(entry => entry.path === `application/${relativePath}`)
            const manifestDirectory = release.manifest.directories?.find(directory => directory.path === `application/${relativePath}`)
            if ((manifestDirectory === undefined) === (manifestEntry === undefined)) fail()
            await runtimeFs.symlink(`${release.root}/application/${relativePath}`,
              `${applicationDirectory}/${relativePath}`)
          }
        }
        const removeWorkspace = () => removeOperationWorkspace(workspace, runtimeFs, expectedUid, expectedGid)
        cleanup = removeWorkspace
        try {
          await prepareWorkspace()
          await verifyWorkspace()
          const resolvedArgs = typeof args === 'function' ? args(projectedConfigPath) : args
          return await runner({ executable: release.nodeExecutable,
            args: [release.wranglerEntrypoint, ...resolvedArgs], cwd: workspace,
            deadlineMs: validUntilMs, clock,
            verify: async () => { await revalidate(); await verifyWorkspace() }, ...extra })
        } finally {
          await removeWorkspace().catch(() => {})
        }
      }
      return Object.assign(() => invoke(['deployments','list','--name',WORKER,'--json']), { invoke, cleanup: () => cleanup?.() })
    } catch (error) {
      await cleanup?.().catch(() => {})
      throw error
    }
  }
  const run = await resolveRun()
  try {
    const invoke = run.invoke ?? (async (args, extra) =>
      options.run(typeof args === 'function' ? args('/injected/application/wrangler.jsonc') : args, extra))
    const source = await run()
  const current = currentFrom(source)
    if (operation === 'inspect') {
      if (values['--mode'] === 'discover-current' && values['--journal'] === '') return { deployments: JSON.parse(source) }
      // A journal digest alone cannot prove provider cleanup. Reconciliation remains fail-closed.
      fail()
    }
    if (operation === 'residue') {
      if (current.deploymentId !== values['--deployment'] || current.versionId !== values['--version']) fail()
      const inventory = versionsFrom(await invoke(['versions','list','--name',WORKER,'--json']))
      if (!inventory.some(item => item.id === current.versionId)) fail()
      const inventorySha256 = createHash('sha256').update(`${JSON.stringify(inventory)}\n`).digest('hex')
      return receipt({ status:'PASS', deploymentId:current.deploymentId, versionId:current.versionId,
        versionCount:inventory.length, nonServingVersionCount:inventory.filter(item => item.id !== current.versionId).length, inventorySha256 })
    }
    if (operation === 'upload') {
      if (!REVISION.test(values['--source']) || values['--source'] !== values['--release'] || values['--traffic'] !== '0') fail()
      const tag = `release-${values['--source'].slice(0,12)}`; const message = `s=${values['--source'].slice(0,12)};c=${CONFIG_SHA.slice(0,12)}`
      const before = versionsFrom(await invoke(['versions','list','--name',WORKER,'--json']))
      const existing = exactUploadMatches(before, tag, message)
      if (existing.length > 1) fail()
      if ((await invoke(['--version'])).trim() !== WRANGLER_VERSION) fail()
      let uploaded
      if (existing.length === 1) {
        uploaded = await verifiedUploadedVersion({ candidate: existing[0], invoke })
      } else {
        try {
          await invoke(configPath => ['versions','upload','--config',configPath,
            '--name',WORKER,'--tag',tag,'--message',message,'--keep-vars','--strict','--install-skills=false'])
        } catch {
          uploaded = await resolveUploadVersion({
            before, invoke, tag, message, validUntilMs, clock, delay: options.delay,
          })
        }
        uploaded ??= await resolveUploadVersion({
          before, invoke, tag, message, validUntilMs, clock, delay: options.delay,
        })
      }
      return receipt({ status:'PASS', workerName:WORKER, versionId:uploaded.id, sourceRevision:values['--source'], trafficPercentage:0, configuredNamesSha256:CONFIG_SHA })
    }
    if (operation === 'secrets') {
      const bundle = await readProtectedSecretBundle(values['--secrets-file'])
      await invoke(['versions','secret','bulk','--name',WORKER,'--tag',values['--tag']], { stdin: bundle })
      return receipt({ status:'PASS', workerName:WORKER, secretNames:Object.keys(duplicateSafe(bundle)).sort() })
    }
    if (operation === 'activate' || operation === 'rollback') {
      const expectedDeployment = values['--expected-deployment']; const expectedVersion = values['--expected-version']
      const target = operation === 'activate' ? values['--candidate'] : values['--target']
      if (!UUID.test(expectedDeployment) || !UUID.test(expectedVersion) || !UUID.test(target)
        || (operation === 'activate' && values['--traffic'] !== '100') || (operation === 'rollback' && !UUID.test(values['--prior']))) fail()
      if (current.deploymentId !== expectedDeployment || current.versionId !== expectedVersion) fail()
      await invoke(['versions','deploy',`${target}@100`,'--name',WORKER,'--message',`${operation};expected=${expectedDeployment}`,'--yes'])
      const after = currentFrom(await run())
      if (after.versionId !== target || after.deploymentId === expectedDeployment) fail()
      const semantics = { concurrencyControl:'optimistic-precondition-and-postcondition', atomicProviderCas:false, residualRace:true }
      return operation === 'activate'
        ? receipt({ status:'PASS', previousDeploymentId:expectedDeployment, previousVersionId:expectedVersion, deploymentId:after.deploymentId, activeVersionId:target, trafficPercentage:100, semantics })
        : receipt({ status:'ROLLED_BACK', observedActiveDeploymentId:expectedDeployment, observedActiveVersionId:expectedVersion, deploymentId:after.deploymentId, restoredVersionId:target, semantics })
    }
    fail()
  } finally {
    if (run.cleanup) await run.cleanup()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeAcademyCloudflareHelper(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(() => {
    process.stderr.write('Academy production helper failed\n')
    process.exitCode = 1
  })
}
