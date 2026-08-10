import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PINNED_DOCKER_CLI = '/usr/local/bin/docker'
const PINNED_DOCKER_CLI_TARGET = '/Applications/Docker.app/Contents/Resources/bin/docker'
const PINNED_DOCKER_SOCKET = '/var/run/docker.sock'
const IMAGE_REPO_DIGEST = 'postgres@sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302'
const IMAGE_ID = 'sha256:aadf2c0696f5ef357aa7a68da995137f0cf17bad0bf6e1f17de06ae5c769b302'
const IMAGE_ARCHITECTURE = 'arm64'
const IMAGE_METADATA_FORMAT = '{{json .Id}}\t{{json .RepoDigests}}\t{{json .Architecture}}'
const MINIMAL_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const DOCKER_TIMEOUT_MS = 5_000
const CLEANUP_ATTEMPTS = 3
const DATABASE = 'academy_identity_lifecycle_test'
const USERNAME = 'academy_identity_lifecycle_test'
const OWNER_LABEL = 'com.cyberskills.test-run'
const FIXED_OWNER_LABEL = 'com.cyberskills.test'
const FIXED_OWNER_VALUE = 'academy-identity-lifecycle-page-store'
const EVIDENCE_ENVIRONMENT_KEYS = [
  'ACADEMY_IDENTITY_LIFECYCLE_DISPOSABLE',
  'ACADEMY_IDENTITY_LIFECYCLE_TEST_DATABASE_URL',
  'ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_ID',
  'ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_NAME',
  'ACADEMY_IDENTITY_LIFECYCLE_IMAGE_ID',
]

const genericAuthorityKeys = new Set([
  'TEST_DATABASE_URL',
  'DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
])

export function assertNoAmbientContainerAuthority(environment) {
  assertNoAmbientDockerOrDatabaseAuthority(environment)
  for (const name of EVIDENCE_ENVIRONMENT_KEYS) {
    if (environment[name]) {
      throw new Error(`${name} is not accepted by the disposable lifecycle test harness`)
    }
  }
}

function assertNoAmbientDockerOrDatabaseAuthority(environment) {
  assertNoAmbientDockerAuthority(environment)
  for (const [name, value] of Object.entries(environment)) {
    if (!value) continue
    if (genericAuthorityKeys.has(name)) {
      throw new Error(`${name} is not accepted by the disposable lifecycle test harness`)
    }
  }
}

function assertNoAmbientDockerAuthority(environment) {
  for (const [name, value] of Object.entries(environment)) {
    if (value && (name.startsWith('DOCKER_') || name.startsWith('COMPOSE_'))) {
      throw new Error(`${name} is not accepted by the disposable lifecycle test harness`)
    }
  }
}

export function createDockerInvoker({
  cliPath,
  socketPath,
  configDirectory,
  spawn = spawnSync,
}) {
  if (!isAbsolute(cliPath) || !isAbsolute(socketPath) || !isAbsolute(configDirectory)) {
    throw new Error('Docker authority paths must be absolute')
  }
  return (args, { env = {}, timeoutMs = DOCKER_TIMEOUT_MS } = {}) => {
    const unexpected = Object.keys(env).filter(
      (name) => !['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'].includes(name),
    )
    if (unexpected.length > 0) throw new Error('Docker invocation environment is not allowlisted')
    return spawn(cliPath, [
      '--host', `unix://${socketPath}`,
      '--config', configDirectory,
      ...args,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        LANG: 'C',
        PATH: MINIMAL_PATH,
        ...env,
      },
    })
  }
}

