#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { link, open, realpath, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { intakeIdentityLiveReadiness, readProtectedIdentityLiveReadiness } from './identity-live-readiness-intake.mjs'
import {
  ACADEMY_IDENTITY_ACTIVATION_CANDIDATE_REVISION,
  buildIdentityProductionActivationReceipt,
  IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES,
} from './identity-production-activation-preflight.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
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
  const names = ['discoverCurrent','backupRestore','applyMigrations','uploadCandidate','activateTraffic','smokeP1P7','rollbackTraffic','checkResidue']
  if (!exact(ports, names) || names.some((name) => typeof ports[name] !== 'function')) throw new AcademyActivationControllerError()
  return ports
}

function pass(value, expected) {
  if (!exact(value, ['status','receiptSha256']) || value.status !== expected || !SHA256.test(value.receiptSha256)) throw new Error()
  return value.receiptSha256
}

export async function runAcademyProductionActivation({ plan: input, ports: inputPorts, release, observedAt = new Date() }) {
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
    identityReadinessSha256: identity.receiptSha256,
    sourceRevision: plan.academy.sourceRevision,
    currentServing: { deploymentId: current.deploymentId, versionId: current.versionId },
    steps: [], status: 'DRY_RUN', productionMutation: false,
  }
  base.steps.push({ name: 'identity-readiness', status: 'PASS' }, { name: 'current-serving', status: 'PASS' })
  if (release !== ACTIVATION_RELEASE) {
    for (const name of ACTIVATION_STEPS.slice(2)) base.steps.push({ name, status: 'PLANNED' })
    return Object.freeze(base)
  }

  let trafficAttempted = false
  let rollbackSha256 = null
  try {
    base.steps.push({ name: 'backup-restore', status: 'PASS', receiptSha256: pass(await ports.backupRestore(), 'PASS') })
    base.steps.push({ name: 'migrations-0021-0027', status: 'PASS', receiptSha256: pass(await ports.applyMigrations({ ordered: ['0021','0022','0023','0024','0025','0026','0027'] }), 'PASS') })
    const candidate = await ports.uploadCandidate({
      workerName: plan.workerName, sourceRevision: plan.academy.sourceRevision,
      configuredNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES], traffic: 0,
    })
    if (!exact(candidate, ['versionId','receiptSha256']) || !UUID.test(candidate.versionId)
      || candidate.versionId === current.versionId || !SHA256.test(candidate.receiptSha256)) throw new Error()
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
    trafficAttempted = true
    base.steps.push({ name: 'traffic-activation', status: 'PASS', receiptSha256: pass(await ports.activateTraffic({ candidateVersionId: candidate.versionId, expectedCurrentVersionId: current.versionId, traffic: 100 }), 'PASS') })
    base.steps.push({ name: 'authenticated-p1-p7', status: 'PASS', receiptSha256: pass(await ports.smokeP1P7(), 'PASS') })
    base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: pass(await ports.checkResidue({ expectedVersionId: candidate.versionId }), 'PASS') })
    base.status = 'ACTIVATED'; base.productionMutation = true
    return Object.freeze(base)
  } catch {
    if (trafficAttempted) {
      try {
        rollbackSha256 = pass(await ports.rollbackTraffic({ targetVersionId: current.versionId }), 'ROLLED_BACK')
        base.steps.push({ name: 'rollback', status: 'PASS', receiptSha256: rollbackSha256 })
        base.steps.push({ name: 'residue-check', status: 'PASS', receiptSha256: pass(await ports.checkResidue({ expectedVersionId: current.versionId }), 'PASS') })
      } catch { base.steps.push({ name: 'rollback', status: 'UNCERTAIN' }) }
    }
    base.status = rollbackSha256 ? 'FAILED_ROLLED_BACK' : trafficAttempted ? 'FAILED_ROLLBACK_UNCERTAIN' : 'FAILED_PRE_TRAFFIC'
    base.productionMutation = trafficAttempted
    throw new AcademyActivationControllerError(Object.freeze(base))
  }
}

export async function writeControllerReceipt(path, receipt) {
  const target = resolve(path); const parent = dirname(target)
  if (await realpath(parent) !== parent) throw new AcademyActivationControllerError()
  const temporary = `${target}.tmp-${process.pid}`
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(`${JSON.stringify(receipt)}\n`); await handle.sync() } finally { await handle.close() }
  try { await link(temporary, target); await rm(temporary); const metadata = await stat(target); if (metadata.mode & 0o077) throw new Error() }
  catch { await rm(temporary, { force: true }); throw new AcademyActivationControllerError() }
}
