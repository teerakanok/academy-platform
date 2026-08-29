import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { parseCurrentDeploymentJson } from './current-deployment.mjs'

const SHA = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPS = ['inspectRecovery','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']
const COMMON_BINDINGS = ['AUTHORITY_ID','RELEASE_REVISION','IDENTITY_READINESS_SHA256','VALID_UNTIL']
export const LIVE_HELPER_BUDGET_MS = 5_000
export const LIVE_RECOVERY_RESERVE_MS = 3 * LIVE_HELPER_BUDGET_MS
const ACTIVATION_MINIMUM_MS = LIVE_RECOVERY_RESERVE_MS + 4 * LIVE_HELPER_BUDGET_MS
const OP_BINDINGS = {
  inspectRecovery: ['MODE','JOURNAL_SHA256'], backupRestore: ['IDENTITY_RESTORE_SHA256'],
  applyMigrations: ['ORDERED_MIGRATIONS'], uploadCandidate: ['SOURCE_REVISION','TRAFFIC'],
  activateTraffic: ['EXPECTED_DEPLOYMENT_ID','EXPECTED_VERSION_ID','CANDIDATE_VERSION_ID','TRAFFIC'],
  smokeP1P7: ['DEPLOYMENT_ID','VERSION_ID','CONFIG_SHA256'],
  rollbackTraffic: ['EXPECTED_DEPLOYMENT_ID','EXPECTED_VERSION_ID','TARGET_VERSION_ID','PRIOR_DEPLOYMENT_ID'],
  checkResidue: ['DEPLOYMENT_ID','VERSION_ID'],
}
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every((key, index) => key === keys[index])
const fail = () => { throw new Error('Academy live adapter rejected the operation') }
const validIso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z', '.000Z')

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

async function stableExecutableParent(path, expectedUid) {
  let cursor = dirname(resolve(path))
  while (true) {
    if (await realpath(cursor) !== cursor) fail()
    const metadata = await stat(cursor)
    const stickyRoot = metadata.uid === 0 && Boolean(metadata.mode & 0o1000)
    if (!metadata.isDirectory() || (metadata.uid !== expectedUid && metadata.uid !== 0)
      || ((metadata.mode & 0o022) && !stickyRoot)) fail()
    const next = dirname(cursor)
    if (next === cursor) return
    cursor = next
  }
}

async function protectedJson(path) {
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

function validateArgs(name, args) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 128
    || args.some(value => typeof value !== 'string' || value.length < 1 || value.length > 4096 || value.includes('\0'))) fail()
  const allowed = [...COMMON_BINDINGS, ...OP_BINDINGS[name]]
  const found = []
  for (const argument of args) {
    const match = /^\{([A-Z][A-Z0-9_]*)\}$/.exec(argument)
    if (argument.includes('{') || argument.includes('}')) {
      if (!match) fail()
      found.push(match[1])
    }
  }
  if (found.length !== allowed.length || allowed.some(key => found.filter(value => value === key).length !== 1)
    || found.some(key => !allowed.includes(key))) fail()
}

function validateAuthority(authority, now, expected) {
  if (!exact(authority, ['schema','authorityId','authorizedBy','validFrom','validUntil','releaseRevision','identityReadinessSha256','target','operations'])
    || authority.schema !== 'academy-production-live-authority/v1' || !UUID.test(authority.authorityId)
    || typeof authority.authorizedBy !== 'string' || authority.authorizedBy.length < 1 || authority.authorizedBy.length > 256
    || !REVISION.test(authority.releaseRevision) || !SHA.test(authority.identityReadinessSha256)
    || authority.releaseRevision !== expected.releaseRevision || authority.identityReadinessSha256 !== expected.identityReadinessSha256
    || !exact(authority.target, ['workerName','pool','database','schema']) || authority.target.workerName !== 'cyberskills-academy'
    || authority.target.pool !== 'Pool A' || authority.target.database !== 'postgres' || authority.target.schema !== 'academy'
    || !exact(authority.operations, OPS) || !Number.isFinite(now)
    || !validIso(authority.validFrom) || !validIso(authority.validUntil)
    || now < Date.parse(authority.validFrom) || now >= Date.parse(authority.validUntil)) fail()
  for (const name of OPS) {
    const spec = authority.operations[name]
    if (!exact(spec, ['executable','sha256','args']) || resolve(spec.executable) !== spec.executable || !SHA.test(spec.sha256)) fail()
    validateArgs(name, spec.args)
  }
  return authority
}

async function verifyExecutable(spec, expectedUid) {
  await stableExecutableParent(spec.executable, expectedUid)
  if (await realpath(spec.executable) !== spec.executable) fail()
  const handle = await open(spec.executable, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || !(metadata.mode & 0o111) || (metadata.mode & 0o022)
      || metadata.uid !== expectedUid || metadata.size < 1 || metadata.size > 64 * 1024 * 1024) fail()
    const hash = createHash('sha256')
    for await (const chunk of handle.createReadStream()) hash.update(chunk)
    if (hash.digest('hex') !== spec.sha256) fail()
    const after = await stat(spec.executable)
    if (after.dev !== metadata.dev || after.ino !== metadata.ino || after.size !== metadata.size
      || after.mtimeMs !== metadata.mtimeMs || after.ctimeMs !== metadata.ctimeMs) fail()
  } finally { await handle.close() }
}

