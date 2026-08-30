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
  const names = ['authority','inspectRecovery','discoverCurrent','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']
  if (!exact(ports, names) || !exact(ports.authority, ['authorityId','releaseRevision','identityReadinessSha256','validUntil'])
    || !UUID.test(ports.authority.authorityId) || !/^[a-f0-9]{40}$/.test(ports.authority.releaseRevision)
    || !SHA256.test(ports.authority.identityReadinessSha256) || !Number.isFinite(Date.parse(ports.authority.validUntil))
    || names.slice(1).some((name) => typeof ports[name] !== 'function')) throw new AcademyActivationControllerError()
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
    await assertStableParent(path)
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = await handle.stat(); if (!metadata.isFile() || metadata.nlink !== 1 || metadata.mode & 0o077 || metadata.uid !== process.getuid()) throw new Error()
    const value = JSON.parse(await handle.readFile('utf8'))
    if (!exact(value, ['schema','phase','operation','state','identityReadinessSha256','sourceRevision','planSha256','currentDeploymentId','currentVersionId','candidateVersionId','activeDeploymentId','rollbackTargetVersionId','finalReceipt','finalReceiptSha256'])
      || value.schema !== 'academy-production-activation-journal/v1' || !SHA256.test(value.identityReadinessSha256)
      || !/^[a-f0-9]{40}$/.test(value.sourceRevision) || !SHA256.test(value.planSha256)
      || !UUID.test(value.currentDeploymentId) || !UUID.test(value.currentVersionId)
      || (value.candidateVersionId !== null && !UUID.test(value.candidateVersionId))
      || (value.activeDeploymentId !== null && !UUID.test(value.activeDeploymentId)) || !UUID.test(value.rollbackTargetVersionId)
      || !['none','backup-restore','migrations-0021-0027','candidate-upload','traffic-activation','terminal'].includes(value.operation)
      || !['active','activated','failed'].includes(value.phase) || !['ready','attempting','confirmed'].includes(value.state)
      || (value.phase === 'active' && (value.finalReceipt !== null || value.finalReceiptSha256 !== null))
      || (value.phase !== 'active' && (!value.finalReceipt || !SHA256.test(value.finalReceiptSha256)
        || createHash('sha256').update(`${JSON.stringify(value.finalReceipt)}\n`).digest('hex') !== value.finalReceiptSha256))) throw new Error()
    return value
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  finally { await handle?.close() }
}

const mutationOccurred = ledger => Object.values(ledger).some(value => value !== 'not_started')

function expect(value, keys, predicate) {
  if (!exact(value, keys) || !predicate(value) || !SHA256.test(value.receiptSha256)) throw new Error()
  return value
}

async function publishTerminalForPlan(plan, journalPath, receiptPath) {
  const journal = await readJournal(journalPath)
  if (journal?.phase !== 'activated') return null
  const receipt = journal.finalReceipt
  const planSha256 = createHash('sha256').update(`${JSON.stringify(plan)}\n`).digest('hex')
  if (journal.sourceRevision !== plan.academy.releaseRevision
    || journal.planSha256 !== planSha256
    || receipt?.schema !== 'academy-production-activation-controller-receipt/v1'
    || receipt.status !== 'ACTIVATED' || receipt.productionMutation !== true
    || receipt.sourceRevision !== plan.academy.releaseRevision
    || receipt.planSha256 !== planSha256
    || receipt.identityReadinessSha256 !== journal.identityReadinessSha256
    || receipt.currentServing?.deploymentId !== journal.currentDeploymentId
    || receipt.currentServing?.versionId !== journal.currentVersionId) throw new AcademyActivationControllerError()
  await writeControllerReceipt(receiptPath, receipt, { journalPath })
  return Object.freeze(receipt)
}

