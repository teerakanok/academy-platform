#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CONFIGURATION_NAME = /^[A-Z][A-Z0-9_]{1,127}$/
const CALLBACK_URI = 'https://academy.cyberskills.co.th/auth/callback'
const WORKER_NAME = 'cyberskills-academy'

/** The exact pushed Academy source authorized for this bounded activation preparation. */
export const ACADEMY_IDENTITY_ACTIVATION_CANDIDATE_REVISION = '309d0e6e7439bd86b3d61d9e791c23f1a4fbf06f'

export const IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES = Object.freeze([
  'IDENTITY_ADAPTER',
  'IDENTITY_RUNTIME_ENABLED',
  'IDENTITY_RUNTIME_WIRED',
  'IDENTITY_RELEASE_APPROVAL',
  'IDENTITY_CODE_EXCHANGE_TIMEOUT_MS',
  'IDENTITY_CLIENT_ASSERTION_KEY_ID',
  'IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK',
  'IDENTITY_RESULT_KEY_SET_DOCUMENT',
])

const KILL_SWITCH_NAMES = Object.freeze([
  'IDENTITY_RUNTIME_ENABLED',
  'IDENTITY_RUNTIME_WIRED',
  'IDENTITY_RELEASE_APPROVAL',
])

export class IdentityProductionActivationPreflightError extends Error {
  constructor() {
    super('Identity production activation preflight rejected')
    this.name = 'IdentityProductionActivationPreflightError'
  }
}

export function parseIdentityProductionActivationPreflight(source) {
  try {
    if (typeof source !== 'string') throw new IdentityProductionActivationPreflightError()
    return buildIdentityProductionActivationReceipt(parseDuplicateSafeJson(source))
  } catch (error) {
    if (error instanceof IdentityProductionActivationPreflightError) throw error
    throw new IdentityProductionActivationPreflightError()
  }
}

/**
 * Validates an operations-supplied projection only. This function does not read
 * environment values, invoke provider CLIs, or grant deployment authority.
 */
export function buildIdentityProductionActivationReceipt(input) {
  try {
    const projection = snapshotRecord(input, ['schema', 'academy', 'identityRestore', 'deployment', 'rollback'])
    if (!projection || projection.schema !== 'academy-identity-production-activation-preflight/v1') fail()

    const academy = snapshotRecord(projection.academy, ['sourceRevision', 'releaseRevision'])
    const identityRestore = snapshotRecord(projection.identityRestore, ['status', 'receiptSha256'])
    const deployment = snapshotRecord(projection.deployment, [
      'workerName', 'candidateVersionId', 'currentDeploymentId', 'currentVersionId', 'callbackUri', 'configuredNonSecretNames',
    ])
    const rollback = snapshotRecord(projection.rollback, [
      'targetVersionId', 'requiresAuthorizedOperator', 'trafficChanging', 'rehearsalExecuted',
    ])
    if (!academy || !identityRestore || !deployment || !rollback) fail()

    if (!isSha1(academy.sourceRevision)
      || academy.sourceRevision !== ACADEMY_IDENTITY_ACTIVATION_CANDIDATE_REVISION
      || academy.releaseRevision !== academy.sourceRevision) fail()
    if (identityRestore.status !== 'MATCH' || !isSha256(identityRestore.receiptSha256)) fail()
    if (deployment.workerName !== WORKER_NAME || deployment.callbackUri !== CALLBACK_URI) fail()
    if (!isUuid(deployment.candidateVersionId) || !isUuid(deployment.currentDeploymentId) || !isUuid(deployment.currentVersionId)
      || deployment.candidateVersionId === deployment.currentVersionId) fail()
    if (!sameExactNames(deployment.configuredNonSecretNames, IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES)) fail()
    // The preflight captures the serving version before promotion. Restoring it
    // is the only rollback that returns this activation to its observed baseline.
    if (!isUuid(rollback.targetVersionId)
      || rollback.targetVersionId !== deployment.currentVersionId
      || rollback.requiresAuthorizedOperator !== true
      || rollback.trafficChanging !== true
      || rollback.rehearsalExecuted !== false) fail()

    return deepFreeze({
      schema: 'academy-identity-production-activation-preflight-receipt/v1',
      status: 'PREFLIGHT_READY_FOR_CONTROLLER_RELEASE',
      academy: {
        sourceRevision: academy.sourceRevision,
        releaseRevision: academy.releaseRevision,
      },
      identityRestore: {
        status: 'MATCH',
        receiptSha256: identityRestore.receiptSha256,
      },
      deployment: {
        workerName: WORKER_NAME,
        candidateVersionId: deployment.candidateVersionId,
        currentDeploymentId: deployment.currentDeploymentId,
        currentVersionId: deployment.currentVersionId,
        callbackUri: CALLBACK_URI,
        configuredNonSecretNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES],
      },
      killSwitches: {
        requiredNames: [...KILL_SWITCH_NAMES],
        disableMode: 'remove-or-set-not-true',
      },
      rollback: {
        targetVersionId: rollback.targetVersionId,
        requiresAuthorizedOperator: true,
        trafficChanging: true,
        rehearsalExecuted: false,
      },
      authorization: {
        controllerReleaseObserved: false,
        deploymentExecuted: false,
        rollbackExecuted: false,
        productionMutation: false,
      },
      secretValuesRead: false,
      providerCalls: 0,
    })
  } catch (error) {
    if (error instanceof IdentityProductionActivationPreflightError) throw error
    throw new IdentityProductionActivationPreflightError()
  }
}

