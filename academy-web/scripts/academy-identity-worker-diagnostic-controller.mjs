#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertNoDuplicateJsonMembers, parseCurrentDeploymentJson } from './current-deployment.mjs'

const WORKER = 'cyberskills-academy'
const CANONICAL_ORIGIN = 'https://academy.cyberskills.co.th'
const ACCESS_HOST = 'dry-grass-c390.cloudflareaccess.com'
const DIAGNOSTIC_PATH = '/.well-known/academy-ops/identity-client-assertion-custody-v1'
const DIAGNOSTIC_URL = `${CANONICAL_ORIGIN}${DIAGNOSTIC_PATH}`
const DIAGNOSTIC_OPERATION = 'academy-custody-recovery-20260903-v1'
const NONCE_BINDING = 'ACADEMY_IDENTITY_DIAGNOSTIC_NONCE'
const ASSERTION_BINDING = 'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK'
const VERSION_METADATA_BINDING = 'CF_VERSION_METADATA'
const WRANGLER_VERSION = '4.120.0'
const CLOUDFLARED_VERSION = '2026.6.0'
const NODE_VERSION = 'v25.5.0'
const NODE_SHA256 = '9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188'
const WRANGLER_CLI_SHA256 = '9f0469b1e826fd5b76232cd557047fbb30b94e4fd1de65d23e65a3641bd7e7a7'
const CLOUDFLARED_SHA256 = 'c994e7d1096202a7937b485610f1c80ca69cfd822de945ce8d167e6856a2c09e'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const REVISION = /^[a-f0-9]{40}$/
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/
const ACCESS_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const MAX_JSON_BYTES = 1024 * 1024
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024
const TRANSACTION_TIMEOUT_MS = 180_000
const RECOVERY_RESERVE_MS = 60_000
const COMMAND_TIMEOUT_MS = 30_000
const ACCESS_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
const FIXED_MARKERS = new Set([
  'PASS_CODE_NOT_FOUND',
  'FAIL_BINDING',
  'FAIL_IMPORT',
  'FAIL_FINGERPRINT',
  'FAIL_SIGN_VERIFY',
  'FAIL_ASSERTION',
  'FAIL_ADMISSION',
])
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM']
const SOURCE_PATHS = Object.freeze([
  'worker/identity-client-assertion-secret-diagnostic.ts',
  'wrangler.identity-client-assertion-diagnostic.jsonc',
  'src/lib/identity/client-assertion-provider.ts',
  'src/lib/identity/client-assertion-webcrypto-signer.ts',
  'scripts/current-deployment.mjs',
  'scripts/academy-identity-worker-diagnostic-controller.mjs',
  'package-lock.json',
])

export const ACADEMY_IDENTITY_WORKER_DIAGNOSTIC_TRANSACTION = Object.freeze({
  worker: WORKER,
  url: DIAGNOSTIC_URL,
  operation: DIAGNOSTIC_OPERATION,
  nonceBinding: NONCE_BINDING,
  assertionBinding: ASSERTION_BINDING,
  wranglerVersion: WRANGLER_VERSION,
  cloudflaredVersion: CLOUDFLARED_VERSION,
})

const fail = () => { throw new Error('Academy Identity Worker diagnostic transaction failed') }

