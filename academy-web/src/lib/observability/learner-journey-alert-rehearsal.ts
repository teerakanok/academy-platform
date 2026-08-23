import type { LearnerJourneySloEvaluation } from './learner-journey-slo'

export const LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION = '1'

export const LEARNER_JOURNEY_ALERT_POLICY_KEYS = [
  'schemaVersion',
  'enabled',
  'primaryRoute',
  'escalationRoute',
  'dedupeWindowSeconds',
  'maxDeliveryAttempts',
  'criticalEscalationDelaySeconds',
] as const

export const LEARNER_JOURNEY_ALERT_STATUSES = [
  'healthy',
  'warning',
  'critical',
  'no_data',
] as const

export const LEARNER_JOURNEY_ALERT_CHECKPOINTS = [
  'public_catalog_availability',
  'sign_in_availability',
  'identity_authorization_start',
  'identity_callback_completion',
  'learner_enrollment_completion',
  'learner_progress_persistence',
] as const

export const LEARNER_JOURNEY_ALERT_REASONS = ['data_gap', 'burn_rate'] as const

export const LEARNER_JOURNEY_ALERT_ROUTES = [
  'academy_ops_primary',
  'academy_ops_escalation',
] as const

export const LEARNER_JOURNEY_DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'exhausted',
] as const

export const LEARNER_JOURNEY_DELIVERY_OUTCOMES = [
  'success',
  'retryable_failure',
] as const

const SLO_POLICY_KEYS = [
  'schemaVersion',
  'objectiveWindowSeconds',
  'targetSuccessBasisPoints',
  'minimumObservations',
  'warningBurnRateMilli',
  'criticalBurnRateMilli',
] as const

const SLO_CHECKPOINT_KEYS = [
  'checkpoint',
  'observations',
  'successes',
  'expectedDenials',
  'failures',
  'budgetConsumedBasisPoints',
  'burnRateMilli',
  'status',
] as const

const EVALUATION_KEYS = ['policy', 'checkpoints', 'summary'] as const
const SUMMARY_KEYS = ['status'] as const
const CRITICAL_ANCHOR_KEYS = ['checkpoint', 'firstObservedAtSeconds'] as const
const STATE_KEYS = [
  'schemaVersion',
  'windowBucket',
  'criticalAnchors',
  'deliveries',
] as const
const DELIVERY_KEYS = [
  'fingerprint',
  'checkpoint',
  'status',
  'reason',
  'route',
  'deliveryStatus',
  'attempts',
  'firstObservedAtSeconds',
] as const
const OUTCOME_KEYS = ['fingerprint', 'outcome'] as const

const MAXIMUM_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const MINIMUM_WINDOW_SECONDS = 1
const MAXIMUM_WINDOW_SECONDS = 86_400
const MINIMUM_DELIVERY_ATTEMPTS = 1
const MAXIMUM_DELIVERY_ATTEMPTS = 10
const MINIMUM_ESCALATION_DELAY_SECONDS = 0
const MAXIMUM_ESCALATION_DELAY_SECONDS = 86_400
const MINIMUM_BURN_RATE_MILLI = 0
const MAXIMUM_BURN_RATE_MILLI = 100_000
const MAXIMUM_COUNT = 1_000_000

export type LearnerJourneyAlertSchemaVersion =
  typeof LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION
export type LearnerJourneyAlertPolicyKey =
  (typeof LEARNER_JOURNEY_ALERT_POLICY_KEYS)[number]
export type LearnerJourneyAlertStatus =
  (typeof LEARNER_JOURNEY_ALERT_STATUSES)[number]
export type LearnerJourneyAlertCheckpoint =
  (typeof LEARNER_JOURNEY_ALERT_CHECKPOINTS)[number]
export type LearnerJourneyAlertReason =
  (typeof LEARNER_JOURNEY_ALERT_REASONS)[number]
