import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  acknowledgementTemplate,
  captureKillSwitchOperatorEvidence,
  runDisabledStateRehearsal,
  validateAcknowledgement,
} from './capture-kill-switch-operator-evidence.mjs'

const acknowledged = () => ({
  ...acknowledgementTemplate(),
  acknowledgement: {
    ...acknowledgementTemplate().acknowledgement,
    status: 'acknowledged',
    acknowledgedBy: 'Songpon Teerakanok',
    acknowledgedAt: '2026-08-24T06:16:15.801Z',
  },
})

test('captures one source-bound operator and safe disabled rehearsal', async () => {
  const evidence = await captureKillSwitchOperatorEvidence()
  assert.equal(evidence.designation.operator.displayName, 'Asst. Prof. Dr. Songpon Teerakanok')
  assert.equal(evidence.designation.operator.role, 'sole-operator')
  assert.equal(evidence.designation.operator.responsibilities.length, 4)
  assert.equal(evidence.designation.operator.singleOperatorRiskAccepted, true)
  assert.deepEqual(Object.keys(evidence.designation).sort(), ['escalationRoutes', 'operator', 'source'])
  assert.equal(evidence.sourceBindings.identityImplementationRevision, 'b26974f3a38c33dabc78651875a3885d32dbf264')
  assert.equal(evidence.sourceBindings.identityHandoffRevision, '901a177a9cd560f1953890fd92b2a3db82bd3488')
  assert.deepEqual(evidence.sourceBindings.identityRevisionAncestry, {
    ancestor: 'b26974f3a38c33dabc78651875a3885d32dbf264',
    descendant: '901a177a9cd560f1953890fd92b2a3db82bd3488',
    relationship: 'implementation-ancestor-of-handoff',
    verifiedFromCleanIdentityRoot: true,
  })
  assert.equal(evidence.rehearsal.passed, true)
  assert.equal(evidence.boundary.productionAuthority, 'NONE')
  assert.equal(evidence.boundary.trafficEnabled, false)
  assert.equal(evidence.boundary.networkRequests, 0)
  assert.equal(evidence.boundary.productionOperations, 0)
})

test('keeps the sole acknowledgement pending without fabricating evidence', async () => {
  const evidence = await captureKillSwitchOperatorEvidence()
  assert.equal(evidence.submissionState, 'awaiting-operator-acknowledgement')
  assert.equal(evidence.acknowledgementPacket.complete, false)
  assert.deepEqual(evidence.acceptance.blockingConditions, ['Songpon Teerakanok acknowledgement'])
  assert.equal(evidence.acknowledgementPacket.acknowledgement.acknowledgedBy, null)
  assert.equal(evidence.acknowledgementPacket.acknowledgement.discordReference.remoteVerified, false)
  assert.equal(
    evidence.acknowledgementPacket.acknowledgement.discordReference.discordAuthorContentIndependentlyFetched,
    false,
  )
})

test('accepts only the exact sole-operator Discord acknowledgement', () => {
  const input = acknowledged()
  const entry = validateAcknowledgement(input)
  assert.equal(entry.status, 'acknowledged')
  assert.equal(entry.acknowledgedBy, 'Songpon Teerakanok')
  assert.equal(entry.singleOperatorRiskAccepted, true)
  assert.throws(() => validateAcknowledgement({
    ...input,
    acknowledgement: { ...input.acknowledgement, acknowledgedBy: 'another person' },
  }), /incomplete/)
  assert.throws(() => validateAcknowledgement({
    ...input,
    acknowledgement: { ...input.acknowledgement, acknowledgedAt: '2026-08-24T06:16:15.802Z' },
  }), /incomplete/)
  assert.throws(() => validateAcknowledgement({
    ...input,
    acknowledgement: {
      ...input.acknowledgement,
      responsibilities: input.acknowledgement.responsibilities.slice(0, 3),
    },
  }), /canonical designation/)
  for (const [field, value] of [
    ['provenance', 'discord_remote_message'],
    ['statementSha256', '0'.repeat(64)],
    ['singleOperatorRiskAccepted', false],
  ]) {
    assert.throws(() => validateAcknowledgement({
      ...input,
      acknowledgement: { ...input.acknowledgement, [field]: value },
    }), /canonical designation/)
  }
  for (const [field, value] of [
    ['url', 'https://discord.com/channels/1/2/3'],
    ['guildId', '1'],
    ['channelId', '2'],
    ['messageId', '3'],
    ['derivedTimestamp', '2026-08-24T06:16:15.802Z'],
    ['ownerSupplied', false],
    ['discordAuthorContentIndependentlyFetched', true],
    ['remoteVerified', true],
  ]) {
    assert.throws(() => validateAcknowledgement({
      ...input,
      acknowledgement: {
        ...input.acknowledgement,
        discordReference: { ...input.acknowledgement.discordReference, [field]: value },
      },
    }), /canonical designation/)
  }
  assert.throws(() => validateAcknowledgement({ ...input, acknowledgements: [] }), /exact sole-operator/)
})

test('rehearsal starts and ends disabled without authority or operations', () => {
  const rehearsal = runDisabledStateRehearsal()
  for (const transition of rehearsal.stateTransitions) {
    assert.equal(transition.state.clientEnabled, false)
    assert.equal(transition.state.lifecycleEnabled, false)
    assert.equal(transition.state.trafficCount, 0)
    assert.equal(transition.state.productionAuthority, 'NONE')
  }
  assert.equal(rehearsal.runtimeMutation, false)
  assert.equal(rehearsal.networkRequests, 0)
  assert.equal(rehearsal.productionOperations, 0)
  assert.equal(rehearsal.passed, true)
})
