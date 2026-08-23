import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEARNER_JOURNEY_CHECKPOINTS,
  LEARNER_JOURNEY_EVENT_KEYS,
  LEARNER_JOURNEY_EVENT_SCHEMA_VERSION,
  LEARNER_JOURNEY_LATENCY_BUCKETS,
  LEARNER_JOURNEY_LOCALES,
  LEARNER_JOURNEY_STATUS_CLASSES,
  LEARNER_JOURNEY_SYNTHETIC_MARKERS,
  assessSyntheticLearnerJourneyReadiness,
  classifyLearnerJourneyEvent,
  validateLearnerJourneyEvent,
  type LearnerJourneyCheckpoint,
} from '@/lib/observability/learner-journey'
import { UI_LOCALES } from '@/lib/i18n/ui'

type MutableLearnerJourneyEvent = {
  schemaVersion: typeof LEARNER_JOURNEY_EVENT_SCHEMA_VERSION
  checkpoint: LearnerJourneyCheckpoint
  outcome: 'success' | 'expected_denial' | 'failure'
  statusClass: 'success' | 'expected_denial' | 'client_failure' | 'server_failure'
  latencyBucket: (typeof LEARNER_JOURNEY_LATENCY_BUCKETS)[number]
  locale: (typeof LEARNER_JOURNEY_LOCALES)[number]
  syntheticMarker: (typeof LEARNER_JOURNEY_SYNTHETIC_MARKERS)[number]
  occurredAt: string
}

function createEvent(
  checkpoint: LearnerJourneyCheckpoint = 'public_catalog_availability',
): MutableLearnerJourneyEvent {
  return {
    schemaVersion: LEARNER_JOURNEY_EVENT_SCHEMA_VERSION,
    checkpoint,
    outcome: 'success',
    statusClass: 'success',
    latencyBucket: 'zero_to_99_ms',
    locale: 'en',
    syntheticMarker: 'synthetic',
    occurredAt: '2026-02-28T23:59:59.999Z',
  }
}

function createFailureEvent(
  checkpoint: LearnerJourneyCheckpoint,
  statusClass: 'client_failure' | 'server_failure' = 'server_failure',
): MutableLearnerJourneyEvent {
  return { ...createEvent(checkpoint), outcome: 'failure', statusClass }
}

function createJourney(): MutableLearnerJourneyEvent[] {
  return LEARNER_JOURNEY_CHECKPOINTS.map((checkpoint) => createEvent(checkpoint))
}

function expectEventRejection(value: unknown): void {
  expect(() => validateLearnerJourneyEvent(value)).toThrow(TypeError)
}

function expectReadinessRejection(value: unknown): void {
  expect(() => assessSyntheticLearnerJourneyReadiness(value)).toThrow(TypeError)
}