export type LearnerJourneyAlertRoute =
  (typeof LEARNER_JOURNEY_ALERT_ROUTES)[number]
export type LearnerJourneyDeliveryStatus =
  (typeof LEARNER_JOURNEY_DELIVERY_STATUSES)[number]
export type LearnerJourneyDeliveryOutcome =
  (typeof LEARNER_JOURNEY_DELIVERY_OUTCOMES)[number]

export interface LearnerJourneyAlertPolicy {
  readonly schemaVersion: LearnerJourneyAlertSchemaVersion
  readonly enabled: false
  readonly primaryRoute: 'academy_ops_primary'
  readonly escalationRoute: 'academy_ops_escalation'
  readonly dedupeWindowSeconds: number
  readonly maxDeliveryAttempts: number
  readonly criticalEscalationDelaySeconds: number
}

export interface LearnerJourneyAlert {
  readonly fingerprint: string
  readonly checkpoint: LearnerJourneyAlertCheckpoint
  readonly status: LearnerJourneyAlertStatus
  readonly reason: LearnerJourneyAlertReason
  readonly route: LearnerJourneyAlertRoute
  readonly windowBucket: number
}

export interface LearnerJourneyAlertDelivery {
  readonly fingerprint: string
  readonly checkpoint: LearnerJourneyAlertCheckpoint
  readonly status: LearnerJourneyAlertStatus
  readonly reason: LearnerJourneyAlertReason
  readonly route: LearnerJourneyAlertRoute
  readonly deliveryStatus: LearnerJourneyDeliveryStatus
  readonly attempts: number
  readonly firstObservedAtSeconds: number
}

export interface LearnerJourneyAlertRehearsalState {
  readonly schemaVersion: LearnerJourneyAlertSchemaVersion
  readonly windowBucket: number
  readonly criticalAnchors: readonly LearnerJourneyCriticalAnchor[]
  readonly deliveries: readonly LearnerJourneyAlertDelivery[]
}

export interface LearnerJourneyCriticalAnchor {
  readonly checkpoint: LearnerJourneyAlertCheckpoint
  readonly firstObservedAtSeconds: number
}

export interface LearnerJourneyAlertDeliveryOutcomeInput {
  readonly fingerprint: string
  readonly outcome: LearnerJourneyDeliveryOutcome
}

export interface LearnerJourneyAlertRehearsalProjection {
  readonly schemaVersion: LearnerJourneyAlertSchemaVersion
  readonly state: LearnerJourneyAlertRehearsalState
  readonly alerts: readonly LearnerJourneyAlert[]
}

export const INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE: LearnerJourneyAlertRehearsalState =
  deepFreeze({
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    windowBucket: 0,
    criticalAnchors: [],
    deliveries: [],
  })

function invalidPolicy(): never {
  throw new TypeError('invalid_learner_journey_alert_policy')
}

function invalidEvaluation(): never {
  throw new TypeError('invalid_learner_journey_slo_evaluation')
}

function invalidState(): never {
  throw new TypeError('invalid_learner_journey_alert_state')
}

function invalidOutcome(): never {
  throw new TypeError('invalid_learner_journey_alert_delivery_outcome')
}

function isStrictOwnDataObject<AllowedKey extends string>(
  input: unknown,
  allowedKeys: readonly AllowedKey[],
): input is { readonly [Key in AllowedKey]: unknown } {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    return false
  }

  const ownKeys = Reflect.ownKeys(input)
  if (ownKeys.length !== allowedKeys.length) return false

  return ownKeys.every((ownKey) => {
    if (
      typeof ownKey === 'symbol' ||
      !allowedKeys.includes(ownKey as AllowedKey)
    )
      return false
    const descriptor = Reflect.getOwnPropertyDescriptor(input, ownKey)
    return (
      descriptor !== undefined &&
      descriptor.enumerable === true &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    )
  })
}

function isSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number = MAXIMUM_SAFE_INTEGER,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function isOneOf<AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[],
): value is AllowedValue {
  return (
    typeof value === 'string' &&
    allowedValues.some((allowedValue) => allowedValue === value)
  )
}

function validateStrictArray(
  input: unknown,
  length: number,
): readonly unknown[] | undefined {
  if (
    typeof input !== 'object' ||
    input === null ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length !== length ||
    Object.keys(input).length !== length ||
    Reflect.ownKeys(input).length !== length + 1
  ) {
    return undefined
  }

  for (const ownKey of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, ownKey)
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return undefined
    }

    if (ownKey === 'length') {
      if (
        descriptor.value !== length ||
        descriptor.enumerable !== false ||
        descriptor.configurable !== false
      ) {
        return undefined
      }
      continue
    }

    if (
      typeof ownKey !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(ownKey) ||
      Number(ownKey) >= length ||
      descriptor.enumerable !== true
    ) {
      return undefined
    }
  }

  return input
}

export function validateLearnerJourneyAlertPolicy(
  input: unknown,
): LearnerJourneyAlertPolicy {
  if (!isStrictOwnDataObject(input, LEARNER_JOURNEY_ALERT_POLICY_KEYS))
    invalidPolicy()

  const dedupeWindowSeconds = input.dedupeWindowSeconds
  const maxDeliveryAttempts = input.maxDeliveryAttempts
  const criticalEscalationDelaySeconds = input.criticalEscalationDelaySeconds

  if (
    input.schemaVersion !== LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION ||
    input.enabled !== false ||
    input.primaryRoute !== 'academy_ops_primary' ||
    input.escalationRoute !== 'academy_ops_escalation' ||
    !isSafeIntegerInRange(
      dedupeWindowSeconds,
      MINIMUM_WINDOW_SECONDS,
      MAXIMUM_WINDOW_SECONDS,
    ) ||
    !isSafeIntegerInRange(
      maxDeliveryAttempts,
      MINIMUM_DELIVERY_ATTEMPTS,
      MAXIMUM_DELIVERY_ATTEMPTS,
    ) ||
    !isSafeIntegerInRange(
      criticalEscalationDelaySeconds,
      MINIMUM_ESCALATION_DELAY_SECONDS,
      MAXIMUM_ESCALATION_DELAY_SECONDS,
    )
  ) {
    invalidPolicy()
  }

  return deepFreeze({
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    enabled: false,
    primaryRoute: 'academy_ops_primary',
    escalationRoute: 'academy_ops_escalation',
    dedupeWindowSeconds,
    maxDeliveryAttempts,
    criticalEscalationDelaySeconds,
  })
}

function validateSloPolicy(input: unknown): void {
  if (!isStrictOwnDataObject(input, SLO_POLICY_KEYS)) invalidEvaluation()

  if (
    input.schemaVersion !== '1' ||
    !isSafeIntegerInRange(input.objectiveWindowSeconds, 86_400, 2_592_000) ||
    !isSafeIntegerInRange(input.targetSuccessBasisPoints, 9_000, 9_999) ||
    !isSafeIntegerInRange(input.minimumObservations, 1, MAXIMUM_COUNT) ||
    !isSafeIntegerInRange(
      input.warningBurnRateMilli,
      1_000,
      MAXIMUM_BURN_RATE_MILLI,
    ) ||
    !isSafeIntegerInRange(
      input.criticalBurnRateMilli,
      1_000,
      MAXIMUM_BURN_RATE_MILLI,
    ) ||
    input.criticalBurnRateMilli <= input.warningBurnRateMilli
  ) {
    invalidEvaluation()
  }
}