export function inspectPinnedPostgresImage(invoke) {
  const inspected = invoke(['image', 'inspect', '--format', IMAGE_METADATA_FORMAT, IMAGE_ID])
  const output = String(inspected.stdout ?? '').trim()
  if (inspected.status !== 0
    || inspected.error
    || String(inspected.stderr ?? '').trim() !== ''
    || output.length === 0
    || output.length > 4_096) {
    throw new Error(`Required local image ${IMAGE_ID} is absent or uncertain; this harness never pulls images`)
  }

  const fields = output.split('\t')
  if (fields.length !== 3) throw new Error('Pinned PostgreSQL image metadata is invalid')
  let imageId
  let repoDigests
  let architecture
  try {
    imageId = JSON.parse(fields[0])
    repoDigests = JSON.parse(fields[1])
    architecture = JSON.parse(fields[2])
  } catch {
    throw new Error('Pinned PostgreSQL image metadata is invalid')
  }
  if (imageId !== IMAGE_ID
    || !Array.isArray(repoDigests)
    || !repoDigests.includes(IMAGE_REPO_DIGEST)
    || repoDigests.some((digest) => typeof digest !== 'string')
    || architecture !== IMAGE_ARCHITECTURE) {
    throw new Error('Pinned PostgreSQL image metadata does not match the immutable digest')
  }
  return { imageId, repoDigest: IMAGE_REPO_DIGEST, architecture }
}

export function buildOwnedPostgresRunArguments({ containerName, ownerNonce, port }) {
  if (typeof containerName !== 'string'
    || !/^academy-identity-lifecycle-[1-9][0-9]{0,9}-[0-9a-f]{8}$/.test(containerName)
    || typeof ownerNonce !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ownerNonce)
    || !containerName.endsWith(`-${ownerNonce.slice(0, 8)}`)
    || !Number.isInteger(port)
    || port < 61_000
    || port > 61_999) {
    throw new Error('Owned PostgreSQL run arguments are invalid')
  }
  return [
    'run', '--detach', '--rm', '--pull', 'never',
    '--name', containerName,
    '--label', `${FIXED_OWNER_LABEL}=${FIXED_OWNER_VALUE}`,
    '--label', `${OWNER_LABEL}=${ownerNonce}`,
    '--publish', `127.0.0.1:${port}:5432`,
    '--env', 'POSTGRES_DB', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_PASSWORD',
    IMAGE_ID,
  ]
}

export function cleanupOwnedContainer(
  invoke,
  name,
  maximumAttempts = CLEANUP_ATTEMPTS,
  ownership = null,
) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const before = invoke(['container', 'inspect', name], { timeoutMs: DOCKER_TIMEOUT_MS })
    if (isExactContainerAbsence(before, name)) return
    const inspected = parseOwnedInspection(before, name, ownership)
    if (!inspected) throw new Error('Owned container cleanup inspect is uncertain')

    invoke(['rm', '--force', name], { timeoutMs: DOCKER_TIMEOUT_MS })
    const after = invoke(['container', 'inspect', name], { timeoutMs: DOCKER_TIMEOUT_MS })
    if (isExactContainerAbsence(after, name)) return
    if (!parseOwnedInspection(after, name, ownership)) {
      throw new Error('Owned container cleanup inspect is uncertain')
    }
  }
  throw new Error('Owned container cleanup could not prove absence within bounded retries')
}

export function attemptOwnedContainerCreate(
  invoke,
  name,
  args,
  ownership = null,
  environment = {},
) {
  const launched = invoke(args, { env: environment, timeoutMs: 15_000 })
  if (launched.status === 0 && !launched.error) return true
  cleanupOwnedContainer(invoke, name, CLEANUP_ATTEMPTS, ownership)
  return false
}

export function installTerminationHandlers(signalSource, cleanup, exit) {
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    signalSource.once(signal, () => {
      try {
        cleanup()
        exit(exitCode)
      } catch {
        exit(1)
      }
    })
  }
}

export function verifyOwnedDisposablePostgresInspection(invoke, evidence) {
  const expected = parseDisposableEvidence(evidence)
  const inspection = readContainerInspection(invoke, expected.containerName)
  assertOwnedDisposableInspection(inspection, expected)
  return expected.databaseUrl
}