export async function runAcademyIdentityWorkerDiagnosticTransaction(options = {}) {
  const ports = options.ports ?? createAcademyIdentityWorkerDiagnosticProductionPorts(options)
  assertPorts(ports)
  const clock = options.clock ?? (() => Date.now())
  const nonceSource = options.nonceSource ?? (() => randomBytes(32))
  const operationIdSource = options.operationIdSource ?? randomUUID
  const signalSource = options.signalSource ?? process
  const startedAt = clock()
  const deadlineMs = startedAt + TRANSACTION_TIMEOUT_MS
  const expectedBaseline = validateExpectedBaseline(options.expectedBaseline)
  const expectedSource = validateSource(options.expectedSource)
  if (!Number.isSafeInteger(startedAt)) fail()

  let nonce = Buffer.from(nonceSource())
  const operationId = operationIdSource()
  if (nonce.byteLength !== 32 || !UUID.test(operationId)) {
    nonce.fill(0)
    fail()
  }

  const abortController = new AbortController()
  let receivedSignal = null
  const listeners = new Map()
  for (const signal of SIGNALS) {
    const listener = () => {
      receivedSignal ??= signal
      abortController.abort()
    }
    listeners.set(signal, listener)
    signalSource.on(signal, listener)
  }

  let source = null
  let baseline = null
  let baselineHealth = null
  let candidate = null
  let uploadAttempted = false
  let splitAttempted = false
  let splitDeploymentId = null
  let restoredDeploymentId = null
  let marker = null
  let requestCount = 0
  let primaryFailure = null
  let recoveryFailure = null

  const guard = () => {
    if (receivedSignal || abortController.signal.aborted
      || clock() >= deadlineMs - RECOVERY_RESERVE_MS) fail()
  }
  const step = async (operation) => {
    guard()
    const value = await operation(abortController.signal, deadlineMs - RECOVERY_RESERVE_MS)
    guard()
    return value
  }

  try {
    source = validateSource(await step((signal, deadline) => ports.verifySource({ signal, deadline })))
    if (source.revision !== expectedSource.revision || source.sha256 !== expectedSource.sha256) fail()
    baseline = validateSingleDeployment(await step((signal, deadline) => ports.inspectDeployment({ signal, deadline })))
    if (baseline.deploymentId !== expectedBaseline.deploymentId
      || baseline.versionId !== expectedBaseline.versionId) fail()
    const baselineVersion = validateVersion(await step((signal, deadline) => ports.inspectVersion({
      versionId: baseline.versionId,
      signal,
      deadline,
    })), baseline.versionId)
    if (!baselineVersion.bindings.some(binding => binding.name === ASSERTION_BINDING && binding.type === 'secret_text')) fail()
    baselineHealth = validateHealth(await step((signal, deadline) => ports.capturePublicHealth({ signal, deadline })))
    await step((signal, deadline) => ports.prepareAccess({ signal, deadline }))

    uploadAttempted = true
    candidate = validateCandidate(await step((signal, deadline) => ports.uploadCandidate({
      baseline,
      baselineVersion,
      nonce,
      operationId,
      source,
      signal,
      deadline,
    })), baseline)
    await step((signal, deadline) => ports.revalidateSource({ expected: source, signal, deadline }))
    assertSameSingleDeployment(
      await step((signal, deadline) => ports.inspectDeployment({ signal, deadline })),
      baseline,
    )

    splitAttempted = true
    const split = validateSplitDeployment(await step((signal, deadline) => ports.deployZeroPercentCandidate({
      baseline,
      candidate,
      signal,
      deadline,
    })), baseline, candidate)
    splitDeploymentId = split.deploymentId
    validateSplitDeployment(
      await step((signal, deadline) => ports.inspectDeployment({ signal, deadline })),
      baseline,
      candidate,
      splitDeploymentId,
    )
    const splitHealth = validateHealth(await step((signal, deadline) => ports.capturePublicHealth({ signal, deadline })))
    if (!sameHealth(baselineHealth, splitHealth)) fail()

    if (requestCount !== 0) fail()
    requestCount += 1
    marker = await step((signal, deadline) => ports.invokeCandidateOnce({
      candidate,
      nonce,
      signal,
      deadline,
    }))
    if (!FIXED_MARKERS.has(marker) || requestCount !== 1) fail()
  } catch (error) {
    primaryFailure = error
  } finally {
    const recoveryErrors = []
    const recover = async operation => {
      try { return await operation() } catch (error) { recoveryErrors.push(error); return null }
    }
    await recover(async () => {
      if (baseline && uploadAttempted && !candidate && source) {
        const reconciled = await ports.reconcileOwnedCandidate({
          baseline,
          operationId,
          source,
          deadline: deadlineMs,
        })
        if (reconciled) candidate = validateCandidate(reconciled, baseline)
      }
    })
    await recover(async () => {
      if (baseline && candidate && splitAttempted) {
        const restored = validateRestoredDeployment(await ports.restoreBaseline({
          baseline,
          candidate,
          splitDeploymentId,
          deadline: deadlineMs,
        }), baseline, splitDeploymentId)
        restoredDeploymentId = restored.deploymentId
      }
    })
    await recover(async () => {
      if (baseline) {
        const finalDeployment = splitAttempted
          ? validateRestoredDeployment(
            await ports.inspectDeployment({ deadline: deadlineMs }), baseline, splitDeploymentId,
          )
          : validateOriginalSingleDeployment(
            await ports.inspectDeployment({ deadline: deadlineMs }), baseline,
          )
        restoredDeploymentId ??= finalDeployment.deploymentId
      }
    })
    await recover(async () => {
      if (baseline && baselineHealth) {
        const finalHealth = validateHealth(await ports.capturePublicHealth({ deadline: deadlineMs }))
        if (!sameHealth(baselineHealth, finalHealth)) fail()
      }
    })
    await recover(async () => {
      if (baseline && candidate) {
        await ports.verifyCandidateDetached({
          baseline,
          candidate,
          restoredDeploymentId,
          deadline: deadlineMs,
        })
      }
    })
    await recover(() => ports.close())
    recoveryFailure = recoveryErrors.length > 0 ? new Error('recovery failed') : null
    nonce.fill(0)
    nonce = Buffer.alloc(0)
    for (const [signal, listener] of listeners) signalSource.off(signal, listener)
  }

  if (primaryFailure || recoveryFailure || receivedSignal || !source || !baseline || !candidate
    || !marker || requestCount !== 1) fail()
  return Object.freeze({
    status: 'COMPLETE_BASELINE_RESTORED',
    marker,
    sourceRevision: source.revision,
    sourceSha256: source.sha256,
    baselineDeploymentId: baseline.deploymentId,
    baselineVersionId: baseline.versionId,
    candidateVersionId: candidate.versionId,
    splitDeploymentId,
    restoredDeploymentId,
    requestCount,
    candidateState: 'INACTIVE_IMMUTABLE_VERSION_RETAINED',
  })
}