function statusForBurnRate(
  burnRateMilli: number,
  warningBurnRateMilli: unknown,
  criticalBurnRateMilli: unknown,
): LearnerJourneyAlertStatus {
  if (
    !isSafeIntegerInRange(
      warningBurnRateMilli,
      1_000,
      MAXIMUM_BURN_RATE_MILLI,
    ) ||
    !isSafeIntegerInRange(criticalBurnRateMilli, 1_000, MAXIMUM_BURN_RATE_MILLI)
  ) {
    invalidEvaluation()
  }
  if (burnRateMilli >= criticalBurnRateMilli) return 'critical'
  if (burnRateMilli >= warningBurnRateMilli) return 'warning'
  return 'healthy'
}

function validateEvaluation(input: unknown): LearnerJourneySloEvaluation {
  if (!isStrictOwnDataObject(input, EVALUATION_KEYS)) invalidEvaluation()
  validateSloPolicy(input.policy)

  const checkpointInputs = validateStrictArray(
    input.checkpoints,
    LEARNER_JOURNEY_ALERT_CHECKPOINTS.length,
  )
  if (checkpointInputs === undefined) invalidEvaluation()
  if (!isStrictOwnDataObject(input.summary, SUMMARY_KEYS)) invalidEvaluation()
  if (!isOneOf(input.summary.status, LEARNER_JOURNEY_ALERT_STATUSES))
    invalidEvaluation()

  const sloPolicy = input.policy as {
    readonly minimumObservations: number
    readonly warningBurnRateMilli: unknown
    readonly criticalBurnRateMilli: unknown
  }
  const checkpoints = checkpointInputs.map((checkpointInput, index) => {
    if (!isStrictOwnDataObject(checkpointInput, SLO_CHECKPOINT_KEYS))
      invalidEvaluation()
    if (
      checkpointInput.checkpoint !== LEARNER_JOURNEY_ALERT_CHECKPOINTS[index] ||
      !isOneOf(checkpointInput.status, LEARNER_JOURNEY_ALERT_STATUSES) ||
      !isSafeIntegerInRange(checkpointInput.observations, 0, MAXIMUM_COUNT) ||
      !isSafeIntegerInRange(checkpointInput.successes, 0, MAXIMUM_COUNT) ||
      !isSafeIntegerInRange(
        checkpointInput.expectedDenials,
        0,
        MAXIMUM_COUNT,
      ) ||
      !isSafeIntegerInRange(checkpointInput.failures, 0, MAXIMUM_COUNT) ||
      checkpointInput.successes +
        checkpointInput.expectedDenials +
        checkpointInput.failures >
        MAXIMUM_COUNT
    ) {
      invalidEvaluation()
    }

    const observedCount =
      checkpointInput.successes +
      checkpointInput.expectedDenials +
      checkpointInput.failures
    if (observedCount !== checkpointInput.observations) invalidEvaluation()

    const hasData = checkpointInput.status !== 'no_data'
    if (
      (hasData &&
        checkpointInput.observations < sloPolicy.minimumObservations) ||
      (!hasData &&
        checkpointInput.observations >= sloPolicy.minimumObservations) ||
      (hasData &&
        !isSafeIntegerInRange(
          checkpointInput.burnRateMilli,
          MINIMUM_BURN_RATE_MILLI,
          MAXIMUM_BURN_RATE_MILLI,
        )) ||
      (!hasData && checkpointInput.burnRateMilli !== null) ||
      (hasData && checkpointInput.budgetConsumedBasisPoints === null) ||
      (!hasData && checkpointInput.budgetConsumedBasisPoints !== null)
    ) {
      invalidEvaluation()
    }
    if (hasData) {
      const burnRateMilli = checkpointInput.burnRateMilli
      const budgetConsumedBasisPoints =
        checkpointInput.budgetConsumedBasisPoints
      if (
        !isSafeIntegerInRange(
          burnRateMilli,
          MINIMUM_BURN_RATE_MILLI,
          MAXIMUM_BURN_RATE_MILLI,
        ) ||
        !isSafeIntegerInRange(
          budgetConsumedBasisPoints,
          0,
          MAXIMUM_SAFE_INTEGER,
        ) ||
        statusForBurnRate(
          burnRateMilli,
          sloPolicy.warningBurnRateMilli,
          sloPolicy.criticalBurnRateMilli,
        ) !== checkpointInput.status
      ) {
        invalidEvaluation()
      }
    }

    return {
      checkpoint: checkpointInput.checkpoint,
      status: checkpointInput.status,
    }
  })

  const statusOrder: readonly LearnerJourneyAlertStatus[] = [
    'critical',
    'warning',
    'no_data',
    'healthy',
  ]
  const summaryStatus = statusOrder.find((status) =>
    checkpoints.some((checkpoint) => checkpoint.status === status),
  )
  if (summaryStatus !== input.summary.status) invalidEvaluation()

  return deepFreeze({
    policy: deepFreeze({ ...(input.policy as object) }),
    checkpoints: deepFreeze(checkpoints),
    summary: deepFreeze({ status: input.summary.status }),
  }) as unknown as LearnerJourneySloEvaluation
}

