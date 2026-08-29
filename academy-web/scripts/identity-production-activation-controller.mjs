#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { link, open, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { intakeIdentityLiveReadiness, readProtectedIdentityLiveReadiness } from './identity-live-readiness-intake.mjs'
import {
  ACADEMY_IDENTITY_ACTIVATION_CANDIDATE_REVISION,
  buildIdentityProductionActivationReceipt,
  IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES,
} from './identity-production-activation-preflight.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const MIGRATIONS = Object.freeze(['0021','0022','0023','0024','0025','0026','0027'])
const CHECKS = Object.freeze(['P1','P2','P3','P4','P5','P6','P7'])
const CONFIG_SHA256 = createHash('sha256').update(`${JSON.stringify(IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES)}\n`).digest('hex')
export const ACTIVATION_RELEASE = 'ACADEMY_PRODUCTION_ACTIVATION_RELEASE_V1'
export const ACTIVATION_STEPS = Object.freeze([
  'identity-readiness', 'current-serving', 'backup-restore', 'migrations-0021-0027',
  'candidate-upload', 'activation-preflight', 'traffic-activation', 'authenticated-p1-p7', 'residue-check',
])

export class AcademyActivationControllerError extends Error {
  constructor(receipt) { super('Academy production activation controller failed'); this.receipt = receipt }
}

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every((key, index) => key === keys[index])

function validatePlan(plan) {
  if (!exact(plan, ['schema','identityReadinessPath','identityRestore','academy','workerName','callbackUri'])
    || plan.schema !== 'academy-production-activation-controller-plan/v1'
    || typeof plan.identityReadinessPath !== 'string' || resolve(plan.identityReadinessPath) !== plan.identityReadinessPath
    || !exact(plan.identityRestore, ['status','receiptSha256']) || plan.identityRestore.status !== 'MATCH'
    || !SHA256.test(plan.identityRestore.receiptSha256)
    || !exact(plan.academy, ['sourceRevision','releaseRevision'])
    || plan.academy.sourceRevision !== ACADEMY_IDENTITY_ACTIVATION_CANDIDATE_REVISION
    || plan.academy.releaseRevision !== plan.academy.sourceRevision
    || plan.workerName !== 'cyberskills-academy'
    || plan.callbackUri !== 'https://academy.cyberskills.co.th/auth/callback') throw new AcademyActivationControllerError()
  return plan
}

function validatePorts(ports) {
  const names = ['inspectRecovery','discoverCurrent','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']
  if (!exact(ports, names) || names.some((name) => typeof ports[name] !== 'function')) throw new AcademyActivationControllerError()
  return ports
}

async function syncParent(path) { const handle = await open(dirname(path), constants.O_RDONLY); try { await handle.sync() } finally { await handle.close() } }

async function assertStableParent(path) {
  let cursor = dirname(resolve(path))
  while (true) {
    if (await realpath(cursor) !== cursor) throw new Error()
    const metadata = await stat(cursor)
    const stickyRoot = metadata.uid === 0 && Boolean(metadata.mode & 0o1000)
    if (!metadata.isDirectory() || (metadata.uid !== process.getuid() && metadata.uid !== 0)
      || ((metadata.mode & 0o022) && !stickyRoot)) throw new Error()
    const next = dirname(cursor); if (next === cursor) return; cursor = next
  }
}

async function writeJournal(path, value, initial = false) {
  const target = resolve(path); const temporary = `${target}.tmp-${process.pid}`
  await assertStableParent(target)
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync() } finally { await handle.close() }
  try {
    if (initial) await link(temporary, target)
    else await rename(temporary, target)
    await rm(temporary, { force: true }); await syncParent(target)
  } catch (error) { await rm(temporary, { force: true }); throw error }
}