export function createAcademyIdentityWorkerDiagnosticProductionPorts(options = {}) {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const wrangler = options.wrangler ?? resolve(root, 'node_modules/wrangler/wrangler-dist/cli.js')
  const cloudflared = options.cloudflared ?? '/opt/homebrew/Cellar/cloudflared/2026.6.0/bin/cloudflared'
  const node = options.node ?? process.execPath
  const run = options.runProcess ?? runBoundedProcess
  const fetchPort = options.fetchPort ?? globalThis.fetch
  const delay = options.delay ?? (milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)))
  const clock = options.clock ?? (() => Date.now())
  let accessToken = null
  let accessTokenBytes = null
  let sourceSnapshot = null
  let invocationCount = 0

  const verifyToolchain = async () => {
    if (process.version !== NODE_VERSION
      || await fileSha256(node, 160 * 1024 * 1024) !== NODE_SHA256
      || await fileSha256(wrangler, 32 * 1024 * 1024) !== WRANGLER_CLI_SHA256
      || await fileSha256(cloudflared, 48 * 1024 * 1024) !== CLOUDFLARED_SHA256) fail()
  }

  const runCommand = async ({ executable, args, signal, deadline, secretInput, sensitiveOutput = false }) => {
    const result = await run({
      executable,
      args,
      cwd: root,
      signal,
      deadlineMs: Math.min(deadline ?? clock() + COMMAND_TIMEOUT_MS, clock() + COMMAND_TIMEOUT_MS),
      secretInput,
      sensitiveOutput,
      clock,
    })
    if (!result || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) fail()
    return result.stdout
  }

  const runWrangler = async (args, context = {}) => runCommand({
    executable: node,
    args: [wrangler, ...args],
    ...context,
  })

  const inspectDeployment = async ({ signal, deadline } = {}) => deploymentFrom(await runWrangler([
    'deployments', 'list', '--name', WORKER, '--json', '--install-skills=false',
  ], { signal, deadline }))

  const inspectVersion = async ({ versionId, signal, deadline }) => versionFrom(await runWrangler([
    'versions', 'view', versionId, '--name', WORKER, '--json', '--install-skills=false',
  ], { signal, deadline }), versionId)

  const listVersions = async ({ signal, deadline } = {}) => versionsFrom(await runWrangler([
    'versions', 'list', '--name', WORKER, '--json', '--install-skills=false',
  ], { signal, deadline }))

  const verifySource = async ({ signal, deadline } = {}) => {
    await verifyToolchain()
    const revision = singleLine(await runCommand({
      executable: '/usr/bin/git', args: ['-C', root, 'rev-parse', 'HEAD'], signal, deadline,
    }))
    if (!REVISION.test(revision)) fail()
    const status = (await runCommand({
      executable: '/usr/bin/git', args: ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], signal, deadline,
    })).toString('utf8')
    const statusLines = status.split('\n').filter(Boolean)
    if (statusLines.some(line => !line.startsWith('?? .wrangler/'))) fail()
    const sha256 = await sourceDigest(root)
    const value = { revision, sha256 }
    sourceSnapshot ??= value
    if (sourceSnapshot.revision !== value.revision || sourceSnapshot.sha256 !== value.sha256) fail()
    return value
  }

  return Object.freeze({
    verifySource,
    async revalidateSource({ expected, signal, deadline }) {
      const observed = await verifySource({ signal, deadline })
      if (observed.revision !== expected.revision || observed.sha256 !== expected.sha256) fail()
    },
    async prepareAccess({ signal, deadline }) {
      const version = singleLine(await runCommand({
        executable: cloudflared, args: ['--version'], signal, deadline,
      }))
      if (!version.startsWith(`cloudflared version ${CLOUDFLARED_VERSION} `)) fail()
      const output = await runCommand({
        executable: cloudflared,
        args: ['access', 'token', '--app', CANONICAL_ORIGIN],
        signal,
        deadline: Math.min(deadline, clock() + ACCESS_TIMEOUT_MS),
        sensitiveOutput: true,
      })
      accessTokenBytes = Buffer.from(output)
      output.fill(0)
      const token = accessTokenBytes.toString('ascii').trim()
      if (token.length > 8_192 || !ACCESS_TOKEN.test(token)) fail()
      accessToken = token
    },
    inspectDeployment,
    inspectVersion,
    async capturePublicHealth({ signal, deadline } = {}) {
      const rootHealth = await publicHealth('/', { fetchPort, signal, deadline, clock })
      const callbackHealth = await publicHealth('/auth/callback', { fetchPort, signal, deadline, clock })
      return { root: rootHealth, callback: callbackHealth }
    },
    async uploadCandidate({ baseline, baselineVersion, nonce, operationId, source, signal, deadline }) {
      await verifySource({ signal, deadline })
      const reportedWranglerVersion = singleLine(await runWrangler(['--version'], { signal, deadline }))
      if (reportedWranglerVersion !== WRANGLER_VERSION) fail()
      const before = await listVersions({ signal, deadline })
      if (!before.some(version => version.id === baseline.versionId)) fail()
      const { tag, message } = candidateIdentity(source, operationId)
      const nonceText = nonce.toString('base64url')
      if (!BASE64URL_32.test(nonceText)) fail()
      const secretInput = Buffer.from(JSON.stringify({ [NONCE_BINDING]: nonceText }))
      let uploadFailed = false
      try {
        await runWrangler([
          'versions', 'upload', '--config', resolve(root, 'wrangler.identity-client-assertion-diagnostic.jsonc'),
          '--name', WORKER, '--tag', tag, '--message', message,
          '--secrets-file', '/dev/fd/3', '--strict', '--install-skills=false',
        ], { signal, deadline, secretInput })
      } catch {
        uploadFailed = true
      } finally {
        secretInput.fill(0)
      }
      const priorIds = new Set(before.map(version => version.id))
      let matches = []
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const after = await listVersions({ signal: uploadFailed ? undefined : signal, deadline })
        matches = after.filter(version => !priorIds.has(version.id)
          && version.tag === tag && version.message === message)
        if (matches.length === 1) break
        if (matches.length > 1 || attempt === 4) fail()
        await delay(250)
      }
      const candidateVersion = await inspectVersion({ versionId: matches[0].id, signal, deadline })
      assertCandidateBindings(baselineVersion.bindings, candidateVersion.bindings)
      return {
        versionId: candidateVersion.versionId,
        tag,
        messageSha256: createHash('sha256').update(message).digest('hex'),
      }
    },
    async reconcileOwnedCandidate({ baseline, operationId, source, deadline }) {
      const { tag, message } = candidateIdentity(source, operationId)
      const matches = (await listVersions({ deadline })).filter(version => (
        version.id !== baseline.versionId && version.tag === tag && version.message === message
      ))
      if (matches.length > 1) fail()
      if (matches.length === 0) return null
      return {
        versionId: matches[0].id,
        tag,
        messageSha256: createHash('sha256').update(message).digest('hex'),
      }
    },
    async deployZeroPercentCandidate({ baseline, candidate, signal, deadline }) {
      assertSameSingleDeployment(await inspectDeployment({ signal, deadline }), baseline)
      await verifySource({ signal, deadline })
      await runWrangler([
        'versions', 'deploy', `${baseline.versionId}@100`, `${candidate.versionId}@0`,
        '--name', WORKER, '--message', `diagnostic split ${candidate.tag}`, '--yes',
        '--install-skills=false',
      ], { signal, deadline })
      return inspectDeployment({ signal, deadline })
    },
    async invokeCandidateOnce({ candidate, nonce, signal, deadline }) {
      if (invocationCount !== 0 || !accessToken || !ACCESS_TOKEN.test(accessToken)) fail()
      invocationCount += 1
      const nonceText = nonce.toString('base64url')
      if (!BASE64URL_32.test(nonceText)) fail()
      const response = await boundedFetch(fetchPort, DIAGNOSTIC_URL, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'cf-access-token': accessToken,
          'cloudflare-workers-version-overrides': `${WORKER}="${candidate.versionId}"`,
          origin: CANONICAL_ORIGIN,
          'sec-fetch-site': 'same-origin',
          'x-academy-diagnostic-nonce': nonceText,
          'x-academy-diagnostic-operation': DIAGNOSTIC_OPERATION,
          'x-academy-diagnostic-version': candidate.versionId,
        },
      }, { signal, deadline: Math.min(deadline, clock() + REQUEST_TIMEOUT_MS), clock })
      if (response.url !== DIAGNOSTIC_URL || response.redirected
        || response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/plain'
        || response.headers.get('cache-control') !== 'no-store') fail()
      const body = await boundedText(response, 128)
      const match = /^ACADEMY_IDENTITY_WORKER_DIAGNOSTIC=([A-Z_]+)\n$/.exec(body)
      if (!match || !FIXED_MARKERS.has(match[1])) fail()
      const expectedStatus = match[1] === 'PASS_CODE_NOT_FOUND' ? 200 : 503
      if (response.status !== expectedStatus) fail()
      return match[1]
    },
    async restoreBaseline({ baseline, candidate, splitDeploymentId, deadline }) {
      const current = await inspectDeployment({ deadline })
      if (isOriginalSingleDeployment(current, baseline)) return current
      validateSplitDeployment(current, baseline, candidate, splitDeploymentId)
      await verifyToolchain()
      await runWrangler([
        'versions', 'deploy', `${baseline.versionId}@100`, '--name', WORKER,
        '--message', `diagnostic restore ${candidate.tag}`, '--yes', '--install-skills=false',
      ], { deadline })
      return validateRestoredDeployment(await inspectDeployment({ deadline }), baseline, splitDeploymentId)
    },
    async verifyCandidateDetached({ baseline, candidate, restoredDeploymentId, deadline }) {
      validateRestoredDeployment(await inspectDeployment({ deadline }), baseline, null, restoredDeploymentId)
      const versions = await listVersions({ deadline })
      const owned = versions.filter(version => version.id === candidate.versionId
        && version.tag === candidate.tag
        && createHash('sha256').update(version.message).digest('hex') === candidate.messageSha256)
      if (owned.length !== 1) fail()
      // Cloudflare exposes no single-Version deletion API. The immutable owned
      // version is retained but unreachable because Version Overrides only
      // select Versions in the active deployment.
    },
    async close() {
      accessToken = null
      accessTokenBytes?.fill(0)
      accessTokenBytes = null
    },
  })
}