function fingerprintFor(
  checkpoint: LearnerJourneyAlertCheckpoint,
  status: LearnerJourneyAlertStatus,
  windowBucket: number,
  reason: LearnerJourneyAlertReason,
  route: LearnerJourneyAlertRoute,
): string {
  return `${checkpoint}|${status}|${windowBucket}|${reason}|${route}`
}

function deliveryRank(delivery: LearnerJourneyAlertDelivery): number {
  const checkpointIndex = LEARNER_JOURNEY_ALERT_CHECKPOINTS.indexOf(
    delivery.checkpoint,
  )
  const routeIndex = LEARNER_JOURNEY_ALERT_ROUTES.indexOf(delivery.route)
  return checkpointIndex * LEARNER_JOURNEY_ALERT_ROUTES.length + routeIndex
}

function parseFingerprint(
  fingerprint: string,
  windowBucket: number,
): Omit<LearnerJourneyAlert, 'fingerprint' | 'windowBucket'> {
  const parts = fingerprint.split('|')
  if (parts.length !== 5) invalidState()
  const [checkpoint, status, bucketText, reason, route] = parts
  if (
    !isOneOf(checkpoint, LEARNER_JOURNEY_ALERT_CHECKPOINTS) ||
    !isOneOf(status, LEARNER_JOURNEY_ALERT_STATUSES) ||
    !isOneOf(reason, LEARNER_JOURNEY_ALERT_REASONS) ||
    !isOneOf(route, LEARNER_JOURNEY_ALERT_ROUTES) ||
    bucketText !== `${windowBucket}`
  ) {
    invalidState()
  }
  return { checkpoint, status, reason, route }
}