describe('learner journey observability', () => {
  it('accepts a complete synthetic journey and reports ready', () => {
    const result = assessSyntheticLearnerJourneyReadiness(createJourney())

    expect(result).toEqual({
      ready: true,
      status: 'ready',
      missingCheckpoints: [],
      failedCheckpoints: [],
      alerts: [],
    })
  })

  it('reports a complete expected-denial journey as degraded without failures or alerts', () => {
    const evidence = createJourney()
    evidence[2] = {
      ...evidence[2],
      outcome: 'expected_denial',
      statusClass: 'expected_denial',
      latencyBucket: 'not_applicable',
    }

    expect(assessSyntheticLearnerJourneyReadiness(evidence)).toEqual({
      ready: false,
      status: 'degraded',
      missingCheckpoints: [],
      failedCheckpoints: [],
      alerts: [],
    })
  })

  it('reports missing checkpoints deterministically without treating them as failures', () => {
    const evidence = createJourney().slice(2)
    const result = assessSyntheticLearnerJourneyReadiness(evidence)

    expect(result.ready).toBe(false)
    expect(result.status).toBe('degraded')
    expect(result.missingCheckpoints).toEqual(LEARNER_JOURNEY_CHECKPOINTS.slice(0, 2))
    expect(result.failedCheckpoints).toEqual([])
    expect(result.alerts).toEqual([])
  })

  it('classifies every failed checkpoint with its exact severity and owner', () => {
    const evidence = LEARNER_JOURNEY_CHECKPOINTS.map((checkpoint) =>
      createFailureEvent(checkpoint),
    )
    const expectedAlerts = [
      { checkpoint: 'public_catalog_availability', severity: 'warning', owner: 'academy_product_operations' },
      { checkpoint: 'sign_in_availability', severity: 'warning', owner: 'academy_product_operations' },
      { checkpoint: 'identity_authorization_start', severity: 'critical', owner: 'identity_operations' },
      { checkpoint: 'identity_callback_completion', severity: 'critical', owner: 'identity_operations' },
      { checkpoint: 'learner_enrollment_completion', severity: 'warning', owner: 'academy_product_operations' },
      { checkpoint: 'learner_progress_persistence', severity: 'critical', owner: 'academy_product_operations' },
    ]

    for (const [index] of LEARNER_JOURNEY_CHECKPOINTS.entries()) {
      expect(classifyLearnerJourneyEvent(evidence[index])).toEqual(expectedAlerts[index])
    }
    expect(assessSyntheticLearnerJourneyReadiness(evidence)).toEqual({
      ready: false,
      status: 'degraded',
      missingCheckpoints: [],
      failedCheckpoints: [...LEARNER_JOURNEY_CHECKPOINTS],
      alerts: expectedAlerts,
    })
  })

  it('does not create alerts for successful events or expected denials', () => {
    expect(classifyLearnerJourneyEvent(createEvent())).toBeNull()
    expect(
      classifyLearnerJourneyEvent({
        ...createEvent('identity_authorization_start'),
        outcome: 'expected_denial',
        statusClass: 'expected_denial',
        latencyBucket: 'not_applicable',
      }),
    ).toBeNull()
  })

  it('rejects duplicate checkpoints in synthetic evidence', () => {
    const evidence = createJourney()
    evidence[0] = { ...evidence[0], checkpoint: evidence[1].checkpoint }
    expectReadinessRejection(evidence)
  })

  it('rejects non-synthetic evidence', () => {
    const evidence = createJourney()
    evidence[2] = { ...evidence[2], syntheticMarker: 'organic' }
    expectReadinessRejection(evidence)
  })

  it('rejects invalid evidence rather than hiding it as missing', () => {
    const malformedEvent = { ...createEvent(), outcome: 'unexpected' }
    const malformedEvidence: unknown[] = [malformedEvent, ...createJourney().slice(1)]
    expectReadinessRejection(malformedEvidence)
    expectReadinessRejection([...createJourney().slice(1), null])
    expectReadinessRejection('not-an-array')
  })

  it('requires exactly the allowlisted event fields', () => {
    const event = createEvent()
    const validatedEvent = validateLearnerJourneyEvent(event)
    expect(Object.keys(validatedEvent)).toEqual([...LEARNER_JOURNEY_EVENT_KEYS])
    expectEventRejection({ ...event, email: 'learner@example.test' })
    expectEventRejection({ ...event, url: 'https://academy.example.test/courses?token=secret' })
    expectEventRejection({ ...event, metadata: { checkpoint: 'unsafe' } })
    expectEventRejection({ checkpoint: event.checkpoint })
    expectEventRejection([...LEARNER_JOURNEY_EVENT_KEYS])
  })

  it('rejects accessors, changed prototypes, and sparse evidence', () => {
    const accessorEvent = {}
    Object.defineProperty(accessorEvent, 'schemaVersion', {
      enumerable: true,
      get() {
        return LEARNER_JOURNEY_EVENT_SCHEMA_VERSION
      },
    })
    for (const key of LEARNER_JOURNEY_EVENT_KEYS.slice(1)) {
      Object.defineProperty(accessorEvent, key, {
        enumerable: true,
        value: createEvent()[key],
      })
    }
    expectEventRejection(accessorEvent)
    expectEventRejection(Object.create(null))

    const sparseEvidence: unknown[] = createJourney()
    delete sparseEvidence[0]
    expectReadinessRejection(sparseEvidence)

    const evidenceWithExtraProperty: unknown[] = createJourney()
    Object.defineProperty(evidenceWithExtraProperty, 'evidenceId', {
      value: 'opaque',
      enumerable: true,
    })
    expectReadinessRejection(evidenceWithExtraProperty)
  })

  it('accepts RFC3339 date boundaries and rejects noncanonical timestamps', () => {
    expect(validateLearnerJourneyEvent({ ...createEvent(), occurredAt: '2028-02-29T00:00:00Z' }).occurredAt)
      .toBe('2028-02-29T00:00:00Z')
    expect(validateLearnerJourneyEvent({ ...createEvent(), occurredAt: '2026-12-31T23:59:59.999Z' }).occurredAt)
      .toBe('2026-12-31T23:59:59.999Z')

    for (const occurredAt of [
      '2027-02-29T00:00:00Z',
      '2026-02-30T00:00:00Z',
      '0000-01-01T00:00:00Z',
      '2026-01-01 00:00:00Z',
      '2026-01-01T00:00:00+07:00',
      '2026-01-01t00:00:00z',
      '2026-01-01T00:00:00.1Z',
      '2026-01-01T00:00:00.0000Z',
      '2026-13-01T00:00:00Z',
      '2026-01-01T24:00:00Z',
    ]) {
      expectEventRejection({ ...createEvent(), occurredAt })
    }
  })

  it('accepts every bounded enum value and rejects invalid enum boundaries', () => {
    expect(LEARNER_JOURNEY_LOCALES).toEqual(UI_LOCALES)
    for (const checkpoint of LEARNER_JOURNEY_CHECKPOINTS) {
      expect(validateLearnerJourneyEvent({ ...createEvent(), checkpoint }).checkpoint).toBe(checkpoint)
    }
    for (const latencyBucket of LEARNER_JOURNEY_LATENCY_BUCKETS) {
      expect(validateLearnerJourneyEvent({ ...createEvent(), latencyBucket }).latencyBucket)
        .toBe(latencyBucket)
    }
    for (const locale of LEARNER_JOURNEY_LOCALES) {
      expect(validateLearnerJourneyEvent({ ...createEvent(), locale }).locale).toBe(locale)
    }
    for (const syntheticMarker of LEARNER_JOURNEY_SYNTHETIC_MARKERS) {
      expect(validateLearnerJourneyEvent({ ...createEvent(), syntheticMarker }).syntheticMarker)
        .toBe(syntheticMarker)
    }
    for (const statusClass of LEARNER_JOURNEY_STATUS_CLASSES) {
      const outcome =
        statusClass === 'success' || statusClass === 'expected_denial' ? statusClass : 'failure'
      expect(validateLearnerJourneyEvent({ ...createEvent(), outcome, statusClass }).statusClass)
        .toBe(statusClass)
    }

    expectEventRejection({ ...createEvent(), schemaVersion: '2' })
    expectEventRejection({ ...createEvent(), checkpoint: 'private_catalog_availability' })
    expectEventRejection({ ...createEvent(), outcome: 'cancelled' })
    expectEventRejection({ ...createEvent(), statusClass: 'timeout' })
    expectEventRejection({ ...createEvent(), latencyBucket: '-1_ms' })
    expectEventRejection({ ...createEvent(), locale: 'fr-FR' })
    expectEventRejection({ ...createEvent(), locale: 'en-US' })
    expectEventRejection({ ...createEvent(), locale: 'th-TH' })
    expectEventRejection({ ...createEvent(), syntheticMarker: 'robot' })
  })

  it('returns frozen projections isolated from caller mutation', () => {
    const callerEvent = createEvent()
    const projectedEvent = validateLearnerJourneyEvent(callerEvent)
    callerEvent.checkpoint = 'learner_progress_persistence'
    expect(projectedEvent.checkpoint).toBe('public_catalog_availability')
    expect(Object.isFrozen(projectedEvent)).toBe(true)
    expect(Reflect.set(projectedEvent, 'checkpoint', 'sign_in_availability')).toBe(false)

    const readiness = assessSyntheticLearnerJourneyReadiness([createEvent()])
    expect(Object.isFrozen(readiness)).toBe(true)
    expect(Object.isFrozen(readiness.missingCheckpoints)).toBe(true)
    expect(Object.isFrozen(readiness.alerts)).toBe(true)

    const failedReadiness = assessSyntheticLearnerJourneyReadiness([
      createFailureEvent('identity_callback_completion'),
    ])
    expect(Object.isFrozen(failedReadiness.failedCheckpoints)).toBe(true)
    expect(failedReadiness.alerts.every((alert) => Object.isFrozen(alert))).toBe(true)
  })

  it('has source-bound proof of local-only behavior and the fixed field allowlist', () => {
    const source = readFileSync(
      new URL('../../src/lib/observability/learner-journey.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toMatch(
      /\b(?:console|logger|log|fetch|XMLHttpRequest|WebSocket|EventSource|navigator|sendBeacon|process|globalThis|localStorage|sessionStorage|indexedDB|database|supabase|telemetry|send|storage|runtime|release|production|flag)\b/i,
    )
    expect(source).not.toMatch(
      /\b(?:metadata|url|route|query|userId|user_id|accountId|account_id|sessionId|session_id|correlationId|correlation_id|email|subject|authorizationCode|authorization_code|code|state|nonce|cookie|token|stack|error)\b/i,
    )
    expect(LEARNER_JOURNEY_EVENT_KEYS).toEqual([
      'schemaVersion',
      'checkpoint',
      'outcome',
      'statusClass',
      'latencyBucket',
      'locale',
      'syntheticMarker',
      'occurredAt',
    ])
  })
})