export async function computeAcademyIdentityWorkerDiagnosticSourceSha256(root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
)) {
  return sourceDigest(root)
}

export async function runBoundedProcess({ executable, args, cwd, signal, deadlineMs,
  secretInput, clock = () => Date.now() }) {
  if (typeof executable !== 'string' || !executable.startsWith('/')
    || !Array.isArray(args) || args.some(argument => typeof argument !== 'string')
    || typeof cwd !== 'string' || !cwd.startsWith('/') || !Number.isFinite(deadlineMs)) fail()
  const remaining = deadlineMs - clock()
  if (remaining < 100) fail()
  const withSecret = Buffer.isBuffer(secretInput)
  const environment = { ...process.env, LANG: 'C', LC_ALL: 'C', NO_COLOR: '1' }
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  const child = spawn(executable, args, {
    cwd,
    detached: true,
    stdio: withSecret ? ['ignore', 'pipe', 'ignore', 'pipe'] : ['ignore', 'pipe', 'ignore'],
    env: environment,
  })
  const chunks = []
  let size = 0
  let overflow = false
  let terminationFailed = false
  const terminate = () => {
    try { killGroup(child.pid) } catch { terminationFailed = true }
  }
  child.stdout.on('data', chunk => {
    size += chunk.byteLength
    if (size > MAX_PROCESS_OUTPUT_BYTES) {
      if (!overflow) terminate()
      overflow = true
    }
    else chunks.push(chunk)
  })
  if (withSecret) child.stdio[3].end(secretInput)
  const closed = new Promise(resolveClose => {
    child.once('error', () => resolveClose(null))
    child.once('close', (status, closeSignal) => resolveClose({ status, signal: closeSignal }))
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    terminate()
  }, Math.min(remaining, COMMAND_TIMEOUT_MS))
  const abort = () => terminate()
  signal?.addEventListener('abort', abort, { once: true })
  const result = await closed
  clearTimeout(timeout)
  signal?.removeEventListener('abort', abort)
  if (groupAlive(child.pid)) {
    terminate()
    fail()
  }
  if (!result || timedOut || signal?.aborted || overflow || terminationFailed
    || result.status !== 0 || result.signal) fail()
  return { ...result, stdout: Buffer.concat(chunks) }
}

