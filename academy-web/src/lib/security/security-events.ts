import 'server-only'

export type AcademySecurityEventName =
  | 'identity_callback'
  | 'durable_session_validation'
  | 'local_logout'
  | 'service_access'
  | 'course_access'
  | 'course_resource'
  | 'security_event_budget'

export type AcademySecurityEventOutcome =
  | 'success'
  | 'failure'
  | 'dropped'

export type AcademySecurityEventReason =
  | 'completed'
  | 'invalid_callback'
  | 'exception'
  | 'validated'
  | 'session_not_found'
  | 'account_not_found'
  | 'session_store_unavailable'
  | 'confirmed'
  | 'not_confirmed'
  | 'allowed'
  | 'inactive'
  | 'unavailable'
  | 'retired'
  | 'not_entitled'
  | 'locked'
  | 'per_isolate_limit'

export type AcademySecurityEventInput = {
  event: AcademySecurityEventName
  outcome: AcademySecurityEventOutcome
  reason: AcademySecurityEventReason
}

type AcademySecurityEventLogger = (line: string) => void

const EVENT_CATEGORIES = {
  identity_callback: 'authentication',
  durable_session_validation: 'authentication',
  local_logout: 'authentication',
  service_access: 'authorization',
  course_access: 'authorization',
  course_resource: 'authorization',
  security_event_budget: 'security_logging',
} as const satisfies Record<AcademySecurityEventName, string>

const ALLOWED_REASON_COMBINATIONS: Record<
  AcademySecurityEventName,
  ReadonlyMap<AcademySecurityEventOutcome, readonly AcademySecurityEventReason[]>
> = {
  identity_callback: new Map([
    ['success', ['completed']],
    ['failure', ['invalid_callback', 'exception']],
  ]),
  durable_session_validation: new Map([
    ['success', ['validated']],
    ['failure', ['session_not_found', 'account_not_found', 'session_store_unavailable', 'exception']],
  ]),
  local_logout: new Map([
    ['success', ['confirmed']],
    ['failure', ['not_confirmed', 'exception']],
  ]),
  service_access: new Map([
    ['success', ['allowed']],
    ['failure', ['inactive', 'unavailable']],
  ]),
  course_access: new Map([
    ['success', ['allowed']],
    ['failure', ['retired', 'inactive', 'not_entitled', 'unavailable']],
  ]),
  course_resource: new Map([
    ['success', ['allowed']],
    ['failure', ['retired', 'inactive', 'not_entitled', 'locked', 'unavailable']],
  ]),
  security_event_budget: new Map([
    ['dropped', ['per_isolate_limit']],
  ]),
}

const INPUT_KEYS = ['event', 'outcome', 'reason'] as const
const PER_ISOLATE_LOGGER_LIMIT = 256
const DROPPED_COUNT_LIMIT = Number.MAX_SAFE_INTEGER

let logger: AcademySecurityEventLogger = line => console.log(line)
let emittedCount = 0
let droppedCount = 0
let droppedSummaryEmitted = false

export function configureAcademySecurityEventLogger(
  replacementLogger: AcademySecurityEventLogger,
): AcademySecurityEventLogger {
  const previousLogger = logger
  logger = replacementLogger
  return previousLogger
}

export function resetAcademySecurityEventBudgetForTests(): void {
  emittedCount = 0
  droppedCount = 0
  droppedSummaryEmitted = false
}

export function getAcademySecurityEventBudgetForTests(): {
  emittedCount: number
  droppedCount: number
  loggerLimit: number
} {
  return { emittedCount, droppedCount, loggerLimit: PER_ISOLATE_LOGGER_LIMIT }
}

export function emitAcademySecurityEvent(input: AcademySecurityEventInput): boolean {
  try {
    const exactInput = snapshotExactInput(input)
    if (!isAllowedCombination(exactInput)) return recordDrop()
    if (emittedCount >= PER_ISOLATE_LOGGER_LIMIT - 1) return recordDrop()

    const event = {
      schema_version: 1,
      event: exactInput.event,
      category: EVENT_CATEGORIES[exactInput.event],
      outcome: exactInput.outcome,
      reason: exactInput.reason,
      time: new Date().toISOString(),
    }
    emitLine(JSON.stringify(event))
    emittedCount += 1
    return true
  } catch {
    return recordDrop()
  }
}

function recordDrop(): boolean {
  droppedCount = Math.min(droppedCount + 1, DROPPED_COUNT_LIMIT)
  if (droppedSummaryEmitted || emittedCount >= PER_ISOLATE_LOGGER_LIMIT) return false

  const event = {
    schema_version: 1,
    event: 'security_event_budget',
    category: 'security_logging',
    outcome: 'dropped',
    reason: 'per_isolate_limit',
    dropped_count: droppedCount,
    time: new Date().toISOString(),
  }
  emitLine(JSON.stringify(event))
  emittedCount += 1
  droppedSummaryEmitted = true
  return false
}

function emitLine(line: string): void {
  try {
    logger(line)
  } catch {
    return
  }
}

function snapshotExactInput(value: AcademySecurityEventInput): AcademySecurityEventInput {
  if (!value || typeof value !== 'object') throw new Error('invalid input')
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error('invalid prototype')
  const ownKeys = Reflect.ownKeys(value)
  if (
    ownKeys.length !== INPUT_KEYS.length
    || ownKeys.some((key, index) => key !== INPUT_KEYS[index])
  ) {
    throw new Error('invalid keys')
  }

  const event = Reflect.get(value, 'event')
  const outcome = Reflect.get(value, 'outcome')
  const reason = Reflect.get(value, 'reason')
  if (typeof event !== 'string' || typeof outcome !== 'string' || typeof reason !== 'string') {
    throw new Error('invalid values')
  }
  return { event, outcome, reason } as AcademySecurityEventInput
}

function isAllowedCombination(value: AcademySecurityEventInput): boolean {
  const reasons = ALLOWED_REASON_COMBINATIONS[value.event]?.get(value.outcome)
  return reasons?.includes(value.reason) === true
}


