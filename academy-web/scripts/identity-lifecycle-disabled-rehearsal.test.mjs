import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION,
  DisabledLifecycleRehearsalError,
  parseDisabledLifecycleRehearsalSpecification,
  rehearseDisabledLifecyclePull,
  validateDisabledLifecycleRehearsalSpecification,
} from './identity-lifecycle-disabled-rehearsal.mjs'

const FIXTURE_PATH = '../../evidence/identity-lifecycle-disabled-rehearsal-intake-contract.v1.json'
const CHECKPOINT_PATH = '../../reports/reviews/academy-identity-lifecycle-disabled-rehearsal-local-checkpoint-20260824.json'

function cloneSpecification() {
  return JSON.parse(JSON.stringify(DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION))
}

function assertRehearsalFailure(action) {
  assert.throws(action, DisabledLifecycleRehearsalError)
}

test('binds the exact intake fixture, source revisions, and disabled registry boundary', () => {
  const fixture = JSON.parse(readFileSync(new URL(FIXTURE_PATH, import.meta.url), 'utf8'))
  const checkpoint = JSON.parse(readFileSync(new URL(CHECKPOINT_PATH, import.meta.url), 'utf8'))
  const consumerPolicy = readFileSync(new URL('../src/lib/identity/consumer-policy.ts', import.meta.url))
  const consumerPolicyBinding = fixture.academySourceBindings.find(
    ({ path }) => path === 'academy-web/src/lib/identity/consumer-policy.ts',
  )

  assert.equal(DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION.academySourceRevision,
    'be72bd4978b616bcd8d782dfc80106ab27780f67')
  assert.equal(DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION.identityControlSourceRevision,
    'd95efebd518c83f711767947ced6c69b14c05881')
  assert.equal(DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION.intakeFixture.sha256,
    'f67381f6dfb9f6314322b0b78d028b340664bd133b64d7ba133bd938fd8d9b66')
  assert.equal(createHash('sha256').update(consumerPolicy).digest('hex'), consumerPolicyBinding.sha256)
  assert.deepEqual(DISABLED_LIFECYCLE_REHEARSAL_SPECIFICATION.selectedValues, fixture.selectedValues)
  assert.deepEqual(checkpoint.selectedValues, fixture.selectedValues)
  assert.equal(checkpoint.acceptanceBoundary.registryRemainsDisabled, true)
  assert.equal(checkpoint.acceptanceBoundary.registryLifecycleValuesRemainNull, true)
  assert.equal(checkpoint.acceptanceBoundary.lifecycleTrafficEnabled, false)
  assert.equal(checkpoint.acceptanceBoundary.productionAuthorityClaimed, false)
  assert.equal(checkpoint.advisoryResult.status, 'PENDING_ACADEMY_SUBMISSION')
  assert.deepEqual(checkpoint.advisoryResult.findings, [
    'receipts 1/5',
    'blockers 1/6',
    'ordered 3/8',
    'authority NONE',
    'operations 0',
  ])
})

test('runs the authenticated-pull request only through injected inert ports without fetch', async () => {
  const specification = cloneSpecification()
  const calls = []
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('network must remain unreachable')
  }

  try {
    const advisory = await rehearseDisabledLifecyclePull(specification, {
      createClientAssertion: async (input) => {
        calls.push({ port: 'assertion', input })
        return 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJhY2FkZW15LXdlYiJ9.signature'
      },
      sendAuthenticatedPull: async (input) => {
        calls.push({ port: 'pull', input })
        return { acceptedByInertPort: true }
      },
    })

    assert.equal(fetchCalls, 0)
    assert.deepEqual(calls, [
      {
        port: 'assertion',
        input: {
          consumerId: 'academy-web',
          audience: 'https://identity-control.internal/v1/lifecycle/events/pull',
        },
      },
      {
        port: 'pull',
        input: {
          endpoint: 'https://identity-control.internal/v1/lifecycle/events/pull',
          eventAudience: 'https://academy.cyberskills.co.th/lifecycle/events',
          request: {
            consumerId: 'academy-web',
            clientAssertion: 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJhY2FkZW15LXdlYiJ9.signature',
            limit: 1,
          },
        },
      },
    ])
    assert.deepEqual(Object.keys(advisory).sort(), [
      'changed_files',
      'findings',
      'status',
      'summary',
    ])
    assert.equal(advisory.status, 'PENDING_ACADEMY_SUBMISSION')
    assert.deepEqual(advisory.findings, [
      'receipts 1/5',
      'blockers 1/6',
      'ordered 3/8',
      'authority NONE',
      'operations 0',
    ])
    assert.deepEqual(advisory.changed_files, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects duplicate, surplus, malformed, and drifted specifications before any port is called', async () => {
  const duplicate = `{
    "schema":"academy-identity-lifecycle-disabled-rehearsal/v1",
    "schema":"academy-identity-lifecycle-disabled-rehearsal/v1"
  }`
  const nestedDuplicate = `{
    "schema":"academy-identity-lifecycle-disabled-rehearsal/v1",
    "academySourceRevision":"be72bd4978b616bcd8d782dfc80106ab27780f67",
    "identityControlSourceRevision":"d95efebd518c83f711767947ced6c69b14c05881",
    "intakeFixture":{"path":"evidence/identity-lifecycle-disabled-rehearsal-intake-contract.v1.json","sha256":"f67381f6dfb9f6314322b0b78d028b340664bd133b64d7ba133bd938fd8d9b66"},
    "selectedValues":{"publisherEndpoint":"https://identity-control.internal/v1/lifecycle/events/pull","publisherEndpoint":"https://identity-control.internal/v1/lifecycle/events/pull","clientAssertionAudience":"https://identity-control.internal/v1/lifecycle/events/pull","eventAudience":"https://academy.cyberskills.co.th/lifecycle/events"},
    "acceptanceBoundary":{"registryRemainsDisabled":true,"registryLifecycleValuesRemainNull":true,"lifecycleTrafficEnabled":false,"productionAuthorityClaimed":false,"releaseApproval":false}
  }`
  assertRehearsalFailure(() => parseDisabledLifecycleRehearsalSpecification(duplicate))
  assertRehearsalFailure(() => parseDisabledLifecycleRehearsalSpecification(nestedDuplicate))
  assertRehearsalFailure(() => parseDisabledLifecycleRehearsalSpecification('{'))

  const surplus = cloneSpecification()
  surplus.unexpected = true
  assertRehearsalFailure(() => validateDisabledLifecycleRehearsalSpecification(surplus))

  const drifted = cloneSpecification()
  drifted.selectedValues.eventAudience = 'https://academy.example.test/lifecycle/events'
  assertRehearsalFailure(() => validateDisabledLifecycleRehearsalSpecification(drifted))

  let calls = 0
  await assert.rejects(
    rehearseDisabledLifecyclePull(drifted, {
      createClientAssertion: async () => { calls += 1; return 'x.y.z' },
      sendAuthenticatedPull: async () => { calls += 1 },
    }),
    DisabledLifecycleRehearsalError,
  )
  assert.equal(calls, 0)
})
