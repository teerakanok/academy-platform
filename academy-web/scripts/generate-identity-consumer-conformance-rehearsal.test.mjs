import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ALL_SCENARIO_IDS,
  FROZEN_REHEARSAL_SCENARIO_IDS,
  buildRehearsalArtifacts,
} from './generate-identity-consumer-conformance-rehearsal.mjs'

const SOURCE = 'a'.repeat(40)
const DIGEST = 'b'.repeat(64)
const FOCUSED = {
  'academy-web/tests/unit/identity-runtime-browser-flow.test.ts': DIGEST,
  'academy-web/tests/unit/identity-transaction.test.ts': DIGEST,
  'academy-web/tests/unit/identity-result-key-set-importer.test.ts': DIGEST,
}

describe('Academy consumer conformance rehearsal generator', () => {
  test('binds every required scenario and resolves exactly the frozen seven', () => {
    const { receipt, report } = buildRehearsalArtifacts({
      sourceRevision: SOURCE,
      focusedArtifactDigests: FOCUSED,
      retainedArtifactSha256: DIGEST,
    })

    assert.equal(report.scenarios.length, 23)
    assert.deepEqual(report.scenarios.map(({ id }) => id), ALL_SCENARIO_IDS)
    assert.deepEqual(receipt.exactScenarioIds, FROZEN_REHEARSAL_SCENARIO_IDS)
    assert.equal(report.scenarios.filter(({ result }) => result === 'pass').length, 23)
    assert.deepEqual(report.summary, {
      trackedScenarioCount: 23,
      provenLocally: 23,
      notProven: 0,
      productionReady: false,
      noProductionMutation: true,
    })
  })

  test('keeps the rehearsal disabled and operation-free', () => {
    const { receipt, report } = buildRehearsalArtifacts({
      sourceRevision: SOURCE,
      focusedArtifactDigests: FOCUSED,
      retainedArtifactSha256: DIGEST,
    })

    assert.deepEqual(receipt.registry, { enabled: false })
    assert.equal(receipt.authority, 'NONE')
    assert.equal(receipt.traffic, 0)
    assert.equal(receipt.productionOperations, 0)
    assert.equal(receipt.runtimeMutation, false)
    assert.equal(report.registryState.enabled, false)
    assert.equal(report.scope.releaseApproval, false)
    assert.equal(report.scope.runtimeWired, false)
  })
})