export function verifyOwnedDisposablePostgresEnvironment(environment) {
  assertNoAmbientDockerAuthority(environment)
  const evidence = {
    nonce: environment.ACADEMY_IDENTITY_LIFECYCLE_DISPOSABLE,
    databaseUrl: environment.ACADEMY_IDENTITY_LIFECYCLE_TEST_DATABASE_URL,
    containerId: environment.ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_ID,
    containerName: environment.ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_NAME,
    imageId: environment.ACADEMY_IDENTITY_LIFECYCLE_IMAGE_ID,
  }
  const authority = validatePinnedDockerAuthority()
  const configDirectory = createPrivateDockerConfig()
  try {
    const invoke = createDockerInvoker({
      cliPath: authority.cliPath,
      socketPath: authority.socketPath,
      configDirectory,
    })
    return verifyOwnedDisposablePostgresInspection(invoke, evidence)
  } finally {
    rmSync(configDirectory, { recursive: true, force: true })
  }
}

function validatePinnedDockerAuthority() {
  const cliLink = lstatSync(PINNED_DOCKER_CLI)
  const cliTarget = realpathSync(PINNED_DOCKER_CLI)
  const cli = statSync(cliTarget)
  if (!cliLink.isSymbolicLink()
    || cliLink.uid !== 0
    || cliTarget !== PINNED_DOCKER_CLI_TARGET
    || !cli.isFile()
    || cli.uid !== process.getuid()
    || (cli.mode & 0o022) !== 0) {
    throw new Error('Pinned Docker CLI ownership or mode is invalid')
  }

  const socketLink = lstatSync(PINNED_DOCKER_SOCKET)
  const socketTarget = realpathSync(PINNED_DOCKER_SOCKET)
  const socket = statSync(socketTarget)
  const expectedSocketTarget = join(homedir(), '.docker', 'run', 'docker.sock')
  if (!socketLink.isSymbolicLink()
    || socketLink.uid !== 0
    || socketTarget !== expectedSocketTarget
    || !socket.isSocket()
    || socket.uid !== process.getuid()
    || (socket.mode & 0o022) !== 0) {
    throw new Error('Pinned Docker authority is not the validated local Unix socket')
  }
  return { cliPath: cliTarget, socketPath: socketTarget }
}

function createPrivateDockerConfig() {
  const configDirectory = mkdtempSync(join(tmpdir(), 'academy-identity-docker-'))
  writeFileSync(join(configDirectory, 'config.json'), '{}\n', { mode: 0o600 })
  return configDirectory
}

function parseDisposableEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('Disposable PostgreSQL authority evidence is invalid')
  }
  const { nonce, databaseUrl, containerId, containerName, imageId } = evidence
  if (typeof nonce !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nonce)
    || typeof containerName !== 'string'
    || !/^academy-identity-lifecycle-[1-9][0-9]{0,9}-[0-9a-f]{8}$/.test(containerName)
    || !containerName.endsWith(`-${nonce.slice(0, 8)}`)
    || typeof containerId !== 'string'
    || !/^[0-9a-f]{64}$/.test(containerId)
    || typeof imageId !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(imageId)
    || typeof databaseUrl !== 'string') {
    throw new Error('Disposable PostgreSQL authority evidence is invalid')
  }
  let url
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('Disposable PostgreSQL authority evidence is invalid')
  }
  const port = Number(url.port)
  if (url.toString() !== databaseUrl
    || url.protocol !== 'postgresql:'
    || url.hostname !== '127.0.0.1'
    || !Number.isInteger(port)
    || port < 61_000
    || port > 61_999
    || url.pathname !== `/${DATABASE}`
    || url.username !== USERNAME
    || !/^[A-Za-z0-9_-]{1,128}$/.test(url.password)
    || url.search
    || url.hash) {
    throw new Error('Disposable PostgreSQL authority evidence is invalid')
  }
  return { nonce, databaseUrl, containerId, containerName, imageId, port }
}