function substitute(args, bindings) {
  return args.map(value => {
    const match = /^\{([A-Z][A-Z0-9_]*)\}$/.exec(value)
    return match ? String(bindings[match[1]]) : value
  })
}

export async function createAcademyProductionLivePorts({ authorityPath, run, expected, clock = () => Date.now(), expectedExecutableUid = 0 }) {
  if (typeof run !== 'function' || !exact(expected, ['releaseRevision','identityReadinessSha256'])
    || !REVISION.test(expected.releaseRevision) || !SHA.test(expected.identityReadinessSha256)
    || !Number.isSafeInteger(expectedExecutableUid) || expectedExecutableUid < 0) fail()
  const authority = validateAuthority(await protectedJson(authorityPath), clock(), expected)
  for (const spec of Object.values(authority.operations)) await verifyExecutable(spec, expectedExecutableUid)
  const authorityBinding = Object.freeze({ authorityId: authority.authorityId, releaseRevision: authority.releaseRevision,
    identityReadinessSha256: authority.identityReadinessSha256, validUntil: authority.validUntil })
  const invoke = async (name, bindings = {}, options = {}) => {
    const now = clock()
    const validUntilMs = Date.parse(authority.validUntil)
    const phaseDeadline = options.recovery === true ? validUntilMs : validUntilMs - LIVE_RECOVERY_RESERVE_MS
    const invocationDeadline = Math.min(phaseDeadline, now + LIVE_HELPER_BUDGET_MS)
    if (!Number.isFinite(now) || now >= phaseDeadline || invocationDeadline - now < 100) fail()
    const spec = authority.operations[name]
    await verifyExecutable(spec, expectedExecutableUid)
    const allBindings = { ...bindings, AUTHORITY_ID: authority.authorityId, RELEASE_REVISION: authority.releaseRevision,
      IDENTITY_READINESS_SHA256: authority.identityReadinessSha256, VALID_UNTIL: authority.validUntil }
    const result = await run({ operation: name, executable: spec.executable, args: substitute(spec.args, allBindings), validUntilMs: invocationDeadline, clock })
    if (clock() >= invocationDeadline || !exact(result, ['status','stdout']) || result.status !== 0
      || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1024 * 1024) fail()
    try { return JSON.parse(result.stdout) } catch { fail() }
  }
  const discoverCurrent = async (recovery = false) => {
    const value = await invoke('inspectRecovery', { MODE: 'discover-current', JOURNAL_SHA256: '' }, { recovery })
    const current = parseCurrentDeploymentJson(JSON.stringify(value.deployments))
    if (current.versions.length !== 1 || current.versions[0].percentage !== 100) fail()
    return { deploymentId: current.id, versionId: current.versions[0].id }
  }
  return Object.freeze({
    authority: authorityBinding,
    inspectRecovery: input => invoke('inspectRecovery', { MODE: 'reconcile', JOURNAL_SHA256: input.journalSha256 }, { recovery: true }),
    discoverCurrent,
    backupRestore: input => invoke('backupRestore', { IDENTITY_RESTORE_SHA256: input.identityRestoreReceiptSha256 }),
    applyMigrations: input => invoke('applyMigrations', { ORDERED_MIGRATIONS: input.ordered.join(',') }),
    uploadCandidate: input => invoke('uploadCandidate', { SOURCE_REVISION: input.sourceRevision, TRAFFIC: String(input.traffic) }),
    activateTraffic: async input => {
      if (Date.parse(authority.validUntil) - clock() < ACTIVATION_MINIMUM_MS) fail()
      const before = await discoverCurrent()
      if (before.deploymentId !== input.expectedCurrentDeploymentId || before.versionId !== input.expectedCurrentVersionId) fail()
      return invoke('activateTraffic', { EXPECTED_DEPLOYMENT_ID: before.deploymentId, EXPECTED_VERSION_ID: before.versionId,
        CANDIDATE_VERSION_ID: input.candidateVersionId, TRAFFIC: String(input.traffic) })
    },
    smokeP1P7: input => invoke('smokeP1P7', { DEPLOYMENT_ID: input.deploymentId, VERSION_ID: input.versionId, CONFIG_SHA256: input.configuredNamesSha256 }),
    rollbackTraffic: async input => {
      const before = await discoverCurrent(true)
      if (before.deploymentId !== input.expectedActiveDeploymentId || before.versionId !== input.expectedActiveVersionId) fail()
      return invoke('rollbackTraffic', { EXPECTED_DEPLOYMENT_ID: before.deploymentId, EXPECTED_VERSION_ID: before.versionId,
        TARGET_VERSION_ID: input.targetVersionId, PRIOR_DEPLOYMENT_ID: input.priorDeploymentId }, { recovery: true })
    },
    checkResidue: input => invoke('checkResidue', { DEPLOYMENT_ID: input.expectedDeploymentId, VERSION_ID: input.expectedVersionId }, { recovery: input.recovery === true }),
  })
}
