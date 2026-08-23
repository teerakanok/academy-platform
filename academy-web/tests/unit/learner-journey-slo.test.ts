import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEARNER_JOURNEY_CHECKPOINTS,
  type LearnerJourneyCheckpoint,
} from '@/lib/observability/learner-journey'
import {
  LEARNER_JOURNEY_SLO_AGGREGATE_KEYS,
  LEARNER_JOURNEY_SLO_POLICY_KEYS,
  LEARNER_JOURNEY_SLO_SCHEMA_VERSION,
  evaluateLearnerJourneySlo,
  validateLearnerJourneySloPolicy,
} from '@/lib/observability/learner-journey-slo'

type MutableLearnerJourneySloPolicy = {
  schemaVersion: typeof LEARNER_JOURNEY_SLO_SCHEMA_VERSION
  objectiveWindowSeconds: number
  targetSuccessBasisPoints: number
  minimumObservations: number
  warningBurnRateMilli: number
  criticalBurnRateMilli: number
}

type MutableLearnerJourneySloAggregate = {
  checkpoint: LearnerJourneyCheckpoint
  successes: number
  expectedDenials: number
  failures: number
}

type AggregateCounts = Partial<
  Pick<
    MutableLearnerJourneySloAggregate,
    'successes' | 'expectedDenials' | 'failures'
  >
>

function createPolicy(
  overrides: Partial<MutableLearnerJourneySloPolicy> = {},
): MutableLearnerJourneySloPolicy {
  return {
    schemaVersion: LEARNER_JOURNEY_SLO_SCHEMA_VERSION,
    objectiveWindowSeconds: 86_400,
    targetSuccessBasisPoints: 9_900,
    minimumObservations: 1,
    warningBurnRateMilli: 2_000,
    criticalBurnRateMilli: 4_000,
    ...overrides,
  }
}

function createAggregate(
  checkpoint: LearnerJourneyCheckpoint,
  counts: AggregateCounts = {},
): MutableLearnerJourneySloAggregate {
  return {
    checkpoint,
    successes: 100,
    expectedDenials: 0,
    failures: 0,
    ...counts,
  }
}

function createAggregates(
  countsByCheckpoint: Partial<Record<LearnerJourneyCheckpoint, AggregateCounts>> = {},
): MutableLearnerJourneySloAggregate[] {
  return LEARNER_JOURNEY_CHECKPOINTS.map((checkpoint) =>
    createAggregate(checkpoint, countsByCheckpoint[checkpoint]),
  )
}

function expectPolicyRejection(value: unknown): void {
  expect(() => validateLearnerJourneySloPolicy(value)).toThrow(TypeError)
}

function expectEvaluationRejection(policy: unknown, aggregate: unknown): void {
  expect(() => evaluateLearnerJourneySlo(policy, aggregate)).toThrow(TypeError)
}