async function readJournal(path) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = await handle.stat(); if (!metadata.isFile() || metadata.nlink !== 1 || metadata.mode & 0o077 || metadata.uid !== process.getuid()) throw new Error()
    const value = JSON.parse(await handle.readFile('utf8'))
    if (!exact(value, ['schema','operation','state','identityReadinessSha256','sourceRevision','currentDeploymentId','currentVersionId','candidateVersionId','activeDeploymentId','rollbackTargetVersionId'])
      || value.schema !== 'academy-production-activation-journal/v1' || !SHA256.test(value.identityReadinessSha256)
      || !/^[a-f0-9]{40}$/.test(value.sourceRevision) || !UUID.test(value.currentDeploymentId) || !UUID.test(value.currentVersionId)
      || (value.candidateVersionId !== null && !UUID.test(value.candidateVersionId))
      || (value.activeDeploymentId !== null && !UUID.test(value.activeDeploymentId)) || !UUID.test(value.rollbackTargetVersionId)
      || !['none','backup-restore','migrations-0021-0027','candidate-upload','traffic-activation'].includes(value.operation)
      || !['ready','attempting','confirmed'].includes(value.state)) throw new Error()
    return value
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  finally { await handle?.close() }
}

const mutationOccurred = ledger => Object.values(ledger).some(value => value !== 'not_started')

function expect(value, keys, predicate) {
  if (!exact(value, keys) || !predicate(value) || !SHA256.test(value.receiptSha256)) throw new Error()
  return value
}

