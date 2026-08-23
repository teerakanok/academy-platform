export const LEARNER_JOURNEY_EVENT_SCHEMA_VERSION = '1'

export const LEARNER_JOURNEY_EVENT_KEYS = [
  'schemaVersion',
  'checkpoint',
  'outcome',
  'statusClass',
  'latencyBucket',
  'locale',
  'syntheticMarker',
  'occurredAt',
] as const

export const LEARNER_JOURNEY_CHECKPOINTS = [
  'public_catalog_availability',
  'sign_in_availability',
  'identity_authorization_start',
  'identity_callback_completion',
  'learner_enrollment_completion',
  'learner_progress_persistence',
] as const

export const LEARNER_JOURNEY_OUTCOMES = ['success', 'expected_denial', 'failure'] as const
export const LEARNER_JOURNEY_STATUS_CLASSES = [
  'success',
  'expected_denial',
  'client_failure',
  'server_failure',
] as const
export const LEARNER_JOURNEY_LATENCY_BUCKETS = [
  'not_applicable',
  'zero_to_99_ms',
  '100_to_249_ms',
  '250_to_499_ms',
  '500_to_999_ms',
  '1000_to_1999_ms',
  '2000_ms_or_more',
] as const
export const LEARNER_JOURNEY_LOCALES = ['en', 'th'] as const
export const LEARNER_JOURNEY_SYNTHETIC_MARKERS = ['synthetic', 'organic'] as const

export type LearnerJourneyEventSchemaVersion = typeof LEARNER_JOURNEY_EVENT_SCHEMA_VERSION
export type LearnerJourneyEventKey = (typeof LEARNER_JOURNEY_EVENT_KEYS)[number]
export type LearnerJourneyCheckpoint = (typeof LEARNER_JOURNEY_CHECKPOINTS)[number]
export type LearnerJourneyOutcome = (typeof LEARNER_JOURNEY_OUTCOMES)[number]
export type LearnerJourneyStatusClass = (typeof LEARNER_JOURNEY_STATUS_CLASSES)[number]
export type LearnerJourneyLatencyBucket = (typeof LEARNER_JOURNEY_LATENCY_BUCKETS)[number]
export type LearnerJourneyLocale = (typeof LEARNER_JOURNEY_LOCALES)[number]
export type LearnerJourneySyntheticMarker = (typeof LEARNER_JOURNEY_SYNTHETIC_MARKERS)[number]

export interface LearnerJourneyEvent {
  readonly schemaVersion: LearnerJourneyEventSchemaVersion
  readonly checkpoint: LearnerJourneyCheckpoint
  readonly outcome: LearnerJourneyOutcome
  readonly statusClass: LearnerJourneyStatusClass
  readonly latencyBucket: LearnerJourneyLatencyBucket
  readonly locale: LearnerJourneyLocale
  readonly syntheticMarker: LearnerJourneySyntheticMarker
  readonly occurredAt: string
}

export type LearnerJourneyAlertSeverity = 'warning' | 'critical'
export type LearnerJourneyAlertOwner = 'academy_product_operations' | 'identity_operations'

export interface LearnerJourneyAlertClassification {
  readonly checkpoint: LearnerJourneyCheckpoint
  readonly severity: LearnerJourneyAlertSeverity
  readonly owner: LearnerJourneyAlertOwner
}

export type SyntheticLearnerJourneyReadinessStatus = 'ready' | 'degraded'

export interface SyntheticLearnerJourneyReadiness {
  readonly ready: boolean
  readonly status: SyntheticLearnerJourneyReadinessStatus
  readonly missingCheckpoints: readonly LearnerJourneyCheckpoint[]
  readonly failedCheckpoints: readonly LearnerJourneyCheckpoint[]
  readonly alerts: readonly LearnerJourneyAlertClassification[]
}

const failureClassifications = {
  public_catalog_availability: {
    checkpoint: 'public_catalog_availability',
    severity: 'warning',
    owner: 'academy_product_operations',
  },
  sign_in_availability: {
    checkpoint: 'sign_in_availability',
    severity: 'warning',
    owner: 'academy_product_operations',
  },
  identity_authorization_start: {
    checkpoint: 'identity_authorization_start',
    severity: 'critical',
    owner: 'identity_operations',
  },
  identity_callback_completion: {
    checkpoint: 'identity_callback_completion',
    severity: 'critical',
    owner: 'identity_operations',
  },
  learner_enrollment_completion: {
    checkpoint: 'learner_enrollment_completion',
    severity: 'warning',
    owner: 'academy_product_operations',
  },
  learner_progress_persistence: {
    checkpoint: 'learner_progress_persistence',
    severity: 'critical',
    owner: 'academy_product_operations',
  },
} satisfies Readonly<Record<LearnerJourneyCheckpoint, LearnerJourneyAlertClassification>>

const canonicalTimestampPattern =
  /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\.([0-9]{3}))?Z$/

function invalidEvent(): never {
  throw new TypeError('invalid_learner_journey_event')
}

function isOneOf<AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[],
): value is AllowedValue {
  return typeof value === 'string' && allowedValues.some((allowedValue) => allowedValue === value)
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestampParts = canonicalTimestampPattern.exec(value)
  if (timestampParts === null) return false

  const year = Number(timestampParts[1])
  const month = Number(timestampParts[2])
  const day = Number(timestampParts[3])
  if (year < 1) return false

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return day <= daysInMonth[month - 1]
}