function readContainerInspection(invoke, containerName) {
  const response = invoke(['container', 'inspect', containerName], { timeoutMs: DOCKER_TIMEOUT_MS })
  if (response.status !== 0 || response.error || String(response.stderr ?? '').trim() !== '') {
    throw new Error('Disposable PostgreSQL container inspection is uncertain')
  }
  let parsed
  try {
    parsed = JSON.parse(String(response.stdout ?? ''))
  } catch {
    throw new Error('Disposable PostgreSQL container inspection is invalid')
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]
    || typeof parsed[0] !== 'object' || Array.isArray(parsed[0])) {
    throw new Error('Disposable PostgreSQL container inspection is invalid')
  }
  return parsed[0]
}

function assertOwnedDisposableInspection(inspection, evidence) {
  const labels = inspection.Config?.Labels
  const ports = inspection.NetworkSettings?.Ports
  const bindings = ports?.['5432/tcp']
  const labelKeys = labels && typeof labels === 'object' && !Array.isArray(labels)
    ? Object.keys(labels).sort()
    : []
  const portKeys = ports && typeof ports === 'object' && !Array.isArray(ports)
    ? Object.keys(ports)
    : []
  if (inspection.Id !== evidence.containerId
    || inspection.Name !== `/${evidence.containerName}`
    || inspection.Image !== evidence.imageId
    || inspection.State?.Running !== true
    || inspection.Config?.Image !== IMAGE_ID
    || labelKeys.length !== 2
    || labelKeys[0] !== FIXED_OWNER_LABEL
    || labelKeys[1] !== OWNER_LABEL
    || labels[FIXED_OWNER_LABEL] !== FIXED_OWNER_VALUE
    || labels[OWNER_LABEL] !== evidence.nonce
    || portKeys.length !== 1
    || portKeys[0] !== '5432/tcp'
    || !Array.isArray(bindings)
    || bindings.length !== 1
    || bindings[0]?.HostIp !== '127.0.0.1'
    || bindings[0]?.HostPort !== String(evidence.port)) {
    throw new Error('Disposable PostgreSQL container authority does not match inspection')
  }
}

function captureOwnedDisposableEvidence(invoke, evidence) {
  const base = parseDisposableEvidence({
    ...evidence,
    containerId: '0'.repeat(64),
    imageId: `sha256:${'0'.repeat(64)}`,
  })
  const inspection = readContainerInspection(invoke, base.containerName)
  if (typeof inspection.Id !== 'string' || !/^[0-9a-f]{64}$/.test(inspection.Id)
    || typeof inspection.Image !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(inspection.Image)) {
    throw new Error('Disposable PostgreSQL container inspection is invalid')
  }
  const captured = { ...base, containerId: inspection.Id, imageId: inspection.Image }
  assertOwnedDisposableInspection(inspection, captured)
  return captured
}

function isExactContainerAbsence(response, name) {
  if (response.status !== 1 || response.error) return false
  const stdout = String(response.stdout ?? '').trim()
  const stderr = String(response.stderr ?? '').trim()
  const exactJson = `Error response from daemon: {"message":"No such container: ${name}"}`
  const exactObject = `Error: No such object: ${name}`
  const exactContainer = `Error response from daemon: No such container: ${name}`
  return stdout === '' && (stderr === exactJson || stderr === exactContainer)
    || stdout === '[]' && (stderr === exactObject || stderr === exactContainer)
}