export async function runAcademyProductionActivation({ plan: input, ports: inputPorts, release, observedAt = new Date(), journalPath: inputJournalPath }) {
  const plan = validatePlan(input)
  const ports = validatePorts(inputPorts)
  const identity = intakeIdentityLiveReadiness(await readProtectedIdentityLiveReadiness(plan.identityReadinessPath), observedAt)
  const current = await ports.discoverCurrent({ workerName: plan.workerName })
  if (!exact(current, ['deploymentId','versionId']) || !UUID.test(current.deploymentId) || !UUID.test(current.versionId)) {
    throw new AcademyActivationControllerError()
  }
  const base = {
    schema: 'academy-production-activation-controller-receipt/v1',
    mode: release === ACTIVATION_RELEASE ? 'release' : 'dry-run',
    commandIntent: release === ACTIVATION_RELEASE ? 'release_requested' : 'dry_run',
    identityReadinessSha256: identity.receiptSha256,
    sourceRevision: plan.academy.sourceRevision,
    currentServing: { deploymentId: current.deploymentId, versionId: current.versionId },
    steps: [], status: 'DRY_RUN', productionMutation: false,
    mutationLedger: { backupRestore: 'not_started', migrations: 'not_started', candidateUpload: 'not_started', trafficActivation: 'not_started' },
  }
  base.steps.push({ name: 'identity-readiness', status: 'PASS' }, { name: 'current-serving', status: 'PASS' })
  if (release !== ACTIVATION_RELEASE) {
    for (const name of ACTIVATION_STEPS.slice(2)) base.steps.push({ name, status: 'PLANNED' })
    return Object.freeze(base)
  }

  const journalPath = resolve(inputJournalPath ?? `${plan.identityReadinessPath}.academy-activation-journal`)
  const previousJournal = await readJournal(journalPath)
  if (previousJournal) {
    const journalSha256 = createHash('sha256').update(`${JSON.stringify(previousJournal)}\n`).digest('hex')
    const recovered = expect(await ports.inspectRecovery({ journal: previousJournal, journalSha256 }), ['status','journalSha256','outcome','receiptSha256'], value => value.status === 'RECOVERED' && value.journalSha256 === journalSha256 && value.outcome === 'CLEAN')
    base.steps.push({ name: 'prior-recovery', status: 'PASS', receiptSha256: recovered.receiptSha256 })
    await rm(journalPath); await syncParent(journalPath)
  }
  const journal = { schema: 'academy-production-activation-journal/v1', operation: 'none', state: 'ready', identityReadinessSha256: identity.receiptSha256, sourceRevision: plan.academy.sourceRevision, currentDeploymentId: current.deploymentId, currentVersionId: current.versionId, candidateVersionId: null, activeDeploymentId: null, rollbackTargetVersionId: current.versionId }
  await writeJournal(journalPath, journal, true)
  const advance = async (operation, state, extra = {}) => { Object.assign(journal, extra, { operation, state }); await writeJournal(journalPath, journal) }

  let candidate = null
  let activeDeploymentId = null
  try {
    base.mutationLedger.backupRestore = 'attempting'
    await advance('backup-restore', 'attempting')
    const backup = expect(await ports.backupRestore({ identityRestoreReceiptSha256: plan.identityRestore.receiptSha256 }),
      ['status','operation','identityRestoreReceiptSha256','receiptSha256'], value => value.status === 'MATCH'
        && value.operation === 'academy-backup-restore' && value.identityRestoreReceiptSha256 === plan.identityRestore.receiptSha256)
    base.mutationLedger.backupRestore = 'confirmed'
    await advance('backup-restore', 'confirmed')
    base.steps.push({ name: 'backup-restore', status: 'PASS', receiptSha256: backup.receiptSha256 })
    base.mutationLedger.migrations = 'attempting'
    await advance('migrations-0021-0027', 'attempting')
    const migrations = expect(await ports.applyMigrations({ ordered: [...MIGRATIONS] }),
      ['status','operation','ordered','receiptSha256'], value => value.status === 'PASS'
        && value.operation === 'academy-migrations-0021-0027' && JSON.stringify(value.ordered) === JSON.stringify(MIGRATIONS))
    base.mutationLedger.migrations = 'confirmed'
    await advance('migrations-0021-0027', 'confirmed')
    base.steps.push({ name: 'migrations-0021-0027', status: 'PASS', receiptSha256: migrations.receiptSha256 })
    base.mutationLedger.candidateUpload = 'attempting'
    await advance('candidate-upload', 'attempting')
    candidate = await ports.uploadCandidate({
      workerName: plan.workerName, sourceRevision: plan.academy.sourceRevision,
      configuredNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES], traffic: 0,
    })
    expect(candidate, ['status','workerName','versionId','sourceRevision','trafficPercentage','configuredNamesSha256','receiptSha256'], value => value.status === 'PASS'
      && value.workerName === plan.workerName && UUID.test(value.versionId) && value.versionId !== current.versionId
      && value.sourceRevision === plan.academy.sourceRevision && value.trafficPercentage === 0 && value.configuredNamesSha256 === CONFIG_SHA256)
    base.mutationLedger.candidateUpload = 'confirmed'
    await advance('candidate-upload', 'confirmed', { candidateVersionId: candidate.versionId })
    base.steps.push({ name: 'candidate-upload', status: 'PASS', receiptSha256: candidate.receiptSha256 })
    const preflight = buildIdentityProductionActivationReceipt({
      schema: 'academy-identity-production-activation-preflight/v1', academy: plan.academy,
      identityRestore: plan.identityRestore,
      deployment: {
        workerName: plan.workerName, candidateVersionId: candidate.versionId,
        currentDeploymentId: current.deploymentId, currentVersionId: current.versionId,
        callbackUri: plan.callbackUri, configuredNonSecretNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES],
      },
      rollback: { targetVersionId: current.versionId, requiresAuthorizedOperator: true, trafficChanging: true, rehearsalExecuted: false },
    })
    const preflightSha256 = createHash('sha256').update(`${JSON.stringify(preflight)}\n`).digest('hex')
    base.steps.push({ name: 'activation-preflight', status: 'PASS', receiptSha256: preflightSha256 })
    base.mutationLedger.trafficActivation = 'attempted'
    await advance('traffic-activation', 'attempting', { candidateVersionId: candidate.versionId })
    const activation = expect(await ports.activateTraffic({ candidateVersionId: candidate.versionId, expectedCurrentDeploymentId: current.deploymentId, expectedCurrentVersionId: current.versionId, traffic: 100 }),
      ['status','previousDeploymentId','previousVersionId','deploymentId','activeVersionId','trafficPercentage','receiptSha256'], value => value.status === 'PASS'
        && value.previousDeploymentId === current.deploymentId && value.previousVersionId === current.versionId
        && UUID.test(value.deploymentId) && value.activeVersionId === candidate.versionId && value.trafficPercentage === 100)
    activeDeploymentId = activation.deploymentId
    base.mutationLedger.trafficActivation = 'confirmed'
    await advance('traffic-activation', 'confirmed', { activeDeploymentId })
    base.steps.push({ name: 'traffic-activation', status: 'PASS', receiptSha256: activation.receiptSha256 })
    const smoke = expect(await ports.smokeP1P7({ deploymentId: activeDeploymentId, versionId: candidate.versionId, configuredNamesSha256: CONFIG_SHA256 }),
      ['status','deploymentId','versionId','configuredNamesSha256','checks','receiptSha256'], value => value.status === 'PASS'
        && value.deploymentId === activeDeploymentId && value.versionId === candidate.versionId
        && value.configuredNamesSha256 === CONFIG_SHA256 && JSON.stringify(value.checks) === JSON.stringify(CHECKS))
    base.steps.push({ name: 'authenticated-p1-p7', status: 'PASS', receiptSha256: smoke.receiptSha256 })
    const residue = expect(await ports.checkResidue({ expectedDeploymentId: activeDeploymentId, expectedVersionId: candidate.versionId }),
      ['status','deploymentId','versionId','receiptSha256'], value => value.status === 'PASS'
        && value.deploymentId === activeDeploymentId && value.versionId === candidate.versionId)
    base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: residue.receiptSha256 })
    await rm(journalPath); await syncParent(journalPath)
    base.status = 'ACTIVATED'; base.productionMutation = true
    return Object.freeze(base)
  } catch {
    for (const key of ['backupRestore','migrations','candidateUpload']) if (base.mutationLedger[key] === 'attempting') base.mutationLedger[key] = 'unknown'
    if (base.mutationLedger.trafficActivation !== 'not_started') {
      if (!activeDeploymentId) {
        base.mutationLedger.trafficActivation = 'rollback_uncertain'
        base.steps.push({ name: 'rollback', status: 'UNCERTAIN' })
      } else try {
        const rollback = expect(await ports.rollbackTraffic({ expectedActiveDeploymentId: activeDeploymentId, expectedActiveVersionId: candidate?.versionId, priorDeploymentId: current.deploymentId, targetVersionId: current.versionId }),
          ['status','observedActiveDeploymentId','observedActiveVersionId','deploymentId','restoredVersionId','receiptSha256'], value => value.status === 'ROLLED_BACK'
            && value.observedActiveDeploymentId === activeDeploymentId && value.observedActiveVersionId === candidate?.versionId
            && UUID.test(value.deploymentId) && value.restoredVersionId === current.versionId)
        const residue = expect(await ports.checkResidue({ expectedDeploymentId: rollback.deploymentId, expectedVersionId: current.versionId }),
          ['status','deploymentId','versionId','receiptSha256'], value => value.status === 'PASS'
            && value.deploymentId === rollback.deploymentId && value.versionId === current.versionId)
        base.mutationLedger.trafficActivation = 'rolled_back'
        base.steps.push({ name: 'rollback', status: 'PASS', receiptSha256: rollback.receiptSha256 })
        base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: residue.receiptSha256 })
      } catch {
        base.mutationLedger.trafficActivation = 'rollback_uncertain'
        base.steps.push({ name: 'rollback', status: 'UNCERTAIN' })
      }
    }
    base.productionMutation = mutationOccurred(base.mutationLedger)
    if (base.mutationLedger.trafficActivation === 'rollback_uncertain') base.status = 'FAILED_ROLLBACK_UNCERTAIN_RECOVERY_REQUIRED'
    else if (base.mutationLedger.trafficActivation === 'rolled_back') base.status = 'FAILED_TRAFFIC_ROLLED_BACK_RECOVERY_REQUIRED'
    else base.status = base.productionMutation ? 'FAILED_RECOVERY_REQUIRED' : 'FAILED_PRE_MUTATION'
    throw new AcademyActivationControllerError(Object.freeze(base))
  }
}

export async function writeControllerReceipt(path, receipt) {
  const target = resolve(path)
  try { await assertStableParent(target) } catch { throw new AcademyActivationControllerError() }
  const temporary = `${target}.tmp-${process.pid}`
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(`${JSON.stringify(receipt)}\n`); await handle.sync() } finally { await handle.close() }
  try { await link(temporary, target); await syncParent(target); await rm(temporary); await syncParent(target); const metadata = await stat(target); if (metadata.mode & 0o077) throw new Error() }
  catch { await rm(temporary, { force: true }); throw new AcademyActivationControllerError() }
}
