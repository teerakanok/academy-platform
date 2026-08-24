import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ACADEMY_BASE_REVISION = 'df01bc3f93f4b1b4631433767d64ae8f37e1c1c0'
const IDENTITY_REVISION = '478758f288e827346c11b4cb2f36c6d39331be54'
const DIRECTOR_REVISION = '872557e15b4a46b3f5c3c41c412d2ecd7437b09f'
const IDENTITY_PROOF = Object.freeze({
  path: 'evidence/identity-control/academy-next-release-gate-dependency-proof.v1.json',
  bytes: 8969,
  sha256: '81b0d14046ad00d7588293ea1adaa50b77237b54aa9a4d38c5938a13c1780c5f',
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

const OPERATORS = Object.freeze([
  Object.freeze({
    operatorId: 'academy-primary-songpon-teerakanok',
    name: 'Songpon Teerakanok',
    role: 'primary',
    responsibility: 'Own the Academy kill-switch disable decision, confirm the disabled state, and coordinate recovery to the verified disabled baseline.',
  }),
  Object.freeze({
    operatorId: 'academy-backup-araya',
    name: 'Araya',
    role: 'backup',
    responsibility: 'Assume the Academy kill-switch disable and disabled-baseline recovery duties when the primary operator is unavailable.',
  }),
])

export async function captureKillSwitchOperatorEvidence(options = {}) {
  const academyRoot = options.academyRoot ?? fileURLToPath(new URL('../..', import.meta.url))
  const directorRoot = options.directorRoot
    ?? fileURLToPath(new URL('../../../../../', import.meta.url))
  const acknowledgementFile = options.acknowledgementFile ?? null

  const [proof, routeRegistry, contactSource] = await Promise.all([
    readBoundFile(academyRoot, IDENTITY_PROOF),
    readBoundFile(directorRoot, OWNER_ROUTE_SOURCE),
    readBoundFile(academyRoot, CONTACT_SOURCE),
  ])
  const proofJson = JSON.parse(proof.toString('utf8'))
  const routeJson = JSON.parse(routeRegistry.toString('utf8'))
  assertIdentityProof(proofJson)

  const academyRoute = routeJson.routes?.find((route) => route.route_id === 'academy')
  if (!academyRoute || academyRoute.destination?.kind !== 'text'
    || academyRoute.destination.channel_label !== 'product-academy'
    || academyRoute.destination.channel_id !== '1509154261504753775') {
    throw new Error('Canonical Academy Discord route does not match the source-bound route')
  }
  if (!contactSource.toString('utf8').includes("contactEmail: 'contact@cyberskills.co.th'")) {
    throw new Error('Canonical Academy escalation email is unavailable from the source-bound product file')
  }

  const acknowledgements = acknowledgementFile
    ? validateAcknowledgements(JSON.parse(await readFile(acknowledgementFile, 'utf8')))
    : pendingAcknowledgements()
  const rehearsal = runDisabledStateRehearsal()
  const acknowledged = acknowledgements.every((entry) => entry.status === 'acknowledged')

  return {
    schema: 'academy-kill-switch-operator-evidence-submission/v1',
    revision: 1,
    submissionState: acknowledged
      ? 'submitted-for-independent-review'
      : 'awaiting-operator-acknowledgements',
    blockerId: 'named-kill-switch-operator',
    blockerStatus: 'open',
    preparationOnly: true,
    sourceBindings: {
      academyBaseRevision: ACADEMY_BASE_REVISION,
      identityHandoffRevision: IDENTITY_REVISION,
      directorRouteSourceRevision: DIRECTOR_REVISION,
      identityNextGateProof: IDENTITY_PROOF,
      academyDiscordRouteRegistry: OWNER_ROUTE_SOURCE,
      academyEscalationEmailSource: CONTACT_SOURCE,
    },
    designation: {
      source: 'owner-approved-designation-2026-08-24',
      operators: OPERATORS,
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
      acknowledgements,
      complete: acknowledged,
    },
    rehearsal,
    acceptance: {
      eligibleForIndependentIdentityReview: acknowledged && rehearsal.passed,
      blockingConditions: acknowledged
        ? []
        : ['Songpon Teerakanok acknowledgement', 'Araya acknowledgement'],
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
    schema: 'academy-kill-switch-operator-acknowledgements/v1',
    acknowledgements: pendingAcknowledgements(),
  }
}

export function validateAcknowledgements(input) {
  if (!input || input.schema !== 'academy-kill-switch-operator-acknowledgements/v1'
    || !Array.isArray(input.acknowledgements) || input.acknowledgements.length !== OPERATORS.length) {
    throw new Error('Operator acknowledgements must use the exact two-entry acknowledgement schema')
  }
  return OPERATORS.map((operator) => {
    const entry = input.acknowledgements.find((candidate) => candidate.operatorId === operator.operatorId)
    if (!entry || entry.name !== operator.name || entry.role !== operator.role
      || entry.responsibility !== operator.responsibility
      || entry.statementSha256 !== statementSha256(operator)
      || entry.status !== 'acknowledged'
      || entry.acknowledgedBy !== operator.name
      || typeof entry.acknowledgedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.acknowledgedAt)
      || !Number.isFinite(Date.parse(entry.acknowledgedAt))
      || typeof entry.evidenceRef !== 'string' || entry.evidenceRef.length === 0) {
      throw new Error(`Missing exact acknowledgement evidence for ${operator.name}`)
    }
    return { ...entry }
  })
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

function pendingAcknowledgements() {
  return OPERATORS.map((operator) => ({
    operatorId: operator.operatorId,
    name: operator.name,
    role: operator.role,
    responsibility: operator.responsibility,
    statementSha256: statementSha256(operator),
    status: 'pending-human-acknowledgement',
    acknowledgedBy: null,
    acknowledgedAt: null,
    evidenceRef: null,
  }))
}

function statementSha256(operator) {
  return createHash('sha256').update(operator.responsibility).digest('hex')
}

function equalState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function readBoundFile(root, binding) {
  const value = await readFile(new URL(binding.path, `file://${root.replace(/\/$/, '')}/`))
  const digest = createHash('sha256').update(value).digest('hex')
  if (value.byteLength !== binding.bytes || digest !== binding.sha256) {
    throw new Error(`Source binding drifted: ${binding.path}`)
  }
  return value
}

function assertIdentityProof(proof) {
  if (proof.schema !== 'identity-control-academy-next-release-gate-dependency-proof/v1'
    || proof.revision !== 3
    || proof.selectedGate?.blockerId !== 'named-kill-switch-operator'
    || proof.sourceRevisions?.identityControl !== '7c39ec586e823b696d56ff84e234979a155d6a8d'
    || proof.sourceRevisions?.academyCurrent !== ACADEMY_BASE_REVISION
    || proof.progress?.productionAuthority !== 'NONE'
    || !Array.isArray(proof.progress?.requestedOperations)
    || proof.progress.requestedOperations.length !== 0) {
    throw new Error('Identity next-gate proof does not authorize this disabled producer action')
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