function readEnumerableStringProperty(input: object, key: LearnerJourneyEventKey): string {
  const descriptor = Object.getOwnPropertyDescriptor(input, key)
  if (
    descriptor === undefined ||
    descriptor.enumerable !== true ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    typeof descriptor.value !== 'string'
  ) {
    invalidEvent()
  }
  return descriptor.value
}

export function validateLearnerJourneyEvent(input: unknown): LearnerJourneyEvent {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    invalidEvent()
  }

  const ownKeys = Reflect.ownKeys(input)
  if (
    ownKeys.length !== LEARNER_JOURNEY_EVENT_KEYS.length ||
    !ownKeys.every((key) =>
      LEARNER_JOURNEY_EVENT_KEYS.some((allowedKey) => allowedKey === key),
    )
  ) {
    invalidEvent()
  }

  const schemaVersion = readEnumerableStringProperty(input, 'schemaVersion')
  const checkpoint = readEnumerableStringProperty(input, 'checkpoint')
  const outcome = readEnumerableStringProperty(input, 'outcome')
  const statusClass = readEnumerableStringProperty(input, 'statusClass')
  const latencyBucket = readEnumerableStringProperty(input, 'latencyBucket')
  const locale = readEnumerableStringProperty(input, 'locale')
  const syntheticMarker = readEnumerableStringProperty(input, 'syntheticMarker')
  const occurredAt = readEnumerableStringProperty(input, 'occurredAt')

  if (
    schemaVersion !== LEARNER_JOURNEY_EVENT_SCHEMA_VERSION ||
    !isOneOf(checkpoint, LEARNER_JOURNEY_CHECKPOINTS) ||
    !isOneOf(outcome, LEARNER_JOURNEY_OUTCOMES) ||
    !isOneOf(statusClass, LEARNER_JOURNEY_STATUS_CLASSES) ||
    !isOneOf(latencyBucket, LEARNER_JOURNEY_LATENCY_BUCKETS) ||
    !isOneOf(locale, LEARNER_JOURNEY_LOCALES) ||
    !isOneOf(syntheticMarker, LEARNER_JOURNEY_SYNTHETIC_MARKERS) ||
    !isCanonicalTimestamp(occurredAt)
  ) {
    invalidEvent()
  }

  if (
    (outcome === 'success' && statusClass !== 'success') ||
    (outcome === 'expected_denial' && statusClass !== 'expected_denial') ||
    (outcome === 'failure' &&
      statusClass !== 'client_failure' &&
      statusClass !== 'server_failure')
  ) {
    invalidEvent()
  }

  return Object.freeze({
    schemaVersion,
    checkpoint,
    outcome,
    statusClass,
    latencyBucket,
    locale,
    syntheticMarker,
    occurredAt,
  })
}

export function classifyLearnerJourneyEvent(
  input: unknown,
): LearnerJourneyAlertClassification | null {
  const event = validateLearnerJourneyEvent(input)
  if (event.outcome !== 'failure') return null
  return Object.freeze({ ...failureClassifications[event.checkpoint] })
}

function validateEvidenceArray(input: unknown): readonly unknown[] {
  if (
    typeof input !== 'object' ||
    input === null ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    Object.keys(input).length !== input.length ||
    Reflect.ownKeys(input).length !== input.length + 1
  ) {
    invalidEvent()
  }

  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key)
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalidEvent()
    }

    if (key === 'length') {
      if (
        descriptor.value !== input.length ||
        descriptor.enumerable !== false ||
        descriptor.writable !== true ||
        descriptor.configurable !== false
      ) {
        invalidEvent()
      }
      continue
    }

    if (
      typeof key !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(key) ||
      Number(key) >= input.length ||
      descriptor.enumerable !== true
    ) {
      invalidEvent()
    }
  }
  return input
}

export function assessSyntheticLearnerJourneyReadiness(
  input: unknown,
): SyntheticLearnerJourneyReadiness {
  const evidence = validateEvidenceArray(input)
  const validatedEvents: LearnerJourneyEvent[] = []
  const seenCheckpoints = new Set<LearnerJourneyCheckpoint>()

  for (const candidate of evidence) {
    const event = validateLearnerJourneyEvent(candidate)
    if (event.syntheticMarker !== 'synthetic') invalidEvent()
    if (seenCheckpoints.has(event.checkpoint)) invalidEvent()
    seenCheckpoints.add(event.checkpoint)
    validatedEvents.push(event)
  }

  const missingCheckpoints = LEARNER_JOURNEY_CHECKPOINTS.filter(
    (checkpoint) => !seenCheckpoints.has(checkpoint),
  )
  const failedCheckpoints = LEARNER_JOURNEY_CHECKPOINTS.filter(
    (checkpoint) =>
      seenCheckpoints.has(checkpoint) &&
      validatedEvents.some(
        (event) => event.checkpoint === checkpoint && event.outcome === 'failure',
      ),
  )
  const alerts = failedCheckpoints.map(
    (checkpoint) => Object.freeze({ ...failureClassifications[checkpoint] }),
  )
  const ready =
    missingCheckpoints.length === 0 &&
    evidence.length === 6 &&
    validatedEvents.every((event) => event.outcome === 'success')

  return Object.freeze({
    ready,
    status: ready ? 'ready' : 'degraded',
    missingCheckpoints: Object.freeze([...missingCheckpoints]),
    failedCheckpoints: Object.freeze([...failedCheckpoints]),
    alerts: Object.freeze([...alerts]),
  })
}