export async function publishRetainedAcademyActivation({ plan: input, journalPath: inputJournalPath, receiptPath: inputReceiptPath }) {
  const plan = validatePlan(input)
  const journalPath = resolve(inputJournalPath ?? `${plan.identityReadinessPath}.academy-activation-journal`)
  const receiptPath = resolve(inputReceiptPath ?? `${journalPath}.receipt`)
  return publishTerminalForPlan(plan, journalPath, receiptPath)
}

export async function runAcademyProductionActivation({ plan: input, ports: inputPorts, release, observedAt = new Date(), authoritySha256, journalPath: inputJournalPath, receiptPath: inputReceiptPath }) {
  const plan = validatePlan(input)
  const journalPath = resolve(inputJournalPath ?? `${plan.identityReadinessPath}.academy-activation-journal`)
  const receiptPath = resolve(inputReceiptPath ?? `${journalPath}.receipt`)
  if (release === ACTIVATION_RELEASE) {
    const terminal = await publishTerminalForPlan(plan, journalPath, receiptPath)
    if (terminal) return terminal
  }
  const ports = validatePorts(inputPorts)
  const identity = intakeIdentityLiveReadiness(await readProtectedIdentityLiveReadiness(plan.identityReadinessPath), observedAt, authoritySha256)
  if (ports.authority.releaseRevision !== plan.academy.releaseRevision
    || ports.authority.identityReadinessSha256 !== identity.receiptSha256
    || observedAt.getTime() >= Date.parse(ports.authority.validUntil)) throw new AcademyActivationControllerError()
  let baseRecoveryReceipt = null
  const previousJournal = release === ACTIVATION_RELEASE ? await readJournal(journalPath) : null
  if (previousJournal?.phase === 'activated') {
    const terminal = await publishTerminalForPlan(plan, journalPath, receiptPath)
    if (terminal) return terminal
    throw new AcademyActivationControllerError()
  }
  if (previousJournal) {
    const journalSha256 = createHash('sha256').update(`${JSON.stringify(previousJournal)}\n`).digest('hex')
    const recovered = expect(await ports.inspectRecovery({ journal: previousJournal, journalSha256 }), ['status','journalSha256','outcome','receiptSha256'], value => value.status === 'RECOVERED' && value.journalSha256 === journalSha256 && value.outcome === 'CLEAN')
    await rm(journalPath); await syncParent(journalPath)
    baseRecoveryReceipt = recovered.receiptSha256
  }
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
    planSha256: createHash('sha256').update(`${JSON.stringify(plan)}\n`).digest('hex'),
    currentServing: { deploymentId: current.deploymentId, versionId: current.versionId },
    steps: [], status: 'DRY_RUN', productionMutation: false,
    mutationLedger: { backupRestore: 'not_started', migrations: 'not_started', candidateUpload: 'not_started', trafficActivation: 'not_started' },
  }
  base.steps.push({ name: 'identity-readiness', status: 'PASS' }, { name: 'current-serving', status: 'PASS' })
  if (baseRecoveryReceipt) base.steps.splice(1, 0, { name: 'prior-recovery', status: 'PASS', receiptSha256: baseRecoveryReceipt })
  if (release !== ACTIVATION_RELEASE) {
    for (const name of ACTIVATION_STEPS.slice(2)) base.steps.push({ name, status: 'PLANNED' })
    return Object.freeze(base)
  }

  const journal = { schema: 'academy-production-activation-journal/v1', phase: 'active', operation: 'none', state: 'ready', identityReadinessSha256: identity.receiptSha256, sourceRevision: plan.academy.sourceRevision, planSha256: base.planSha256, currentDeploymentId: current.deploymentId, currentVersionId: current.versionId, candidateVersionId: null, activeDeploymentId: null, rollbackTargetVersionId: current.versionId, finalReceipt: null, finalReceiptSha256: null }
  await writeJournal(journalPath, journal, true)
  const advance = async (operation, state, extra = {}) => { Object.assign(journal, extra, { operation, state }); await writeJournal(journalPath, journal) }

  let candidate = null
  let activeDeploymentId = null
  let activationVerified = false
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
      ['status','previousDeploymentId','previousVersionId','deploymentId','activeVersionId','trafficPercentage','semantics','receiptSha256'], value => value.status === 'PASS'
        && value.previousDeploymentId === current.deploymentId && value.previousVersionId === current.versionId
        && UUID.test(value.deploymentId) && value.activeVersionId === candidate.versionId && value.trafficPercentage === 100
        && exact(value.semantics, ['concurrencyControl','atomicProviderCas','residualRace'])
        && value.semantics.concurrencyControl === 'optimistic-precondition-and-postcondition'
        && value.semantics.atomicProviderCas === false && value.semantics.residualRace === true)
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
      ['status','deploymentId','versionId','versionCount','nonServingVersionCount','inventorySha256','receiptSha256'], value => value.status === 'PASS'
        && value.deploymentId === activeDeploymentId && value.versionId === candidate.versionId
        && Number.isSafeInteger(value.versionCount) && value.versionCount >= 1
        && Number.isSafeInteger(value.nonServingVersionCount) && value.nonServingVersionCount >= 0
        && value.nonServingVersionCount < value.versionCount && SHA256.test(value.inventorySha256))
    base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: residue.receiptSha256,
      evidence: { versionCount: residue.versionCount, nonServingVersionCount: residue.nonServingVersionCount,
        inventorySha256: residue.inventorySha256 } })
    base.status = 'ACTIVATED'; base.productionMutation = true
    const finalReceipt = JSON.parse(JSON.stringify(base))
    const finalReceiptSha256 = createHash('sha256').update(`${JSON.stringify(finalReceipt)}\n`).digest('hex')
    activationVerified = true
    await advance('terminal', 'confirmed', { phase: 'activated', finalReceipt, finalReceiptSha256 })
    return Object.freeze(base)
  } catch {
    if (activationVerified) {
      base.status = 'FAILED_ACTIVATION_RECEIPT_UNCERTAIN_RECOVERY_REQUIRED'
      base.productionMutation = true
      throw new AcademyActivationControllerError(Object.freeze(base))
    }
    for (const key of ['backupRestore','migrations','candidateUpload']) if (base.mutationLedger[key] === 'attempting') base.mutationLedger[key] = 'unknown'
    if (base.mutationLedger.trafficActivation !== 'not_started') {
      if (!activeDeploymentId) {
        base.mutationLedger.trafficActivation = 'rollback_uncertain'
        base.steps.push({ name: 'rollback', status: 'UNCERTAIN' })
      } else try {
        const rollback = expect(await ports.rollbackTraffic({ expectedActiveDeploymentId: activeDeploymentId, expectedActiveVersionId: candidate?.versionId, priorDeploymentId: current.deploymentId, targetVersionId: current.versionId }),
          ['status','observedActiveDeploymentId','observedActiveVersionId','deploymentId','restoredVersionId','semantics','receiptSha256'], value => value.status === 'ROLLED_BACK'
            && value.observedActiveDeploymentId === activeDeploymentId && value.observedActiveVersionId === candidate?.versionId
            && UUID.test(value.deploymentId) && value.restoredVersionId === current.versionId
            && exact(value.semantics, ['concurrencyControl','atomicProviderCas','residualRace'])
            && value.semantics.concurrencyControl === 'optimistic-precondition-and-postcondition'
            && value.semantics.atomicProviderCas === false && value.semantics.residualRace === true)
        const residue = expect(await ports.checkResidue({ expectedDeploymentId: rollback.deploymentId, expectedVersionId: current.versionId, recovery: true }),
          ['status','deploymentId','versionId','versionCount','nonServingVersionCount','inventorySha256','receiptSha256'], value => value.status === 'PASS'
            && value.deploymentId === rollback.deploymentId && value.versionId === current.versionId
            && Number.isSafeInteger(value.versionCount) && value.versionCount >= 1
            && Number.isSafeInteger(value.nonServingVersionCount) && value.nonServingVersionCount >= 0
            && value.nonServingVersionCount < value.versionCount && SHA256.test(value.inventorySha256))
        base.mutationLedger.trafficActivation = 'rolled_back'
        base.steps.push({ name: 'rollback', status: 'PASS', receiptSha256: rollback.receiptSha256 })
        base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: residue.receiptSha256,
          evidence: { versionCount: residue.versionCount, nonServingVersionCount: residue.nonServingVersionCount,
            inventorySha256: residue.inventorySha256 } })
      } catch {
        base.mutationLedger.trafficActivation = 'rollback_uncertain'
        base.steps.push({ name: 'rollback', status: 'UNCERTAIN' })
      }
    }
    base.productionMutation = mutationOccurred(base.mutationLedger)
    if (base.mutationLedger.trafficActivation === 'rollback_uncertain') base.status = 'FAILED_ROLLBACK_UNCERTAIN_RECOVERY_REQUIRED'
    else if (base.mutationLedger.trafficActivation === 'rolled_back') base.status = 'FAILED_TRAFFIC_ROLLED_BACK_RECOVERY_REQUIRED'
    else base.status = base.productionMutation ? 'FAILED_RECOVERY_REQUIRED' : 'FAILED_PRE_MUTATION'
    const finalReceipt = JSON.parse(JSON.stringify(base))
    const finalReceiptSha256 = createHash('sha256').update(`${JSON.stringify(finalReceipt)}\n`).digest('hex')
    await advance('terminal', 'confirmed', { phase: 'failed', finalReceipt, finalReceiptSha256 })
    throw new AcademyActivationControllerError(Object.freeze(base))
  }
}