function killGroup(pid) {
  if (!Number.isSafeInteger(pid)) return
  try { process.kill(-pid, 'SIGKILL') } catch (error) {
    if (error?.code !== 'ESRCH') fail()
  }
}

function groupAlive(pid) {
  if (!Number.isSafeInteger(pid)) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    fail()
  }
}

function assertPorts(ports) {
  for (const name of [
    'verifySource', 'revalidateSource', 'prepareAccess', 'inspectDeployment', 'inspectVersion',
    'capturePublicHealth', 'uploadCandidate', 'deployZeroPercentCandidate', 'invokeCandidateOnce',
    'reconcileOwnedCandidate', 'restoreBaseline', 'verifyCandidateDetached', 'close',
  ]) if (typeof ports?.[name] !== 'function') fail()
}

function validateSource(value) {
  if (!exact(value, ['revision', 'sha256']) || !REVISION.test(value.revision)
    || !/^[a-f0-9]{64}$/.test(value.sha256)) fail()
  return value
}

function validateExpectedBaseline(value) {
  if (!exact(value, ['deploymentId', 'versionId']) || !UUID.test(value.deploymentId)
    || !UUID.test(value.versionId)) fail()
  return value
}

function validateSingleDeployment(value) {
  if (!exact(value, ['deploymentId', 'versions']) || !UUID.test(value.deploymentId)
    || !Array.isArray(value.versions) || value.versions.length !== 1
    || !exact(value.versions[0], ['versionId', 'percentage'])
    || !UUID.test(value.versions[0].versionId) || value.versions[0].percentage !== 100) fail()
  return { deploymentId: value.deploymentId, versionId: value.versions[0].versionId }
}

