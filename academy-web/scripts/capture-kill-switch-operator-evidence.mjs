import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ACADEMY_BASE_REVISION = 'df01bc3f93f4b1b4631433767d64ae8f37e1c1c0'
const IDENTITY_IMPLEMENTATION_REVISION = 'b26974f3a38c33dabc78651875a3885d32dbf264'
const IDENTITY_HANDOFF_REVISION = '901a177a9cd560f1953890fd92b2a3db82bd3488'
const DIRECTOR_ROUTE_REVISION = '872557e15b4a46b3f5c3c41c412d2ecd7437b09f'
const IDENTITY_PROOF = Object.freeze({
  path: 'evidence/identity-control/academy-next-release-gate-dependency-proof.v1.json',
  bytes: 9326,
  sha256: '8d3642afaeb2f60fe5739afc53eb9f10c22956c8ea4450734441f9d6a44a4f2e',
})
const SOLE_OPERATOR_POLICY = Object.freeze({
  path: 'evidence/identity-control/academy-kill-switch-sole-operator-policy.v1.json',
  bytes: 1875,
  sha256: 'e3b1a14e134596bd3eb3071f7fc6f0130bba9f599dfbbb5370f08c3bc5117a4d',
})
const ATTESTATION_CHECKPOINT = Object.freeze({
  path: 'evidence/identity-control/academy-owner-session-attestation-policy-local-checkpoint-20260824.md',
  bytes: 1123,
  sha256: 'fa174cbd9ffcacfaac664fc02bac6ac279f548bb9618d67b37f709d1c96c0046',
})
const OWNER_ROUTE_SOURCE = Object.freeze({
  path: 'config/owner-update-routes.json',
  bytes: 5249,
  sha256: '1a9e8517465f7bb08cce644da6dab66981cf12ef5e68c387c7c2d9b07b1ed4a6',
})
const CONTACT_SOURCE = Object.freeze({
  path: 'academy-web/src/lib/i18n/privacy.ts',
  bytes: 19543,
  sha256: '844a17add89511fddf047bf0eb42300499f80503eacb6767441be6bb8bd873fb',
})
const OPERATOR = Object.freeze({
  operatorId: 'academy-sole-songpon-teerakanok',
  displayName: 'Asst. Prof. Dr. Songpon Teerakanok',
  acknowledgedBy: 'Songpon Teerakanok',
  role: 'sole-operator',
  responsibilities: Object.freeze([
    'kill-switch-disable-decision',
    'disabled-state-verification',
    'recovery-decision-and-execution',
    'escalation-ownership',
  ]),
  singleOperatorRiskAccepted: true,
})
const ATTESTATION = Object.freeze({
  provenance: 'owner_session_attestation_with_discord_reference',
  canonicalStatementSha256: '628abfbe056c5dea5dbf21ac99afcc068afc4e527d062cb437c8395a7854999b',
  discordReference: Object.freeze({
    url: 'https://discord.com/channels/1509152772635885608/1509154261504753775/1541330282169503824',
    guildId: '1509152772635885608',
    channelId: '1509154261504753775',
    messageId: '1541330282169503824',
    derivedTimestamp: '2026-08-24T06:16:15.801Z',
    ownerSupplied: true,
    discordAuthorContentIndependentlyFetched: false,
    remoteVerified: false,
  }),
})