function parseOwnedInspection(response, name, ownership) {
  if (response.status !== 0 || response.error || String(response.stderr ?? '').trim() !== '') {
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(String(response.stdout ?? ''))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object') {
    return null
  }
  const inspectedName = typeof parsed[0].Name === 'string'
    ? parsed[0].Name.replace(/^\//, '')
    : null
  if (inspectedName !== name) return null
  if (!ownership) return true
  const labels = parsed[0].Config?.Labels
  return labels && typeof labels === 'object' && labels[ownership.key] === ownership.value
}

async function main() {
  assertNoAmbientContainerAuthority(process.env)
  const authority = validatePinnedDockerAuthority()

  const runId = randomUUID()
  const containerName = `academy-identity-lifecycle-${process.pid}-${runId.slice(0, 8)}`
  const ownership = { key: OWNER_LABEL, value: runId }
  const password = randomBytes(32).toString('base64url')
  const configDirectory = createPrivateDockerConfig()
  const invoke = createDockerInvoker({
    cliPath: authority.cliPath,
    socketPath: authority.socketPath,
    configDirectory,
  })
  let cleanupRequired = false
  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    let cleanupError = null
    try {
      if (cleanupRequired) {
        cleanupOwnedContainer(invoke, containerName, CLEANUP_ATTEMPTS, ownership)
        cleanupRequired = false
      }
    } catch (error) {
      cleanupError = error
    } finally {
      rmSync(configDirectory, { recursive: true, force: true })
      cleaned = true
    }
    if (cleanupError) throw cleanupError
  }
  installTerminationHandlers(process, cleanup, (code) => process.exit(code))

  try {
    const imageMetadata = inspectPinnedPostgresImage(invoke)

    let port = null
    for (let attempt = 0; attempt < 30 && port === null; attempt += 1) {
      const candidate = randomInt(61_000, 62_000)
      cleanupRequired = true
      const launched = attemptOwnedContainerCreate(invoke, containerName,
        buildOwnedPostgresRunArguments({
          containerName,
          ownerNonce: runId,
          port: candidate,
        }), ownership, {
        POSTGRES_DB: DATABASE,
        POSTGRES_USER: USERNAME,
        POSTGRES_PASSWORD: password,
      })
      if (launched) {
        port = candidate
      } else {
        cleanupRequired = false
      }
    }
    if (port === null) throw new Error('Could not allocate an owned loopback test port in 61000-61999')

    let ready = false
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      const probe = invoke([
        'exec', containerName, 'pg_isready', '--username', USERNAME, '--dbname', DATABASE,
      ], {
        env: {
          POSTGRES_DB: DATABASE,
          POSTGRES_USER: USERNAME,
          POSTGRES_PASSWORD: password,
        },
      })
      ready = probe.status === 0 && !probe.error
      if (!ready) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
    if (!ready) throw new Error('Owned disposable PostgreSQL did not become ready')

    const databaseUrl = `postgresql://${USERNAME}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DATABASE}`
    const evidence = captureOwnedDisposableEvidence(invoke, {
      nonce: runId,
      containerName,
      databaseUrl,
    })
    if (evidence.imageId !== imageMetadata.imageId) {
      throw new Error('Owned disposable PostgreSQL resolved image ID does not match the pinned digest')
    }
    process.stdout.write(`Disposable PostgreSQL arm64 local fixture verified: ${imageMetadata.repoDigest} (${imageMetadata.imageId})\n`)
    const tests = spawnSync(
      process.execPath,
      ['./node_modules/vitest/vitest.mjs', 'run', '--project', 'integration',
        'tests/integration/identity-lifecycle-page-store.test.ts'],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 120_000,
        env: {
          ...process.env,
          ACADEMY_IDENTITY_LIFECYCLE_DISPOSABLE: evidence.nonce,
          ACADEMY_IDENTITY_LIFECYCLE_TEST_DATABASE_URL: databaseUrl,
          ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_ID: evidence.containerId,
          ACADEMY_IDENTITY_LIFECYCLE_CONTAINER_NAME: evidence.containerName,
          ACADEMY_IDENTITY_LIFECYCLE_IMAGE_ID: evidence.imageId,
        },
      },
    )
    if (tests.error) throw new Error('Identity lifecycle integration test process failed')
    if (tests.status !== 0) process.exitCode = tests.status ?? 1
  } finally {
    cleanup()
    process.stdout.write('Disposable PostgreSQL cleanup verified\n')
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Lifecycle harness failed'}\n`)
    process.exitCode = 1
  })
}
