import { LEARNER_JOURNEY_CHECKPOINTS, type LearnerJourneyCheckpoint } from './learner-journey'

export const LEARNER_JOURNEY_SLO_SCHEMA_VERSION = '1'

export const LEARNER_JOURNEY_SLO_POLICY_KEYS = [
  'schemaVersion',
  'objectiveWindowSeconds',
  'targetSuccessBasisPoints',
  'minimumObservations',
  'warningBurnRateMilli',
  'criticalBurnRateMilli',
] as const

export const LEARNER_JOURNEY_SLO_AGGREGATE_KEYS = [
  'checkpoint',
  'successes',
  'expectedDenials',
  'failures',
] as const

const DAY_IN_SECONDS = 86_400
const THIRTY_DAYS_IN_SECONDS = 2_592_000
const MINIMUM_SUCCESS_BASIS_POINTS = 9_000
const MAXIMUM_SUCCESS_BASIS_POINTS = 9_999
const MINIMUM_BURN_RATE_MILLI = 1_000
const MAXIMUM_BURN_RATE_MILLI = 100_000
const MAXIMUM_JOURNEY_COUNT = 1_000_000
const FULL_BUDGET_BASIS_POINTS = BigInt(10_000)
const BURN_RATE_DIVISOR = BigInt(10)
const ZERO = BigInt(0)
const ONE = BigInt(1)
const MAXIMUM_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)

export type LearnerJourneySloSchemaVersion = typeof LEARNER_JOURNEY_SLO_SCHEMA_VERSION
export type LearnerJourneySloPolicyKey = (typeof LEARNER_JOURNEY_SLO_POLICY_KEYS)[number]
export type LearnerJourneySloAggregateKey = (typeof LEARNER_JOURNEY_SLO_AGGREGATE_KEYS)[number]
export type LearnerJourneySloStatus = 'healthy' | 'warning' | 'critical' | 'no_data'

export interface LearnerJourneySloPolicy {
  readonly schemaVersion: LearnerJourneySloSchemaVersion
  readonly objectiveWindowSeconds: number
  readonly targetSuccessBasisPoints: number
  readonly minimumObservations: number
  readonly warningBurnRateMilli: number
  readonly criticalBurnRateMilli: number
}

export interface LearnerJourneySloAggregate {
  readonly checkpoint: LearnerJourneyCheckpoint
  readonly successes: number
  readonly expectedDenials: number
  readonly failures: number
}

export interface LearnerJourneySloCheckpointResult {
  readonly checkpoint: LearnerJourneyCheckpoint
  readonly observations: number
  readonly successes: number
  readonly expectedDenials: number
  readonly failures: number
  readonly budgetConsumedBasisPoints: number | null
  readonly burnRateMilli: number | null
  readonly status: LearnerJourneySloStatus
}

export interface LearnerJourneySloSummary {
  readonly status: LearnerJourneySloStatus
}

export interface LearnerJourneySloEvaluation {
  readonly policy: LearnerJourneySloPolicy
  readonly checkpoints: readonly LearnerJourneySloCheckpointResult[]
  readonly summary: LearnerJourneySloSummary
}

function invalidPolicy(): never {
  throw new TypeError('invalid_learner_journey_slo_policy')
}

function invalidAggregate(): never {
  throw new TypeError('invalid_learner_journey_slo_aggregate')
}

function invalidEvaluation(): never {
  throw new TypeError('invalid_learner_journey_slo_evaluation')
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
    if (!allowedKeys.some((allowedKey) => allowedKey === ownKey)) return false
    const descriptor = Reflect.getOwnPropertyDescriptor(input, ownKey)
    return (
      descriptor !== undefined &&
      descriptor.enumerable === true &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    )
  })
}

function isSafeIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  )
}

function isOneOf<AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[],
): value is AllowedValue {
  return typeof value === 'string' && allowedValues.some((allowedValue) => allowedValue === value)
}