describe('learner journey SLO', () => {
  it('calculates exact budget and burn boundaries with integer ceiling semantics', () => {
    const result = evaluateLearnerJourneySlo(
      createPolicy(),
      createAggregates({
        public_catalog_availability: { successes: 100, expectedDenials: 0, failures: 0 },
        sign_in_availability: { successes: 99, expectedDenials: 0, failures: 1 },
        identity_authorization_start: {
          successes: 98,
          expectedDenials: 2,
          failures: 0,
        },
        identity_callback_completion: {
          successes: 96,
          expectedDenials: 0,
          failures: 4,
        },
        learner_enrollment_completion: { successes: 2, expectedDenials: 0, failures: 1 },
        learner_progress_persistence: { successes: 99, expectedDenials: 1, failures: 0 },
      }),
    )

    expect(result.checkpoints.map((checkpoint) => checkpoint.budgetConsumedBasisPoints)).toEqual([
      0,
      10_000,
      20_000,
      40_000,
      333_334,
      10_000,
    ])
    expect(result.checkpoints.map((checkpoint) => checkpoint.burnRateMilli)).toEqual([
      0,
      1_000,
      2_000,
      4_000,
      33_334,
      1_000,
    ])
    expect(result.checkpoints.map((checkpoint) => checkpoint.status)).toEqual([
      'healthy',
      'healthy',
      'warning',
      'critical',
      'critical',
      'healthy',
    ])
    expect(result.summary).toEqual({ status: 'critical' })
  })

  it('treats expected denials and failures as equivalent budget consumers', () => {
    const denialPolicy = createPolicy({ minimumObservations: 100 })
    const denialResult = evaluateLearnerJourneySlo(
      denialPolicy,
      createAggregates({
        public_catalog_availability: { successes: 98, expectedDenials: 2, failures: 0 },
      }),
    )
    const failureResult = evaluateLearnerJourneySlo(
      denialPolicy,
      createAggregates({
        public_catalog_availability: { successes: 98, expectedDenials: 0, failures: 2 },
      }),
    )

    expect({
      budgetConsumedBasisPoints: denialResult.checkpoints[0].budgetConsumedBasisPoints,
      burnRateMilli: denialResult.checkpoints[0].burnRateMilli,
      status: denialResult.checkpoints[0].status,
    }).toEqual({
      budgetConsumedBasisPoints: failureResult.checkpoints[0].budgetConsumedBasisPoints,
      burnRateMilli: failureResult.checkpoints[0].burnRateMilli,
      status: failureResult.checkpoints[0].status,
    })
    expect(denialResult.checkpoints[0].expectedDenials).toBe(2)
    expect(denialResult.checkpoints[0].failures).toBe(0)
    expect(failureResult.checkpoints[0].expectedDenials).toBe(0)
    expect(failureResult.checkpoints[0].failures).toBe(2)
    expect(denialResult.checkpoints[0].budgetConsumedBasisPoints).toBe(20_000)
    expect(denialResult.checkpoints[0].burnRateMilli).toBe(2_000)
  })

  it('returns no_data with null metrics below the policy minimum without becoming healthy', () => {
    const policy = createPolicy({ minimumObservations: 2 })
    const healthyJourney = createAggregates({
      public_catalog_availability: { successes: 1, expectedDenials: 0, failures: 0 },
    })
    const result = evaluateLearnerJourneySlo(policy, healthyJourney)

    expect(result.checkpoints[0]).toEqual({
      checkpoint: 'public_catalog_availability',
      observations: 1,
      successes: 1,
      expectedDenials: 0,
      failures: 0,
      budgetConsumedBasisPoints: null,
      burnRateMilli: null,
      status: 'no_data',
    })
    expect(result.summary).toEqual({ status: 'no_data' })
  })

  it('orders overall status as critical, warning, no_data, then healthy', () => {
    const warningCounts = { successes: 196, expectedDenials: 4, failures: 0 }
    const criticalCounts = { successes: 384, expectedDenials: 0, failures: 16 }
    const noDataPolicy = createPolicy({ minimumObservations: 101 })
    const warningPolicy = createPolicy({ minimumObservations: 100 })

    const missingEvidence = evaluateLearnerJourneySlo(
      noDataPolicy,
      createAggregates({ public_catalog_availability: { successes: 100 } }),
    )
    const warningWithMissingEvidence = evaluateLearnerJourneySlo(
      noDataPolicy,
      createAggregates({
        public_catalog_availability: warningCounts,
        sign_in_availability: { successes: 100 },
      }),
    )
    const criticalWithWarningAndMissingEvidence = evaluateLearnerJourneySlo(
      noDataPolicy,
      createAggregates({
        public_catalog_availability: warningCounts,
        sign_in_availability: criticalCounts,
        identity_authorization_start: { successes: 100 },
      }),
    )

    expect(missingEvidence.summary.status).toBe('no_data')
    expect(warningWithMissingEvidence.summary.status).toBe('warning')
    expect(criticalWithWarningAndMissingEvidence.summary.status).toBe('critical')
    expect(evaluateLearnerJourneySlo(warningPolicy, createAggregates()).summary.status).toBe(
      'healthy',
    )
  })

  it('always emits all six checkpoints in canonical order even when input is reordered', () => {
    const result = evaluateLearnerJourneySlo(
      createPolicy(),
      [...createAggregates()].reverse(),
    )

    expect(result.checkpoints.map((checkpoint) => checkpoint.checkpoint)).toEqual(
      LEARNER_JOURNEY_CHECKPOINTS,
    )
    expect(LEARNER_JOURNEY_CHECKPOINTS).toHaveLength(6)
  })

  it('accepts every inclusive policy boundary and rejects each exclusive boundary', () => {
    expect(
      validateLearnerJourneySloPolicy(
        createPolicy({
          objectiveWindowSeconds: 2_592_000,
          targetSuccessBasisPoints: 9_999,
          minimumObservations: 1_000_000,
          warningBurnRateMilli: 99_000,
          criticalBurnRateMilli: 100_000,
        }),
      ),
    ).toEqual(
      createPolicy({
        objectiveWindowSeconds: 2_592_000,
        targetSuccessBasisPoints: 9_999,
        minimumObservations: 1_000_000,
        warningBurnRateMilli: 99_000,
        criticalBurnRateMilli: 100_000,
      }),
    )

    expect(
      validateLearnerJourneySloPolicy(
        createPolicy({ targetSuccessBasisPoints: 9_000, warningBurnRateMilli: 1_000, criticalBurnRateMilli: 1_001 }),
      ),
    ).toEqual(
      createPolicy({ targetSuccessBasisPoints: 9_000, warningBurnRateMilli: 1_000, criticalBurnRateMilli: 1_001 }),
    )

    expectPolicyRejection({ ...createPolicy(), schemaVersion: '2' })
    expectPolicyRejection(createPolicy({ objectiveWindowSeconds: 86_399 }))
    expectPolicyRejection(createPolicy({ objectiveWindowSeconds: 2_592_001 }))
    expectPolicyRejection(createPolicy({ targetSuccessBasisPoints: 8_999 }))
    expectPolicyRejection(createPolicy({ targetSuccessBasisPoints: 10_000 }))
    expectPolicyRejection(createPolicy({ minimumObservations: 0 }))
    expectPolicyRejection(createPolicy({ minimumObservations: 1_000_001 }))
    expectPolicyRejection(createPolicy({ warningBurnRateMilli: 999 }))
    expectPolicyRejection(createPolicy({ warningBurnRateMilli: 100_001 }))
    expectPolicyRejection(createPolicy({ criticalBurnRateMilli: 100_001 }))
    expectPolicyRejection(createPolicy({ criticalBurnRateMilli: 2_000 }))
    expectPolicyRejection(createPolicy({ objectiveWindowSeconds: Number.NaN }))
    expectPolicyRejection(createPolicy({ targetSuccessBasisPoints: 9_900.5 }))
  })

  it('accepts maximum safe counts and rejects unsafe count or per-checkpoint sums', () => {
    const policy = createPolicy({ targetSuccessBasisPoints: 9_000 })
    const maximumCounts = {
      successes: 1_000_000,
      expectedDenials: 0,
      failures: 0,
    }
    const result = evaluateLearnerJourneySlo(
      policy,
      createAggregates({
        public_catalog_availability: maximumCounts,
        sign_in_availability: { successes: 0, expectedDenials: 1_000_000, failures: 0 },
        identity_authorization_start: { successes: 0, expectedDenials: 0, failures: 1_000_000 },
      }),
    )

    expect(result.checkpoints[0].observations).toBe(1_000_000)
    expect(result.checkpoints[1].observations).toBe(1_000_000)
    expect(result.checkpoints[2].observations).toBe(1_000_000)
    expectEvaluationRejection(
      policy,
      createAggregates({ public_catalog_availability: { successes: 1_000_001 } }),
    )
    expectEvaluationRejection(
      policy,
      createAggregates({
        public_catalog_availability: { successes: 1_000_000, expectedDenials: 1 },
      }),
    )
    expectEvaluationRejection(
      policy,
      createAggregates({ public_catalog_availability: { successes: Number.NaN } }),
    )
    expectEvaluationRejection(
      policy,
      createAggregates({ public_catalog_availability: { successes: Number.POSITIVE_INFINITY } }),
    )
  })

  it('rejects policy accessor, symbol, extra, missing, and changed-prototype objects', () => {
    const accessorPolicy = createPolicy()
    Object.defineProperty(accessorPolicy, 'minimumObservations', {
      enumerable: true,
      get: () => 1,
    })
    const symbolPolicy = createPolicy()
    Reflect.set(symbolPolicy, Symbol('opaque'), 1)
    const extraPolicy = createPolicy()
    Reflect.set(extraPolicy, 'policyName', 'local')
    const missingPolicy = createPolicy()
    Reflect.deleteProperty(missingPolicy, 'criticalBurnRateMilli')
    const changedPrototypePolicy: unknown = { ...createPolicy() }
    Object.setPrototypeOf(changedPrototypePolicy, null)

    expectPolicyRejection(accessorPolicy)
    expectPolicyRejection(symbolPolicy)
    expectPolicyRejection(extraPolicy)
    expectPolicyRejection(missingPolicy)
    expectPolicyRejection(changedPrototypePolicy)
  })

  it('rejects duplicate, missing, sparse, accessor, symbol, extra, and prototype aggregates', () => {
    const policy = createPolicy()
    const duplicate = [...createAggregates(), createAggregate('public_catalog_availability')]
    const duplicateWithoutSixthCheckpoint = createAggregates()
    duplicateWithoutSixthCheckpoint[5] = createAggregate('public_catalog_availability')
    const missing = createAggregates().slice(0, 5)
    const sparse = createAggregates()
    delete sparse[5]
    const recordAccessor = createAggregates()
    Object.defineProperty(recordAccessor[0], 'successes', {
      enumerable: true,
      get: () => 100,
    })
    const recordSymbol = createAggregates()
    Reflect.set(recordSymbol[0], Symbol('opaque'), 1)
    const recordExtra = createAggregates()
    Reflect.set(recordExtra[0], 'journeyId', 'opaque')
    const recordPrototype = createAggregates()
    Object.setPrototypeOf(recordPrototype[0], null)
    const arrayAccessor = createAggregates()
    Object.defineProperty(arrayAccessor, '0', {
      enumerable: true,
      get: () => arrayAccessor[0],
    })
    const arraySymbol = createAggregates()
    Reflect.set(arraySymbol, Symbol('opaque'), 1)
    const arrayExtra = createAggregates()
    Reflect.set(arrayExtra, 'extra', 1)
    const arrayPrototype = createAggregates()
    Object.setPrototypeOf(arrayPrototype, [])

    expectEvaluationRejection(policy, duplicate)
    expectEvaluationRejection(policy, duplicateWithoutSixthCheckpoint)
   expectEvaluationRejection(policy, missing)
    expectEvaluationRejection(policy, sparse)
    expectEvaluationRejection(policy, recordAccessor)
    expectEvaluationRejection(policy, recordSymbol)
    expectEvaluationRejection(policy, recordExtra)
    expectEvaluationRejection(policy, recordPrototype)
    expectEvaluationRejection(policy, arrayAccessor)
    expectEvaluationRejection(policy, arraySymbol)
    expectEvaluationRejection(policy, arrayExtra)
    expectEvaluationRejection(policy, arrayPrototype)
  })

  it('returns deeply frozen projections isolated from caller mutation', () => {
    const policyInput = createPolicy()
    const aggregateInput = createAggregates()
    const result = evaluateLearnerJourneySlo(policyInput, aggregateInput)

    policyInput.targetSuccessBasisPoints = 9_999
    aggregateInput[0].successes = 0
    expect(result.policy).toEqual(createPolicy())
    expect(result.checkpoints[0].successes).toBe(100)
    expect(Reflect.set(result.policy, 'targetSuccessBasisPoints', 9_999)).toBe(false)
    expect(Reflect.set(result.checkpoints, 0, result.checkpoints[1])).toBe(false)
    expect(Reflect.set(result.checkpoints[0], 'successes', 0)).toBe(false)
    expect(Reflect.set(result.summary, 'status', 'critical')).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.policy)).toBe(true)
    expect(Object.isFrozen(result.checkpoints)).toBe(true)
    expect(result.checkpoints.every((checkpoint) => Object.isFrozen(checkpoint))).toBe(true)
    expect(Object.isFrozen(result.summary)).toBe(true)
    expect(validateLearnerJourneySloPolicy(policyInput)).toEqual(
      createPolicy({ targetSuccessBasisPoints: 9_999 }),
    )
  })

  it('has source-bound proof of local-only behavior and fixed aggregate fields', () => {
    const source = readFileSync(
      new URL('../../src/lib/observability/learner-journey-slo.ts', import.meta.url),
      'utf8',
    )

    expect(LEARNER_JOURNEY_SLO_POLICY_KEYS).toEqual([
      'schemaVersion',
      'objectiveWindowSeconds',
      'targetSuccessBasisPoints',
      'minimumObservations',
      'warningBurnRateMilli',
      'criticalBurnRateMilli',
    ])
    expect(LEARNER_JOURNEY_SLO_AGGREGATE_KEYS).toEqual([
      'checkpoint',
      'successes',
      'expectedDenials',
      'failures',
    ])
    expect(source).not.toMatch(
      /\b(?:console|logger|log|fetch|XMLHttpRequest|WebSocket|EventSource|navigator|sendBeacon|process|globalThis|localStorage|sessionStorage|indexedDB|database|supabase|telemetry|send|storage|setTimeout|setInterval|requestAnimationFrame|runtime|release|production|flag)\b/i,
    )
    expect(source).not.toMatch(
      /\b(?:metadata|url|route|query|locale|timestamp|userId|user_id|accountId|account_id|sessionId|session_id|correlationId|correlation_id|email|subject|authorizationCode|authorization_code|cookie|token|stack|error)\b/i,
    )
  })
})
