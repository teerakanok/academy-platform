import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
  LEARNER_JOURNEY_ALERT_CHECKPOINTS,
  LEARNER_JOURNEY_ALERT_POLICY_KEYS,
  type LearnerJourneyAlertCheckpoint,
  type LearnerJourneyAlertPolicy,
  type LearnerJourneyAlertStatus,
  projectLearnerJourneyAlertRehearsal,
  recordLearnerJourneyAlertDeliveryOutcome,
  rollbackLearnerJourneyAlertRehearsal,
  validateLearnerJourneyAlertPolicy,
} from '../../src/lib/observability/learner-journey-alert-rehearsal'

type SloCheckpointResult = {
  checkpoint: LearnerJourneyAlertCheckpoint
  observations: number
  successes: number
  expectedDenials: number
  failures: number
  budgetConsumedBasisPoints: number | null
  burnRateMilli: number | null
  status: LearnerJourneyAlertStatus
}

type SloEvaluation = {
  policy: {
    schemaVersion: '1'
    objectiveWindowSeconds: number
    targetSuccessBasisPoints: number
    minimumObservations: number
    warningBurnRateMilli: number
    criticalBurnRateMilli: number
  }
  checkpoints: SloCheckpointResult[]
  summary: { status: LearnerJourneyAlertStatus }
}

function createPolicy(
  overrides: Partial<LearnerJourneyAlertPolicy> = {},
): LearnerJourneyAlertPolicy {
  return {
    schemaVersion: '1',
    enabled: false,
    primaryRoute: 'academy_ops_primary',
    escalationRoute: 'academy_ops_escalation',
    dedupeWindowSeconds: 300,
    maxDeliveryAttempts: 2,
    criticalEscalationDelaySeconds: 300,
    ...overrides,
  }
}

function checkpointResult(
  checkpoint: LearnerJourneyAlertCheckpoint,
  status: LearnerJourneyAlertStatus,
): SloCheckpointResult {
  if (status === 'no_data') {
    return {
      checkpoint,
      observations: 0,
      successes: 0,
      expectedDenials: 0,
      failures: 0,
      budgetConsumedBasisPoints: null,
      burnRateMilli: null,
      status,
    }
  }

  const burnRateMilli =
    status === 'critical' ? 4_000 : status === 'warning' ? 2_000 : 0
  return {
    checkpoint,
    observations: 100,
    successes: status === 'healthy' ? 100 : status === 'warning' ? 98 : 96,
    expectedDenials: 0,
    failures: status === 'healthy' ? 0 : status === 'warning' ? 2 : 4,
    budgetConsumedBasisPoints: burnRateMilli * 10,
    burnRateMilli,
    status,
  }
}

function createEvaluation(
  statusesByCheckpoint: Partial<
    Record<LearnerJourneyAlertCheckpoint, LearnerJourneyAlertStatus>
  > = {},
): SloEvaluation {
  const checkpoints = LEARNER_JOURNEY_ALERT_CHECKPOINTS.map((checkpoint) =>
    checkpointResult(checkpoint, statusesByCheckpoint[checkpoint] ?? 'healthy'),
  )
  const priority: readonly LearnerJourneyAlertStatus[] = [
    'critical',
    'warning',
    'no_data',
    'healthy',
  ]
  return {
    policy: {
      schemaVersion: '1',
      objectiveWindowSeconds: 86_400,
      targetSuccessBasisPoints: 9_900,
      minimumObservations: 1,
      warningBurnRateMilli: 2_000,
      criticalBurnRateMilli: 4_000,
    },
    checkpoints,
    summary: {
      status:
        priority.find((status) =>
          checkpoints.some((checkpoint) => checkpoint.status === status),
        ) ?? 'healthy',
    },
  }
}

function project(
  evaluation: SloEvaluation = createEvaluation(),
  policy: LearnerJourneyAlertPolicy = createPolicy(),
  priorState: unknown = INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
  observedAtSeconds = 100,
) {
  return projectLearnerJourneyAlertRehearsal(
    policy,
    evaluation,
    priorState,
    observedAtSeconds,
  )
}