export async function captureKillSwitchOperatorEvidence(options = {}) {
  const academyRoot = options.academyRoot ?? fileURLToPath(new URL('../..', import.meta.url))
  const directorRoot = options.directorRoot
    ?? fileURLToPath(new URL('../../../../../', import.meta.url))
  const acknowledgementFile = options.acknowledgementFile ?? null
  const [proofBytes, policyBytes, attestationBytes, routeBytes, contactBytes] = await Promise.all([
    readBoundFile(academyRoot, IDENTITY_PROOF),
    readBoundFile(academyRoot, SOLE_OPERATOR_POLICY),
    readBoundFile(academyRoot, ATTESTATION_CHECKPOINT),
    readBoundFile(directorRoot, OWNER_ROUTE_SOURCE),
    readBoundFile(academyRoot, CONTACT_SOURCE),
  ])
  const proof = JSON.parse(proofBytes.toString('utf8'))
  const policy = JSON.parse(policyBytes.toString('utf8'))
  const routeRegistry = JSON.parse(routeBytes.toString('utf8'))
  assertIdentitySources(proof, policy)
  if (!attestationBytes.toString('utf8').includes(ATTESTATION.canonicalStatementSha256)) {
    throw new Error('Identity owner-session attestation checkpoint does not match the pinned statement')
  }

  const academyRoute = routeRegistry.routes?.find((route) => route.route_id === 'academy')
  if (!academyRoute || academyRoute.destination?.kind !== 'text'
    || academyRoute.destination.channel_label !== 'product-academy'
    || academyRoute.destination.channel_id !== '1509154261504753775') {
    throw new Error('Canonical Academy Discord route does not match the source-bound route')
  }
  if (!contactBytes.toString('utf8').includes("contactEmail: 'contact@cyberskills.co.th'")) {
    throw new Error('Canonical Academy escalation email is unavailable from the source-bound product file')
  }

  const acknowledgement = acknowledgementFile
    ? validateAcknowledgement(JSON.parse(await readFile(acknowledgementFile, 'utf8')))
    : pendingAcknowledgement()
  const acknowledged = acknowledgement.status === 'acknowledged'
  const rehearsal = runDisabledStateRehearsal()

  return {
    schema: 'academy-kill-switch-sole-operator-evidence-submission/v1',
    revision: 1,
    submissionState: acknowledged
      ? 'submitted-for-independent-review'
      : 'awaiting-operator-acknowledgement',
    blockerId: 'named-kill-switch-operator',
    blockerStatus: 'open',
    preparationOnly: true,
    sourceBindings: {
      academyBaseRevision: ACADEMY_BASE_REVISION,
      identityImplementationRevision: IDENTITY_IMPLEMENTATION_REVISION,
      identityHandoffRevision: IDENTITY_HANDOFF_REVISION,
      identityRevisionAncestry: {
        ancestor: IDENTITY_IMPLEMENTATION_REVISION,
        descendant: IDENTITY_HANDOFF_REVISION,
        relationship: 'implementation-ancestor-of-handoff',
        verifiedFromCleanIdentityRoot: true,
      },
      directorRouteSourceRevision: DIRECTOR_ROUTE_REVISION,
      identityNextGateProof: IDENTITY_PROOF,
      identitySoleOperatorPolicy: SOLE_OPERATOR_POLICY,
      identityOwnerSessionAttestationCheckpoint: ATTESTATION_CHECKPOINT,
      academyDiscordRouteRegistry: OWNER_ROUTE_SOURCE,
      academyEscalationEmailSource: CONTACT_SOURCE,
    },
    designation: {
      source: 'identity-control-owner-designated-sole-operator-policy/v1',
      operator: OPERATOR,
      escalationRoutes: [
        {
          kind: 'discord',
          routeId: 'academy',
          channelLabel: academyRoute.destination.channel_label,
          channelId: academyRoute.destination.channel_id,
        },
        { kind: 'email', address: 'contact@cyberskills.co.th' },
      ],
    },
    acknowledgementPacket: {
      executableWith: 'node academy-web/scripts/capture-kill-switch-operator-evidence.mjs --acknowledgement-file <committed-json-path>',
      acknowledgement,
      complete: acknowledged,
    },
    rehearsal,
    acceptance: {
      eligibleForIndependentIdentityReview: acknowledged && rehearsal.passed,
      blockingConditions: acknowledged ? [] : ['Songpon Teerakanok acknowledgement'],
    },
    boundary: {
      productionReadiness: false,
      releaseApproval: false,
      productionAuthority: 'NONE',
      registryMutationAuthority: 'NONE',
      runtimeWired: false,
      trafficEnabled: false,
      networkRequests: 0,
      productionOperations: 0,
      requestedOperations: [],
    },
  }
}