export function validateLearnerJourneyAlertRehearsalState(
  input: unknown,
): LearnerJourneyAlertRehearsalState {
  if (!isStrictOwnDataObject(input, STATE_KEYS)) invalidState()

  const windowBucket = input.windowBucket
  if (
    input.schemaVersion !== LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION ||
    !isSafeIntegerInRange(windowBucket, 0)
  ) {
    invalidState()
  }

  const deliveryInputs = input.deliveries
  const deliveries = validateStrictArray(
    deliveryInputs,
    deliveryInputs instanceof Array ? deliveryInputs.length : -1,
  )
  if (deliveries === undefined) invalidState()

  const anchorInputs = input.criticalAnchors
  const anchors = validateStrictArray(
    anchorInputs,
    anchorInputs instanceof Array ? anchorInputs.length : -1,
  )
  if (anchors === undefined) invalidState()

  const seen = new Set<string>()
  let previousRank = -1
  const anchorsByCheckpoint = new Map<LearnerJourneyAlertCheckpoint, number>()
  let previousAnchorIndex = -1
  anchors.forEach((anchorCandidate) => {
    if (!isStrictOwnDataObject(anchorCandidate, CRITICAL_ANCHOR_KEYS))
      invalidState()
    if (
      !isOneOf(anchorCandidate.checkpoint, LEARNER_JOURNEY_ALERT_CHECKPOINTS) ||
      !isSafeIntegerInRange(anchorCandidate.firstObservedAtSeconds, 0)
    ) {
      invalidState()
    }
    const checkpoint = anchorCandidate.checkpoint
    const anchorIndex = LEARNER_JOURNEY_ALERT_CHECKPOINTS.indexOf(checkpoint)
    if (
      anchorIndex <= previousAnchorIndex ||
      anchorsByCheckpoint.has(checkpoint)
    ) {
      invalidState()
    }
    previousAnchorIndex = anchorIndex
    anchorsByCheckpoint.set(checkpoint, anchorCandidate.firstObservedAtSeconds)
  })

  const canonicalDeliveries = deliveries.map((deliveryInput) => {
    if (!isStrictOwnDataObject(deliveryInput, DELIVERY_KEYS)) invalidState()
    const attempts = deliveryInput.attempts
    const firstObservedAtSeconds = deliveryInput.firstObservedAtSeconds
    if (
      !isOneOf(deliveryInput.checkpoint, LEARNER_JOURNEY_ALERT_CHECKPOINTS) ||
      !isOneOf(deliveryInput.status, LEARNER_JOURNEY_ALERT_STATUSES) ||
      !isOneOf(deliveryInput.reason, LEARNER_JOURNEY_ALERT_REASONS) ||
      !isOneOf(deliveryInput.route, LEARNER_JOURNEY_ALERT_ROUTES) ||
      !isOneOf(
        deliveryInput.deliveryStatus,
        LEARNER_JOURNEY_DELIVERY_STATUSES,
      ) ||
      typeof deliveryInput.fingerprint !== 'string' ||
      !isSafeIntegerInRange(attempts, 0, MAXIMUM_DELIVERY_ATTEMPTS) ||
      !isSafeIntegerInRange(firstObservedAtSeconds, 0)
    ) {
      invalidState()
    }

    const parsed = parseFingerprint(deliveryInput.fingerprint, windowBucket)
    const delivery = {
      fingerprint: deliveryInput.fingerprint,
      checkpoint: parsed.checkpoint,
      status: parsed.status,
      reason: parsed.reason,
      route: parsed.route,
      deliveryStatus: deliveryInput.deliveryStatus,
      attempts,
      firstObservedAtSeconds,
    }
    if (
      delivery.checkpoint !== deliveryInput.checkpoint ||
      delivery.status !== deliveryInput.status ||
      delivery.reason !== deliveryInput.reason ||
      delivery.route !== deliveryInput.route ||
      (delivery.status === 'no_data' &&
        (delivery.reason !== 'data_gap' ||
          delivery.route !== 'academy_ops_primary')) ||
      (delivery.status === 'warning' &&
        (delivery.reason !== 'burn_rate' ||
          delivery.route !== 'academy_ops_primary')) ||
      (delivery.status === 'critical' && delivery.reason !== 'burn_rate') ||
      (delivery.route === 'academy_ops_escalation' &&
        delivery.status !== 'critical') ||
      (delivery.deliveryStatus !== 'pending' && attempts < 1) ||
      seen.has(delivery.fingerprint)
    ) {
      invalidState()
    }
    const rank = deliveryRank(delivery)
    if (rank <= previousRank) invalidState()
    previousRank = rank
    seen.add(delivery.fingerprint)
    return delivery
  })
  for (const delivery of canonicalDeliveries) {
    if (
      delivery.status !== 'critical' ||
      delivery.route !== 'academy_ops_primary'
    )
      continue
    const anchoredAt = anchorsByCheckpoint.get(delivery.checkpoint)
    if (anchoredAt !== delivery.firstObservedAtSeconds) invalidState()
  }

  for (const checkpoint of anchorsByCheckpoint.keys()) {
    const hasCriticalPrimary = canonicalDeliveries.some(
      (delivery) =>
        delivery.checkpoint === checkpoint &&
        delivery.status === 'critical' &&
        delivery.route === 'academy_ops_primary',
    )
    if (!hasCriticalPrimary) invalidState()
  }

  return deepFreeze({
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    windowBucket,
    criticalAnchors: [...anchorsByCheckpoint].map(
      ([checkpoint, firstObservedAtSeconds]) => ({
        checkpoint,
        firstObservedAtSeconds,
      }),
    ),
    deliveries: canonicalDeliveries,
  })
}