export async function writeControllerFailureReceipt(path, receipt, options = {}) {
  const journal = await readJournal(resolve(options.journalPath))
  const digest = createHash('sha256').update(`${JSON.stringify(receipt)}\n`).digest('hex')
  if (journal?.phase !== 'failed' || journal.finalReceiptSha256 !== digest
    || JSON.stringify(journal.finalReceipt) !== JSON.stringify(receipt)) throw new AcademyActivationControllerError()
  return writeControllerReceipt(path, receipt)
}

export async function writeControllerReceipt(path, receipt, options = {}) {
  const target = resolve(path)
  try { await assertStableParent(target) } catch { throw new AcademyActivationControllerError() }
  let terminalJournal = null
  if (options.journalPath) {
    try {
      terminalJournal = await readJournal(options.journalPath)
      const digest = createHash('sha256').update(`${JSON.stringify(receipt)}\n`).digest('hex')
      if (terminalJournal?.phase !== 'activated' || terminalJournal.finalReceiptSha256 !== digest
        || JSON.stringify(terminalJournal.finalReceipt) !== JSON.stringify(receipt)) throw new Error()
    } catch { throw new AcademyActivationControllerError() }
  }
  const temporary = `${target}.tmp-${process.pid}`
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(`${JSON.stringify(receipt)}\n`); await handle.sync() } finally { await handle.close() }
  try {
    try { await link(temporary, target) }
    catch (error) { if (error.code !== 'EEXIST' || await readFileSecure(target) !== `${JSON.stringify(receipt)}\n`) throw error }
    await syncParent(target); await rm(temporary); await syncParent(target)
    const metadata = await stat(target); if (metadata.mode & 0o077) throw new Error()
    if (options.journalPath) {
      try { await rm(options.journalPath); await syncParent(options.journalPath) }
      catch (error) { if (!await readJournal(options.journalPath)) await writeJournal(options.journalPath, terminalJournal, true); throw error }
    }
  } catch { await rm(temporary, { force: true }); throw new AcademyActivationControllerError() }
}

async function readFileSecure(path) { const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { return await handle.readFile('utf8') } finally { await handle.close() } }