export function validateLearnerJourneySloPolicy(input: unknown): LearnerJourneySloPolicy {
  if (!isStrictOwnDataObject(input, LEARNER_JOURNEY_SLO_POLICY_KEYS)) invalidPolicy()

  const objectiveWindowSeconds = input.objectiveWindowSeconds
  const targetSuccessBasisPoints = input.targetSuccessBasisPoints
  const minimumObservations = input.minimumObservations
  const warningBurnRateMilli = input.warningBurnRateMilli
  const criticalBurnRateMilli = input.criticalBurnRateMilli

  if (
    input.schemaVersion !== LEARNER_JOURNEY_SLO_SCHEMA_VERSION ||
    !isSafeIntegerInRange(objectiveWindowSeconds, DAY_IN_SECONDS, THIRTY_DAYS_IN_SECONDS) ||
    !isSafeIntegerInRange(
      targetSuccessBasisPoints,
      MINIMUM_SUCCESS_BASIS_POINTS,
      MAXIMUM_SUCCESS_BASIS_POINTS,
    ) ||
    !isSafeIntegerInRange(minimumObservations, 1, MAXIMUM_JOURNEY_COUNT) ||
    !isSafeIntegerInRange(warningBurnRateMilli, MINIMUM_BURN_RATE_MILLI, MAXIMUM_BURN_RATE_MILLI) ||
    !isSafeIntegerInRange(criticalBurnRateMilli, MINIMUM_BURN_RATE_MILLI, MAXIMUM_BURN_RATE_MILLI) ||
    criticalBurnRateMilli <= warningBurnRateMilli
  ) {
    invalidPolicy()
  }

  return Object.freeze({
    schemaVersion: LEARNER_JOURNEY_SLO_SCHEMA_VERSION,
    objectiveWindowSeconds,
    targetSuccessBasisPoints,
    minimumObservations,
    warningBurnRateMilli,
    criticalBurnRateMilli,
  })
}

function readCount(
  input: { readonly successes: unknown; readonly expectedDenials: unknown; readonly failures: unknown },
  key: 'successes' | 'expectedDenials' | 'failures',
): number {
  const count = input[key]
  if (!isSafeIntegerInRange(count, 0, MAXIMUM_JOURNEY_COUNT)) invalidAggregate()
  return count
}

function validateAggregateRecord(input: unknown): LearnerJourneySloAggregate {
  if (!isStrictOwnDataObject(input, LEARNER_JOURNEY_SLO_AGGREGATE_KEYS)) invalidAggregate()
  if (!isOneOf(input.checkpoint, LEARNER_JOURNEY_CHECKPOINTS)) {
    invalidAggregate()
  }

  const checkpoint = input.checkpoint
  const successes = readCount(input, 'successes')
  const expectedDenials = readCount(input, 'expectedDenials')
  const failures = readCount(input, 'failures')
  if (successes + expectedDenials + failures > MAXIMUM_JOURNEY_COUNT) invalidAggregate()

  return Object.freeze({
    checkpoint,
    successes,
    expectedDenials,
    failures,
  })
}

function validateAggregateArray(input: unknown): readonly LearnerJourneySloAggregate[] {
  if (
    typeof input !== 'object' ||
    input === null ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length !== LEARNER_JOURNEY_CHECKPOINTS.length ||
    Object.keys(input).length !== input.length ||
    Reflect.ownKeys(input).length !== input.length + 1
  ) {
    invalidAggregate()
  }

  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key)
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalidAggregate()
    }

    if (key === 'length') {
      if (
        descriptor.value !== input.length ||
        descriptor.enumerable !== false ||
        descriptor.writable !== true ||
        descriptor.configurable !== false
      ) {
        invalidAggregate()
      }
      continue
    }

    if (
      typeof key !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(key) ||
      Number(key) >= input.length ||
      descriptor.enumerable !== true
    ) {
      invalidAggregate()
    }
  }

  const records: LearnerJourneySloAggregate[] = []
  const seenCheckpoints = new Set<LearnerJourneyCheckpoint>()
  for (const candidate of input) {
    const record = validateAggregateRecord(candidate)
    if (seenCheckpoints.has(record.checkpoint)) invalidAggregate()
    seenCheckpoints.add(record.checkpoint)
    records.push(record)
  }
  if (seenCheckpoints.size !== LEARNER_JOURNEY_CHECKPOINTS.length) invalidAggregate()
  return records
}