export function validateLearnerJourneyAlertDeliveryOutcome(
  input: unknown,
): LearnerJourneyAlertDeliveryOutcomeInput {
  if (!isStrictOwnDataObject(input, OUTCOME_KEYS)) invalidOutcome()
  if (
    typeof input.fingerprint !== 'string' ||
    !isOneOf(input.outcome, LEARNER_JOURNEY_DELIVERY_OUTCOMES)
  ) {
    invalidOutcome()
  }
  return deepFreeze({ fingerprint: input.fingerprint, outcome: input.outcome })
}

function alertFor(
  checkpoint: LearnerJourneyAlertCheckpoint,
  status: LearnerJourneyAlertStatus,
  reason: LearnerJourneyAlertReason,
  route: LearnerJourneyAlertRoute,
  windowBucket: number,
): LearnerJourneyAlert {
  const fingerprint = fingerprintFor(
    checkpoint,
    status,
    windowBucket,
    reason,
    route,
  )
  return deepFreeze({
    fingerprint,
    checkpoint,
    status,
    reason,
    route,
    windowBucket,
  })
}

export function projectLearnerJourneyAlertRehearsal(
  policyInput: unknown,
  evaluationInput: unknown,
  priorStateInput: unknown,
  observedAtSeconds: number,
): LearnerJourneyAlertRehearsalProjection {
  const policy = validateLearnerJourneyAlertPolicy(policyInput)
  const evaluation = validateEvaluation(evaluationInput)
  const priorState = validateLearnerJourneyAlertRehearsalState(priorStateInput)
  if (!isSafeIntegerInRange(observedAtSeconds, 0)) invalidEvaluation()

  const windowBucket = Math.floor(
    observedAtSeconds / policy.dedupeWindowSeconds,
  )
  const retainedDeliveries =
    priorState.windowBucket === windowBucket
      ? priorState.deliveries.map((delivery) => ({ ...delivery }))
      : []
  const deliveriesByKey = new Map(
    retainedDeliveries.map((delivery) => [delivery.fingerprint, delivery]),
  )
  const priorAnchors = new Map(
    priorState.criticalAnchors.map((anchor) => [
      anchor.checkpoint,
      anchor.firstObservedAtSeconds,
    ]),
  )
  const anchors = new Map<LearnerJourneyAlertCheckpoint, number>()
  const alerts: LearnerJourneyAlert[] = []

  for (const checkpoint of evaluation.checkpoints) {
    if (checkpoint.status === 'healthy') continue

    const reason = checkpoint.status === 'no_data' ? 'data_gap' : 'burn_rate'
    const primary = alertFor(
      checkpoint.checkpoint,
      checkpoint.status,
      reason,
      policy.primaryRoute,
      windowBucket,
    )
    const existingPrimary = deliveriesByKey.get(primary.fingerprint)
    if (checkpoint.status === 'critical') {
      anchors.set(
        checkpoint.checkpoint,
        priorAnchors.get(checkpoint.checkpoint) ?? observedAtSeconds,
      )
    }
    if (existingPrimary === undefined) {
      const firstObservedAtSeconds =
        anchors.get(checkpoint.checkpoint) ?? observedAtSeconds
      deliveriesByKey.set(primary.fingerprint, {
        fingerprint: primary.fingerprint,
        checkpoint: primary.checkpoint,
        status: primary.status,
        reason: primary.reason,
        route: primary.route,
        deliveryStatus: 'pending',
        attempts: 0,
        firstObservedAtSeconds,
      })
      alerts.push(primary)
    }

    if (checkpoint.status !== 'critical') continue

    const existingDelivery =
      existingPrimary ?? deliveriesByKey.get(primary.fingerprint)
    if (existingDelivery === undefined) invalidState()
    const elapsedSeconds =
      observedAtSeconds - existingDelivery.firstObservedAtSeconds
    if (elapsedSeconds < policy.criticalEscalationDelaySeconds) continue

    const escalation = alertFor(
      checkpoint.checkpoint,
      checkpoint.status,
      reason,
      policy.escalationRoute,
      windowBucket,
    )
    if (!deliveriesByKey.has(escalation.fingerprint)) {
      deliveriesByKey.set(escalation.fingerprint, {
        fingerprint: escalation.fingerprint,
        checkpoint: escalation.checkpoint,
        status: escalation.status,
        reason: escalation.reason,
        route: escalation.route,
        deliveryStatus: 'pending',
        attempts: 0,
        firstObservedAtSeconds: observedAtSeconds,
      })
      alerts.push(escalation)
    }
  }

  const deliveries = [...deliveriesByKey.values()].sort(
    (left, right) => deliveryRank(left) - deliveryRank(right),
  )
  const state: LearnerJourneyAlertRehearsalState = {
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    windowBucket,
    criticalAnchors: [...anchors].map(
      ([checkpoint, firstObservedAtSeconds]) => ({
        checkpoint,
        firstObservedAtSeconds,
      }),
    ),
    deliveries,
  }

  return deepFreeze({
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    state,
    alerts: deepFreeze(alerts),
  })
}