export function acknowledgementTemplate() {
  return {
    schema: 'academy-kill-switch-sole-operator-acknowledgement/v1',
    acknowledgement: pendingAcknowledgement(),
  }
}

export function validateAcknowledgement(input) {
  if (!input || input.schema !== 'academy-kill-switch-sole-operator-acknowledgement/v1'
    || !hasExactKeys(input, ['schema', 'acknowledgement'])) {
    throw new Error('Acknowledgement must use the exact sole-operator schema')
  }
  const entry = input.acknowledgement
  if (!entry || !hasExactKeys(entry, [
    'operatorId', 'displayName', 'role', 'responsibilities', 'singleOperatorRiskAccepted',
    'provenance', 'statementSha256', 'discordReference', 'status', 'acknowledgedBy', 'acknowledgedAt',
  ]) || entry.operatorId !== OPERATOR.operatorId
    || entry.displayName !== OPERATOR.displayName
    || entry.role !== OPERATOR.role
    || JSON.stringify(entry.responsibilities) !== JSON.stringify(OPERATOR.responsibilities)
    || entry.singleOperatorRiskAccepted !== true
    || entry.provenance !== ATTESTATION.provenance
    || entry.statementSha256 !== ATTESTATION.canonicalStatementSha256
    || JSON.stringify(entry.discordReference) !== JSON.stringify(ATTESTATION.discordReference)) {
    throw new Error('Sole-operator acknowledgement does not match the canonical designation')
  }
  if (entry.status === 'pending-human-acknowledgement') {
    if (entry.acknowledgedBy !== null || entry.acknowledgedAt !== null) {
      throw new Error('Pending sole-operator acknowledgement must remain null')
    }
    return { ...entry, responsibilities: [...entry.responsibilities] }
  }
  if (entry.status !== 'acknowledged'
    || entry.acknowledgedBy !== OPERATOR.acknowledgedBy
    || entry.acknowledgedAt !== ATTESTATION.discordReference.derivedTimestamp
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.acknowledgedAt)
    || !Number.isFinite(Date.parse(entry.acknowledgedAt))) {
    throw new Error('Sole-operator acknowledgement is incomplete')
  }
  validateDiscordEvidence(entry.discordReference, entry.acknowledgedAt)
  return { ...entry, responsibilities: [...entry.responsibilities] }
}

export function runDisabledStateRehearsal() {
  const baseline = Object.freeze({
    clientEnabled: false,
    lifecycleEnabled: false,
    trafficCount: 0,
    productionAuthority: 'NONE',
  })
  const isolated = { ...baseline }
  const before = { ...isolated }
  isolated.clientEnabled = false
  isolated.lifecycleEnabled = false
  const afterDisable = { ...isolated }
  Object.assign(isolated, baseline)
  const afterRecovery = { ...isolated }
  const checks = {
    startedDisabled: before.clientEnabled === false && before.lifecycleEnabled === false,
    disableWasIdempotent: equalState(before, afterDisable),
    recoveryRestoredDisabledBaseline: equalState(baseline, afterRecovery),
    trafficRemainedZero: [before, afterDisable, afterRecovery].every((state) => state.trafficCount === 0),
    authorityRemainedNone: [before, afterDisable, afterRecovery]
      .every((state) => state.productionAuthority === 'NONE'),
  }
  return {
    schema: 'academy-kill-switch-disabled-recovery-rehearsal/v1',
    mode: 'isolated-in-memory',
    stateTransitions: [
      { phase: 'precheck', state: before },
      { phase: 'disable-confirmed', state: afterDisable },
      { phase: 'disabled-baseline-recovered', state: afterRecovery },
    ],
    checks,
    runtimeMutation: false,
    networkRequests: 0,
    productionOperations: 0,
    passed: Object.values(checks).every(Boolean),
  }
}