function isOriginalSingleDeployment(value, baseline) {
  try {
    const observed = validateSingleDeployment(value)
    return observed.deploymentId === baseline.deploymentId && observed.versionId === baseline.versionId
  } catch {
    return false
  }
}

function validateOriginalSingleDeployment(value, baseline) {
  if (!isOriginalSingleDeployment(value, baseline)) fail()
  return value
}

function assertSameSingleDeployment(value, baseline) {
  validateOriginalSingleDeployment(value, baseline)
}

function validateRestoredDeployment(value, baseline, splitDeploymentId, expectedDeploymentId) {
  const observed = validateSingleDeployment(value)
  if (observed.versionId !== baseline.versionId
    || (splitDeploymentId && observed.deploymentId === splitDeploymentId)
    || (expectedDeploymentId && observed.deploymentId !== expectedDeploymentId)) fail()
  return {
    deploymentId: observed.deploymentId,
    versions: [{ versionId: observed.versionId, percentage: 100 }],
  }
}

function validateSplitDeployment(value, baseline, candidate, expectedDeploymentId) {
  if (!exact(value, ['deploymentId', 'versions']) || !UUID.test(value.deploymentId)
    || value.deploymentId === baseline.deploymentId
    || (expectedDeploymentId && value.deploymentId !== expectedDeploymentId)
    || !Array.isArray(value.versions) || value.versions.length !== 2) fail()
  const versions = [...value.versions].sort((left, right) => left.versionId.localeCompare(right.versionId))
  const expected = [
    { versionId: baseline.versionId, percentage: 100 },
    { versionId: candidate.versionId, percentage: 0 },
  ].sort((left, right) => left.versionId.localeCompare(right.versionId))
  if (JSON.stringify(versions) !== JSON.stringify(expected)) fail()
  return value
}