export function recordLearnerJourneyAlertDeliveryOutcome(
  policyInput: unknown,
  stateInput: unknown,
  outcomeInput: unknown,
): LearnerJourneyAlertRehearsalState {
  const policy = validateLearnerJourneyAlertPolicy(policyInput)
  const state = validateLearnerJourneyAlertRehearsalState(stateInput)
  const outcome = validateLearnerJourneyAlertDeliveryOutcome(outcomeInput)

  const index = state.deliveries.findIndex(
    (delivery) => delivery.fingerprint === outcome.fingerprint,
  )
  if (index === -1) invalidOutcome()
  const delivery = state.deliveries[index]
  if (delivery.deliveryStatus !== 'pending') invalidOutcome()

  const attempts = delivery.attempts + 1
  if (attempts > policy.maxDeliveryAttempts) invalidOutcome()
  const deliveryStatus: LearnerJourneyDeliveryStatus =
    outcome.outcome === 'success' || attempts === policy.maxDeliveryAttempts
      ? outcome.outcome === 'success'
        ? 'delivered'
        : 'exhausted'
      : 'pending'
  const nextDelivery = {
    ...delivery,
    attempts,
    deliveryStatus,
  }
  const deliveries = state.deliveries.map((candidate, candidateIndex) =>
    candidateIndex === index ? nextDelivery : candidate,
  )

  return deepFreeze({
    schemaVersion: LEARNER_JOURNEY_ALERT_REHEARSAL_SCHEMA_VERSION,
    windowBucket: state.windowBucket,
    criticalAnchors: state.criticalAnchors.map((anchor) => ({ ...anchor })),
    deliveries,
  })
}

export function rollbackLearnerJourneyAlertRehearsal(
  currentStateInput: unknown,
  priorStateInput: unknown,
): LearnerJourneyAlertRehearsalState {
  validateLearnerJourneyAlertRehearsalState(currentStateInput)
  return validateLearnerJourneyAlertRehearsalState(priorStateInput)
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value
  for (const property of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, property)
    if (
      descriptor !== undefined &&
      typeof descriptor.value === 'object' &&
      descriptor.value !== null
    ) {
      deepFreeze(descriptor.value)
    }
  }
  Object.freeze(value)
  return value
}