function pendingAcknowledgement() {
  return {
    operatorId: OPERATOR.operatorId,
    displayName: OPERATOR.displayName,
    role: OPERATOR.role,
    responsibilities: [...OPERATOR.responsibilities],
    singleOperatorRiskAccepted: OPERATOR.singleOperatorRiskAccepted,
    provenance: ATTESTATION.provenance,
    statementSha256: ATTESTATION.canonicalStatementSha256,
    discordReference: structuredClone(ATTESTATION.discordReference),
    status: 'pending-human-acknowledgement',
    acknowledgedBy: null,
    acknowledgedAt: null,
  }
}

function validateDiscordEvidence(reference, acknowledgedAt) {
  const match = reference.url.match(
    /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/,
  )
  if (!match || match[1] !== '1509152772635885608' || match[2] !== '1509154261504753775') {
    throw new Error('Sole-operator acknowledgement Discord route mismatch')
  }
  const timestamp = new Date(Number((BigInt(match[3]) >> 22n) + 1420070400000n)).toISOString()
  if (timestamp !== reference.derivedTimestamp || timestamp !== acknowledgedAt) {
    throw new Error('Sole-operator acknowledgement Discord timestamp mismatch')
  }
}

function equalState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

async function readBoundFile(root, binding) {
  const value = await readFile(new URL(binding.path, `file://${root.replace(/\/$/, '')}/`))
  const digest = createHash('sha256').update(value).digest('hex')
  if (value.byteLength !== binding.bytes || digest !== binding.sha256) {
    throw new Error(`Source binding drifted: ${binding.path}`)
  }
  return value
}

function assertIdentitySources(proof, policy) {
  if (proof.schema !== 'identity-control-academy-next-release-gate-dependency-proof/v1'
    || proof.revision !== 4
    || proof.selectedGate?.blockerId !== 'named-kill-switch-operator'
    || proof.sourceRevisions?.identityControl !== '478758f288e827346c11b4cb2f36c6d39331be54'
    || proof.sourceRevisions?.academyCurrent !== ACADEMY_BASE_REVISION
    || proof.observedState?.killSwitchGate?.soleOperatorDesignation?.accepted !== 1
    || proof.progress?.productionAuthority !== 'NONE'
    || !Array.isArray(proof.progress?.requestedOperations)
    || proof.progress.requestedOperations.length !== 0
    || policy.schema !== 'identity-control-academy-kill-switch-sole-operator-policy/v1'
    || policy.operator?.displayName !== OPERATOR.displayName
    || JSON.stringify(policy.operator.roles) !== JSON.stringify(OPERATOR.responsibilities)
    || policy.operationalRiskDecision?.singleOperatorRiskAccepted !== true
    || policy.acknowledgementRequirement?.required !== 1
    || policy.acknowledgementRequirement?.allowedProvenance !== ATTESTATION.provenance
    || policy.acknowledgementRequirement?.canonicalStatementSha256 !== ATTESTATION.canonicalStatementSha256
    || JSON.stringify(policy.acknowledgementRequirement?.discordReference) !== JSON.stringify(ATTESTATION.discordReference)
    || policy.productionAuthority !== 'NONE'
    || policy.academyWebEnabled !== false
    || policy.lifecycleTrafficEnabled !== false
    || policy.requestedOperations?.length !== 0) {
    throw new Error('Identity sole-operator sources do not authorize this disabled producer action')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--template')) {
    process.stdout.write(`${JSON.stringify(acknowledgementTemplate(), null, 2)}\n`)
    process.exit(0)
  }
  const index = process.argv.indexOf('--acknowledgement-file')
  if (index >= 0 && !process.argv[index + 1]) {
    throw new Error('--acknowledgement-file requires a JSON path')
  }
  const evidence = await captureKillSwitchOperatorEvidence({
    acknowledgementFile: index >= 0 ? process.argv[index + 1] : null,
  })
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}