function expectPolicyRejection(value: unknown): void {
  expect(() => validateLearnerJourneyAlertPolicy(value)).toThrow(TypeError)
}

describe('learner journey alert rehearsal', () => {
  it('projects every canonical non-healthy status', () => {
    const noData = project(
      createEvaluation({ sign_in_availability: 'no_data' }),
    )
    const warning = project(
      createEvaluation({ identity_authorization_start: 'warning' }),
    )
    const critical = project(
      createEvaluation({ learner_enrollment_completion: 'critical' }),
    )
    const healthy = project(createEvaluation())

    expect(noData.alerts).toEqual([
      {
        fingerprint:
          'sign_in_availability|no_data|0|data_gap|academy_ops_primary',
        checkpoint: 'sign_in_availability',
        status: 'no_data',
        reason: 'data_gap',
        route: 'academy_ops_primary',
        windowBucket: 0,
      },
    ])
    expect(warning.alerts[0]).toMatchObject({
      checkpoint: 'identity_authorization_start',
      status: 'warning',
      reason: 'burn_rate',
      route: 'academy_ops_primary',
    })
    expect(critical.alerts).toHaveLength(1)
    expect(critical.alerts[0]).toMatchObject({
      checkpoint: 'learner_enrollment_completion',
      status: 'critical',
      reason: 'burn_rate',
      route: 'academy_ops_primary',
    })
    expect(healthy.alerts).toEqual([])
    expect(healthy.state.deliveries).toEqual([])
  })

  it('adds critical escalation at the exact delay boundary and not one second early', () => {
    const evaluation = createEvaluation({
      identity_callback_completion: 'critical',
    })
    const first = project(
      evaluation,
      createPolicy(),
      INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
      100,
    )
    const before = project(evaluation, createPolicy(), first.state, 299)
    const boundary = project(evaluation, createPolicy(), before.state, 400)

    expect(first.alerts.map((alert) => alert.route)).toEqual([
      'academy_ops_primary',
    ])
    expect(before.alerts).toEqual([])
    expect(boundary.alerts.map((alert) => alert.route)).toEqual([
      'academy_ops_primary',
      'academy_ops_escalation',
    ])
    expect(boundary.state.deliveries.map((delivery) => delivery.route)).toEqual(
      ['academy_ops_primary', 'academy_ops_escalation'],
    )
  })

  it('deduplicates within the window and projects again in a later window', () => {
    const evaluation = createEvaluation({
      public_catalog_availability: 'warning',
    })
    const first = project(
      evaluation,
      createPolicy(),
      INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
      100,
    )
    const sameWindow = project(evaluation, createPolicy(), first.state, 299)
    const nextWindow = project(
      evaluation,
      createPolicy(),
      sameWindow.state,
      400,
    )

    expect(first.alerts).toHaveLength(1)
    expect(sameWindow.alerts).toEqual([])
    expect(sameWindow.state.deliveries).toHaveLength(1)
    expect(nextWindow.alerts).toHaveLength(1)
    expect(nextWindow.alerts[0].windowBucket).toBe(1)
    expect(nextWindow.state.windowBucket).toBe(1)
  })

  it('bounds retries, terminalizes exhaustion, and records successful delivery', () => {
    const policy = createPolicy()
    const fingerprint =
      'learner_progress_persistence|critical|0|burn_rate|academy_ops_primary'
    const first = project(
      createEvaluation({ learner_progress_persistence: 'critical' }),
      policy,
      INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
      100,
    )
    const retried = recordLearnerJourneyAlertDeliveryOutcome(
      policy,
      first.state,
      {
        fingerprint,
        outcome: 'retryable_failure',
      },
    )
    const exhausted = recordLearnerJourneyAlertDeliveryOutcome(
      policy,
      retried,
      {
        fingerprint,
        outcome: 'retryable_failure',
      },
    )
    const delivered = recordLearnerJourneyAlertDeliveryOutcome(
      policy,
      retried,
      {
        fingerprint,
        outcome: 'success',
      },
    )

    expect(retried.deliveries[0]).toMatchObject({
      deliveryStatus: 'pending',
      attempts: 1,
    })
    expect(exhausted.deliveries[0]).toMatchObject({
      deliveryStatus: 'exhausted',
      attempts: 2,
    })
    expect(() =>
      recordLearnerJourneyAlertDeliveryOutcome(policy, exhausted, {
        fingerprint,
        outcome: 'retryable_failure',
      }),
    ).toThrow(TypeError)
    expect(
      project(
        createEvaluation({ learner_progress_persistence: 'critical' }),
        policy,
        exhausted,
        100,
      ).alerts,
    ).toEqual([])
    expect(delivered.deliveries[0]).toMatchObject({
      deliveryStatus: 'delivered',
      attempts: 2,
    })
  })

  it('rolls back exactly to the prior state without resurrecting delivered alerts', () => {
    const policy = createPolicy()
    const evaluation = createEvaluation({ sign_in_availability: 'critical' })
    const prior = project(
      evaluation,
      policy,
      INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
      100,
    ).state
    const fingerprint =
      'sign_in_availability|critical|0|burn_rate|academy_ops_primary'
    const current = recordLearnerJourneyAlertDeliveryOutcome(policy, prior, {
      fingerprint,
      outcome: 'success',
    })
    const rolledBack = rollbackLearnerJourneyAlertRehearsal(current, prior)
    const reprojection = project(evaluation, policy, rolledBack, 100)

    expect(rolledBack).toEqual(prior)
    expect(rolledBack).not.toEqual(current)
    expect(reprojection.alerts).toEqual([])
  })

  it('keeps learner identifiers and raw messages out of fingerprints and state', () => {
    const result = project(
      createEvaluation({ sign_in_availability: 'no_data' }),
    )
    const serialized = JSON.stringify(result)

    expect(serialized).not.toMatch(
      /\b(?:learnerId|learner_id|userId|user_id|accountId|account_id|sessionId|session_id|message|stack|error)\b/i,
    )
    expect(Object.keys(result.alerts[0]).sort()).toEqual([
      'checkpoint',
      'fingerprint',
      'reason',
      'route',
      'status',
      'windowBucket',
    ])
  })

  it('strictly validates bounded policy values and unsafe object shapes', () => {
    expect(
      validateLearnerJourneyAlertPolicy(
        createPolicy({
          dedupeWindowSeconds: 86_400,
          maxDeliveryAttempts: 10,
          criticalEscalationDelaySeconds: 0,
        }),
      ),
    ).toEqual(
      createPolicy({
        dedupeWindowSeconds: 86_400,
        maxDeliveryAttempts: 10,
        criticalEscalationDelaySeconds: 0,
      }),
    )

    expectPolicyRejection(createPolicy({ schemaVersion: '2' as never }))
    expectPolicyRejection(createPolicy({ enabled: true as never }))
    expectPolicyRejection(createPolicy({ primaryRoute: 'pagerduty' as never }))
    expectPolicyRejection(createPolicy({ escalationRoute: 'phone' as never }))
    expectPolicyRejection(createPolicy({ dedupeWindowSeconds: 0 }))
    expectPolicyRejection(createPolicy({ dedupeWindowSeconds: 86_401 }))
    expectPolicyRejection(createPolicy({ maxDeliveryAttempts: 0 }))
    expectPolicyRejection(createPolicy({ maxDeliveryAttempts: 11 }))
    expectPolicyRejection(createPolicy({ criticalEscalationDelaySeconds: -1 }))
    expectPolicyRejection(
      createPolicy({ criticalEscalationDelaySeconds: 86_401 }),
    )
    expectPolicyRejection(createPolicy({ dedupeWindowSeconds: Number.NaN }))
    expectPolicyRejection(createPolicy({ maxDeliveryAttempts: 1.5 }))
    expectPolicyRejection({ ...createPolicy(), extra: 'rejected' })

    const missing: Record<string, unknown> = { ...createPolicy() }
    delete missing.maxDeliveryAttempts
    expectPolicyRejection(missing)

    const accessor = createPolicy()
    Object.defineProperty(accessor, 'enabled', {
      enumerable: true,
      get: () => false,
    })
    expectPolicyRejection(accessor)

    const symbolPolicy = createPolicy()
    Reflect.set(symbolPolicy, Symbol('opaque'), true)
    expectPolicyRejection(symbolPolicy)

    const nullPrototypePolicy: unknown = { ...createPolicy() }
    Object.setPrototypeOf(nullPrototypePolicy, null)
    expectPolicyRejection(nullPrototypePolicy)
    expect(LEARNER_JOURNEY_ALERT_POLICY_KEYS).toHaveLength(7)
  })

  it('strictly validates the evaluation source and delivery inputs', () => {
    const policy = createPolicy()
    const extraEvaluation = createEvaluation()
    Reflect.set(extraEvaluation, 'learnerId', 'opaque')
    expect(() =>
      project(
        extraEvaluation,
        policy,
        INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
        100,
      ),
    ).toThrow(TypeError)

    const accessorEvaluation = createEvaluation()
    Object.defineProperty(accessorEvaluation.checkpoints[0], 'status', {
      enumerable: true,
      get: () => 'critical',
    })
    expect(() =>
      project(
        accessorEvaluation,
        policy,
        INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
        100,
      ),
    ).toThrow(TypeError)

    expect(() =>
      project(
        createEvaluation(),
        policy,
        INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
        -1,
      ),
    ).toThrow(TypeError)
    expect(() =>
      recordLearnerJourneyAlertDeliveryOutcome(
        policy,
        INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
        {
          fingerprint: 'missing',
          outcome: 'success',
        },
      ),
    ).toThrow(TypeError)
    expect(() =>
      recordLearnerJourneyAlertDeliveryOutcome(
        policy,
        INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
        {
          fingerprint: 'missing',
          outcome: 'permanent_failure' as never,
        },
      ),
    ).toThrow(TypeError)
  })

  it('returns deeply frozen canonical output isolated from input mutation', () => {
    const evaluation = createEvaluation({
      public_catalog_availability: 'critical',
    })
    const result = project(
      evaluation,
      createPolicy(),
      INITIAL_LEARNER_JOURNEY_ALERT_REHEARSAL_STATE,
      100,
    )

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.state)).toBe(true)
    expect(Object.isFrozen(result.state.criticalAnchors)).toBe(true)
    expect(
      result.state.criticalAnchors.every((anchor) => Object.isFrozen(anchor)),
    ).toBe(true)
    expect(Object.isFrozen(result.state.deliveries)).toBe(true)
    expect(
      result.state.deliveries.every((delivery) => Object.isFrozen(delivery)),
    ).toBe(true)
    expect(Object.isFrozen(result.alerts)).toBe(true)
    expect(result.alerts.every((alert) => Object.isFrozen(alert))).toBe(true)
    expect(Reflect.set(result.state, 'windowBucket', 99)).toBe(false)
    expect(
      Reflect.set(result.state.deliveries, 0, result.state.deliveries[0]),
    ).toBe(false)
    expect(
      Reflect.set(result.alerts[0], 'checkpoint', 'sign_in_availability'),
    ).toBe(false)
  })

  it('has source-bound proof that rehearsal remains local and side-effect free', () => {
    const source = readFileSync(
      new URL(
        '../../src/lib/observability/learner-journey-alert-rehearsal.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain(
      "import type { LearnerJourneySloEvaluation } from './learner-journey-slo'",
    )
    expect(source).not.toMatch(
      /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|navigator|sendBeacon|localStorage|sessionStorage|indexedDB|database|setTimeout|setInterval|requestAnimationFrame|process|globalThis|runtime|deploy|secret)\b/i,
    )
    expect(source).not.toMatch(/\bprocess\s*\.\s*env\b/)
  })
})