function snapshotRecord(value, expectedKeys) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return null
    const keys = Reflect.ownKeys(value)
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return null
    const result = Object.create(null)
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null
      result[key] = descriptor.value
    }
    return result
  } catch {
    return null
  }
}

function snapshotArray(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index))
    expectedKeys.push('length')
    const keys = Reflect.ownKeys(value)
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return null
    const result = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null
      result.push(descriptor.value)
    }
    return result
  } catch {
    return null
  }
}

function sameExactNames(value, expected) {
  const names = snapshotArray(value)
  return names !== null
    && names.length === expected.length
    && names.every((name, index) => typeof name === 'string'
      && CONFIGURATION_NAME.test(name)
      && name === expected[index])
}

function isSha1(value) {
  return typeof value === 'string' && SHA1.test(value)
}

function isSha256(value) {
  return typeof value === 'string' && SHA256.test(value)
}

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

function fail() {
  throw new IdentityProductionActivationPreflightError()
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key])
    Object.freeze(value)
  }
  return value
}

function parseDuplicateSafeJson(source) {
  let index = 0

  const reject = () => { throw new IdentityProductionActivationPreflightError() }
  const whitespace = () => {
    while (/\s/.test(source[index] ?? '')) index += 1
  }
  const string = () => {
    if (source[index] !== '"') reject()
    const start = index
    index += 1
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2
      } else if (source[index] === '"') {
        index += 1
        try {
          return JSON.parse(source.slice(start, index))
        } catch {
          reject()
        }
      } else {
        index += 1
      }
    }
    reject()
  }
  const value = () => {
    whitespace()
    if (source[index] === '"') return string()
    if (source[index] === '{') return object()
    if (source[index] === '[') return array()
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, index)) {
        index += literal.length
        return literal === 'true' ? true : literal === 'false' ? false : null
      }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index))
    if (!match) reject()
    index += match[0].length
    const parsed = Number(match[0])
    if (!Number.isFinite(parsed)) reject()
    return parsed
  }
  const object = () => {
    const result = {}
    const names = new Set()
    index += 1
    whitespace()
    if (source[index] === '}') {
      index += 1
      return result
    }
    while (true) {
      whitespace()
      const name = string()
      if (names.has(name)) reject()
      names.add(name)
      whitespace()
      if (source[index] !== ':') reject()
      index += 1
      result[name] = value()
      whitespace()
      if (source[index] === '}') {
        index += 1
        return result
      }
      if (source[index] !== ',') reject()
      index += 1
    }
  }
  const array = () => {
    const result = []
    index += 1
    whitespace()
    if (source[index] === ']') {
      index += 1
      return result
    }
    while (true) {
      result.push(value())
      whitespace()
      if (source[index] === ']') {
        index += 1
        return result
      }
      if (source[index] !== ',') reject()
      index += 1
    }
  }

  const parsed = value()
  whitespace()
  if (index !== source.length) reject()
  return parsed
}

function writeReceipt(receiptPath, receipt) {
  const outputPath = resolve(receiptPath)
  const parent = dirname(outputPath)
  mkdirSync(parent, { recursive: true })
  const temporaryPath = `${outputPath}.tmp-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporaryPath, outputPath)
}

export function main(arguments_) {
  if (arguments_.length !== 4 || arguments_[0] !== '--input' || arguments_[2] !== '--receipt') {
    throw new IdentityProductionActivationPreflightError()
  }
  const receipt = parseIdentityProductionActivationPreflight(readFileSync(arguments_[1], 'utf8'))
  writeReceipt(arguments_[3], receipt)
  return {
    status: 'written',
    providerCalls: 0,
    secretValuesRead: false,
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryUrl === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Identity production activation preflight rejected'}\n`)
    process.exitCode = 1
  }
}
