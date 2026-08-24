import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  acknowledgementTemplate,
  captureKillSwitchOperatorEvidence,
  runDisabledStateRehearsal,
  validateAcknowledgements,
} from './capture-kill-switch-operator-evidence.mjs'

test('captures exact public designation and safe disabled rehearsal', async () => {
  const evidence = await captureKillSwitchOperatorEvidence()

  assert.equal(evidence.designation.operators[0].name, 'Songpon Teerakanok')
  assert.equal(evidence.designation.operators[1].name, 'Araya')
  assert.deepEqual(evidence.designation.escalationRoutes, [
    {
      kind: 'discord',
      routeId: 'academy',
      channelLabel: 'product-academy',
      channelId: '1509154261504753775',
    },
    { kind: 'email', address: 'contact@cyberskills.co.th' },
  ])
  assert.equal(evidence.rehearsal.passed, true)
  assert.equal(evidence.rehearsal.runtimeMutation, false)
  assert.equal(evidence.boundary.productionAuthority, 'NONE')
  assert.equal(evidence.boundary.trafficEnabled, false)
  assert.equal(evidence.boundary.networkRequests, 0)
  assert.equal(evidence.boundary.productionOperations, 0)
})

test('never fabricates absent operator acknowledgements', async () => {
  const evidence = await captureKillSwitchOperatorEvidence()

  assert.equal(evidence.submissionState, 'awaiting-operator-acknowledgements')
  assert.equal(evidence.acknowledgementPacket.complete, false)
  assert.equal(evidence.acceptance.eligibleForIndependentIdentityReview, false)
  assert.deepEqual(evidence.acceptance.blockingConditions, [
    'Songpon Teerakanok acknowledgement',
    'Araya acknowledgement',
  ])
  for (const entry of evidence.acknowledgementPacket.acknowledgements) {
    assert.equal(entry.status, 'pending-human-acknowledgement')
    assert.equal(entry.acknowledgedBy, null)
    assert.equal(entry.acknowledgedAt, null)
    assert.equal(entry.evidenceRef, null)
  }
})

test('accepts only exact, attributable acknowledgement evidence', () => {
  const input = acknowledgementTemplate()
  input.acknowledgements = input.acknowledgements.map((entry) => ({
    ...entry,
    status: 'acknowledged',
    acknowledgedBy: entry.name,
    acknowledgedAt: '2026-08-24T05:00:00.000Z',
    evidenceRef: `committed://operator-acknowledgements/${entry.operatorId}`,
  }))

  assert.equal(validateAcknowledgements(input).length, 2)
  assert.throws(
    () => validateAcknowledgements({
      ...input,
      acknowledgements: input.acknowledgements.slice(0, 1),
    }),
    /exact two-entry/,
  )
  assert.throws(
    () => validateAcknowledgements({
      ...input,
      acknowledgements: input.acknowledgements.map((entry, index) => (
        index === 0 ? { ...entry, acknowledgedBy: 'someone else' } : entry
      )),
    }),
    /Songpon Teerakanok/,
  )
  assert.throws(
    () => validateAcknowledgements({
      ...input,
      acknowledgements: input.acknowledgements.map((entry, index) => (
        index === 0 ? { ...entry, responsibility: 'DIFFERENT' } : entry
      )),
    }),
    /Songpon Teerakanok/,
  )
})

test('recovery remains disabled and performs no live operation', () => {
  const rehearsal = runDisabledStateRehearsal()

  assert.equal(rehearsal.stateTransitions.length, 3)
  for (const transition of rehearsal.stateTransitions) {
    assert.equal(transition.state.clientEnabled, false)
    assert.equal(transition.state.lifecycleEnabled, false)
    assert.equal(transition.state.trafficCount, 0)
    assert.equal(transition.state.productionAuthority, 'NONE')
  }
  assert.equal(rehearsal.networkRequests, 0)
  assert.equal(rehearsal.productionOperations, 0)
  assert.equal(rehearsal.passed, true)
})