function divideCeiling(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return remainder === ZERO ? quotient : quotient + ONE
}

function toSafeNumber(value: bigint): number {
  if (value < ZERO || value > MAXIMUM_SAFE_INTEGER) invalidEvaluation()
  return Number(value)
}

function statusForBurnRate(
  burnRateMilli: number,
  policy: LearnerJourneySloPolicy,
): LearnerJourneySloStatus {
  if (burnRateMilli >= policy.criticalBurnRateMilli) return 'critical'
  if (burnRateMilli >= policy.warningBurnRateMilli) return 'warning'
  return 'healthy'
}

function evaluateCheckpoint(
  aggregate: LearnerJourneySloAggregate,
  policy: LearnerJourneySloPolicy,
): LearnerJourneySloCheckpointResult {
  const observations = aggregate.successes + aggregate.expectedDenials + aggregate.failures
  if (observations < policy.minimumObservations) {
    return Object.freeze({
      checkpoint: aggregate.checkpoint,
      observations,
      successes: aggregate.successes,
      expectedDenials: aggregate.expectedDenials,
      failures: aggregate.failures,
      budgetConsumedBasisPoints: null,
      burnRateMilli: null,
      status: 'no_data',
    })
  }

  const budgetConsumingObservations = aggregate.expectedDenials + aggregate.failures
  const allowedErrors =
    BigInt(observations) * BigInt(10_000 - policy.targetSuccessBasisPoints)
  const budgetConsumedBasisPoints = divideCeiling(
    BigInt(budgetConsumingObservations) *
      FULL_BUDGET_BASIS_POINTS *
      FULL_BUDGET_BASIS_POINTS,
    allowedErrors,
  )
  const burnRateMilli = divideCeiling(budgetConsumedBasisPoints, BURN_RATE_DIVISOR)

  return Object.freeze({
    checkpoint: aggregate.checkpoint,
    observations,
    successes: aggregate.successes,
    expectedDenials: aggregate.expectedDenials,
    failures: aggregate.failures,
    budgetConsumedBasisPoints: toSafeNumber(budgetConsumedBasisPoints),
    burnRateMilli: toSafeNumber(burnRateMilli),
    status: statusForBurnRate(toSafeNumber(burnRateMilli), policy),
  })
}

export function evaluateLearnerJourneySlo(
  policyInput: unknown,
  aggregateInput: unknown,
): LearnerJourneySloEvaluation {
  const policy = validateLearnerJourneySloPolicy(policyInput)
  const aggregates = validateAggregateArray(aggregateInput)
  const checkpoints = LEARNER_JOURNEY_CHECKPOINTS.map((checkpoint) => {
    const aggregate = aggregates.find((candidate) => candidate.checkpoint === checkpoint)
    if (aggregate === undefined) invalidAggregate()
    return evaluateCheckpoint(aggregate, policy)
  })
  const statusOrder: readonly LearnerJourneySloStatus[] = [
    'critical',
    'warning',
    'no_data',
    'healthy',
  ]
  const status = statusOrder.find((candidate) =>
    checkpoints.some((checkpoint) => checkpoint.status === candidate),
  )
  if (status === undefined) invalidEvaluation()

  return Object.freeze({
    policy: Object.freeze({ ...policy }),
    checkpoints: Object.freeze(checkpoints),
    summary: Object.freeze({ status }),
  })
}
