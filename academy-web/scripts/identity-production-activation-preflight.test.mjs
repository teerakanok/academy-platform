import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import {
  IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES,
  IdentityProductionActivationPreflightError,
  buildIdentityProductionActivationReceipt,
  parseIdentityProductionActivationPreflight,
} from './identity-production-activation-preflight.mjs'

const SOURCE = 'fa7bca732aefa58ab7fc2c784676a113b873466b'
const DIGEST = 'b'.repeat(64)
const UUIDS = Object.freeze({
  candidate: '11111111-1111-4111-8111-111111111111',
  deployment: '22222222-2222-4222-8222-222222222222',
  current: '33333333-3333-4333-8333-333333333333',
  rollback: '44444444-4444-4444-8444-444444444444',
})

function projection(overrides = {}) {
  return {
    schema: 'academy-identity-production-activation-preflight/v1',
    academy: {
      sourceRevision: SOURCE,
      releaseRevision: SOURCE,
    },
    identityRestore: {
      status: 'MATCH',
      receiptSha256: DIGEST,
    },
    deployment: {
      workerName: 'cyberskills-academy',
      candidateVersionId: UUIDS.candidate,
      currentDeploymentId: UUIDS.deployment,
      currentVersionId: UUIDS.current,
      callbackUri: 'https://academy.cyberskills.co.th/auth/callback',
      configuredNonSecretNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES],
    },
    rollback: {
      targetVersionId: UUIDS.current,
      requiresAuthorizedOperator: true,
      trafficChanging: true,
      rehearsalExecuted: false,
    },
    ...overrides,
  }
}

describe('Identity production activation preflight', () => {
  test('keeps required non-secret names bound to the production runtime composition', () => {
    const runtimeSource = readFileSync(new URL('../src/lib/identity/production-runtime.ts', import.meta.url), 'utf8')
    const match = /const CONFIG_KEYS = \[([\s\S]*?)\] as const/.exec(runtimeSource)
    assert.ok(match)
    const runtimeNames = [...match[1].matchAll(/'([A-Z0-9_]+)'/g)].map((entry) => entry[1])

    assert.deepEqual(IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES, [
      'IDENTITY_ADAPTER',
      ...runtimeNames,
    ])
  })

  test('accepts only the exact restored source/release projection and emits a redacted non-authorizing receipt', () => {
    const receipt = buildIdentityProductionActivationReceipt(projection())

    assert.deepEqual(receipt, {
      schema: 'academy-identity-production-activation-preflight-receipt/v1',
      status: 'PREFLIGHT_READY_FOR_CONTROLLER_RELEASE',
      academy: { sourceRevision: SOURCE, releaseRevision: SOURCE },
      identityRestore: { status: 'MATCH', receiptSha256: DIGEST },
      deployment: {
        workerName: 'cyberskills-academy',
        candidateVersionId: UUIDS.candidate,
        currentDeploymentId: UUIDS.deployment,
        currentVersionId: UUIDS.current,
        callbackUri: 'https://academy.cyberskills.co.th/auth/callback',
        configuredNonSecretNames: [...IDENTITY_PRODUCTION_ACTIVATION_CONFIG_NAMES],
      },
      killSwitches: {
        requiredNames: [
          'IDENTITY_RUNTIME_ENABLED',
          'IDENTITY_RUNTIME_WIRED',
          'IDENTITY_RELEASE_APPROVAL',
        ],
        disableMode: 'remove-or-set-not-true',
      },
      rollback: {
        targetVersionId: UUIDS.current,
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
    assert.equal(JSON.stringify(receipt).includes('PRIVATE_JWK='), false)
    assert.equal(Object.isFrozen(receipt), true)
  })

  test('rejects absent Identity exact restore MATCH, source/release drift, callback drift, missing kill switch, and unsafe rollback state', () => {
    const cases = [
      ['restore', (value) => { value.identityRestore.status = 'PENDING' }],
      ['unexpected source', (value) => { value.academy.sourceRevision = 'a'.repeat(40); value.academy.releaseRevision = 'a'.repeat(40) }],
      ['source/release', (value) => { value.academy.releaseRevision = 'c'.repeat(40) }],
      ['callback', (value) => { value.deployment.callbackUri = 'https://academy.cyberskills.co.th/auth/other' }],
      ['kill switch', (value) => { value.deployment.configuredNonSecretNames.splice(1, 1) }],
      ['candidate already serving', (value) => { value.deployment.candidateVersionId = UUIDS.current }],
      ['rollback does not restore current serving version', (value) => { value.rollback.targetVersionId = UUIDS.rollback }],
      ['rollback not operator-owned', (value) => { value.rollback.requiresAuthorizedOperator = false }],
      ['rollback declared exercised', (value) => { value.rollback.rehearsalExecuted = true }],
    ]

    for (const [, mutate] of cases) {
      const value = projection()
      mutate(value)
      assert.throws(() => buildIdentityProductionActivationReceipt(value), IdentityProductionActivationPreflightError)
    }
  })

  test('rejects secret-shaped configuration entries and unrecognized projection fields without reflecting input', () => {
    const secretMarker = 'TOP_SECRET_PRIVATE_JWK'
    const value = projection()
    value.deployment.configuredNonSecretNames[0] = `IDENTITY_ADAPTER=${secretMarker}`
    assert.throws(() => buildIdentityProductionActivationReceipt(value), IdentityProductionActivationPreflightError)

    const surplus = projection()
    surplus.controllerRelease = true
    assert.throws(() => buildIdentityProductionActivationReceipt(surplus), IdentityProductionActivationPreflightError)
  })

  test('duplicate-safe parser rejects duplicate members before value collapse', () => {
    const duplicate = `{"schema":"academy-identity-production-activation-preflight/v1","schema":"shadow"}`
    assert.throws(() => parseIdentityProductionActivationPreflight(duplicate), IdentityProductionActivationPreflightError)
  })

  test('CLI writes a machine-verifiable receipt without environment or provider access', () => {
    const directory = mkdtempSync(join(tmpdir(), 'academy-identity-preflight-'))
    const input = join(directory, 'projection.json')
    const output = join(directory, 'receipt.json')
    const script = fileURLToPath(new URL('./identity-production-activation-preflight.mjs', import.meta.url))

    try {
      writeFileSync(input, `${JSON.stringify(projection())}\n`)
      const result = spawnSync(process.execPath, [script, '--input', input, '--receipt', output], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '' },
      })

      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(JSON.parse(result.stdout), {
        status: 'written',
        providerCalls: 0,
        secretValuesRead: false,
      })
      assert.equal(result.stdout.includes(output), false)
      const receipt = JSON.parse(readFileSync(output, 'utf8'))
      assert.equal(receipt.authorization.deploymentExecuted, false)
      assert.equal(receipt.authorization.productionMutation, false)
      assert.equal(JSON.stringify(receipt).includes('TOP_SECRET'), false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