function validateVersion(value, expectedVersionId) {
  if (!exact(value, ['versionId', 'bindings']) || value.versionId !== expectedVersionId
    || !Array.isArray(value.bindings) || value.bindings.length > 256
    || value.bindings.some(binding => !exact(binding, ['name', 'type'])
      || typeof binding.name !== 'string' || typeof binding.type !== 'string')) fail()
  const keys = value.bindings.map(binding => `${binding.name}:${binding.type}`)
  if (new Set(keys).size !== keys.length) fail()
  return value
}

function validateCandidate(value, baseline) {
  if (!exact(value, ['versionId', 'tag', 'messageSha256']) || !UUID.test(value.versionId)
    || value.versionId === baseline.versionId
    || !/^academy-secret-diagnostic-[a-f0-9]{10}-[0-9a-f]{8}$/.test(value.tag)
    || !/^[a-f0-9]{64}$/.test(value.messageSha256)) fail()
  return value
}

function candidateIdentity(source, operationId) {
  if (!source || !REVISION.test(source.revision) || !UUID.test(operationId)) fail()
  return {
    tag: `academy-secret-diagnostic-${source.revision.slice(0, 10)}-${operationId.slice(0, 8)}`,
    message: `academy identity secret diagnostic ${operationId}`,
  }
}

function validateHealth(value) {
  if (!exact(value, ['root', 'callback'])
    || !['ACCESS_302', 'ACCESS_401'].includes(value.root)
    || value.callback !== value.root) fail()
  return value
}

function sameHealth(left, right) {
  return left.root === right.root && left.callback === right.callback
}

function exact(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === keys.length
    && Reflect.ownKeys(value).every((key, index) => key === keys[index])
}

function duplicateSafeJson(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength > MAX_JSON_BYTES) fail()
  const source = buffer.toString('utf8')
  assertNoDuplicateJsonMembers(source)
  try { return JSON.parse(source) } catch { fail() }
}

function deploymentFrom(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength > MAX_JSON_BYTES) fail()
  const current = parseCurrentDeploymentJson(buffer.toString('utf8'))
  if (!UUID.test(current.id) || current.versions.length > 2) fail()
  const versions = current.versions.map(version => ({ versionId: version.id, percentage: version.percentage }))
  if (new Set(versions.map(version => version.versionId)).size !== versions.length
    || versions.reduce((sum, version) => sum + version.percentage, 0) !== 100) fail()
  return { deploymentId: current.id, versions }
}

function versionFrom(buffer, expectedVersionId) {
  const value = duplicateSafeJson(buffer)
  const bindings = value?.resources?.bindings
  if (value?.id !== expectedVersionId || !Array.isArray(bindings)) fail()
  return validateVersion({
    versionId: value.id,
    bindings: bindings.map(binding => ({ name: binding?.name, type: binding?.type })),
  }, expectedVersionId)
}

function versionsFrom(buffer) {
  const values = duplicateSafeJson(buffer)
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) fail()
  return values.map(value => {
    const id = value?.id
    const tag = value?.annotations?.['workers/tag'] ?? ''
    const message = value?.annotations?.['workers/message'] ?? ''
    if (!UUID.test(id) || typeof tag !== 'string' || typeof message !== 'string') fail()
    return { id, tag, message }
  })
}

function assertCandidateBindings(baselineBindings, candidateBindings) {
  const baselineSecrets = baselineBindings
    .filter(binding => binding.type === 'secret_text')
    .map(binding => binding.name)
    .sort()
  if (!baselineSecrets.includes(ASSERTION_BINDING)) fail()
  const expected = [...baselineSecrets, NONCE_BINDING].sort()
  const candidateSecrets = candidateBindings
    .filter(binding => binding.type === 'secret_text')
    .map(binding => binding.name)
    .sort()
  const candidateNonSecrets = candidateBindings
    .filter(binding => binding.type !== 'secret_text')
  if (JSON.stringify(candidateSecrets) !== JSON.stringify(expected)
    || candidateNonSecrets.length !== 1
    || candidateNonSecrets[0].name !== VERSION_METADATA_BINDING
    || candidateNonSecrets[0].type !== 'version_metadata') fail()
}

async function sourceDigest(root) {
  const hash = createHash('sha256')
  for (const path of [...SOURCE_PATHS].sort()) {
    const absolute = resolve(root, path)
    if (!absolute.startsWith(`${root}/`) || await realpath(absolute) !== absolute) fail()
    const metadata = await stat(absolute)
    if (!metadata.isFile() || metadata.size > 2 * MAX_JSON_BYTES) fail()
    hash.update(`${path}\0`)
    hash.update(await readFile(absolute))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function fileSha256(path, maximumBytes) {
  if (typeof path !== 'string' || !path.startsWith('/') || await realpath(path) !== path) fail()
  const metadata = await stat(path)
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximumBytes || metadata.mode & 0o022) fail()
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function publicHealth(path, { fetchPort, signal, deadline, clock }) {
  const url = `${CANONICAL_ORIGIN}${path}`
  const response = await boundedFetch(fetchPort, url, {
    method: 'GET', redirect: 'manual',
  }, { signal, deadline, clock })
  await response.body?.cancel().catch(() => {})
  if (response.url !== url || response.redirected) fail()
  if (response.status === 401) return 'ACCESS_401'
  if (response.status !== 302) fail()
  const location = response.headers.get('location')
  let target
  try { target = new URL(location) } catch { fail() }
  if (target.protocol !== 'https:' || target.hostname !== ACCESS_HOST
    || !target.pathname.startsWith('/cdn-cgi/access/login/academy.cyberskills.co.th')) fail()
  return 'ACCESS_302'
}

async function boundedFetch(fetchPort, url, init, { signal, deadline, clock }) {
  if (typeof fetchPort !== 'function' || !Number.isFinite(deadline)) fail()
  const remaining = Math.min(REQUEST_TIMEOUT_MS, deadline - clock())
  if (remaining < 100) fail()
  const timeout = AbortSignal.timeout(remaining)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetchPort(url, { ...init, signal: combined })
  if (!(response instanceof Response)) fail()
  return response
}

async function boundedText(response, maximum) {
  if (!response.body) fail()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
    if (size > maximum) {
      await reader.cancel()
      fail()
    }
    chunks.push(result.value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))))
}

function singleLine(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength > 16_384) fail()
  const value = buffer.toString('utf8').trim()
  if (!value || value.includes('\n') || value.includes('\r')) fail()
  return value
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null
if (entrypoint === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 8 || args[0] !== '--expected-deployment'
    || args[2] !== '--expected-version' || args[4] !== '--expected-source-revision'
    || args[6] !== '--expected-source-sha256' || !UUID.test(args[1]) || !UUID.test(args[3])
    || !REVISION.test(args[5]) || !/^[a-f0-9]{64}$/.test(args[7])) {
    process.stderr.write('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC_TRANSACTION=FAILED\n')
    process.exitCode = 1
  } else {
    runAcademyIdentityWorkerDiagnosticTransaction({
      expectedBaseline: { deploymentId: args[1], versionId: args[3] },
      expectedSource: { revision: args[5], sha256: args[7] },
    }).then(result => {
      process.stdout.write(`ACADEMY_IDENTITY_WORKER_DIAGNOSTIC_TRANSACTION=${result.marker}\n`)
    }).catch(() => {
      process.stderr.write('ACADEMY_IDENTITY_WORKER_DIAGNOSTIC_TRANSACTION=FAILED\n')
      process.exitCode = 1
    })
  }
}
