import type { IdentityLifecycleEvent } from './lifecycle-envelope-verifier'

const EVENT_KEYS = ['eventId', 'issuer', 'kind', 'occurredAt', 'reason', 'revision', 'state', 'subject'] as const
const PROJECTION_KEYS = ['issuer', 'revision', 'state', 'subject'] as const
const PUBLISHED_REASON_CODES = ['account_active', 'account_deleted', 'account_disabled'] as const
const PUBLISHED_STATES = ['active', 'disabled', 'deleted'] as const

export type IdentityLifecycleProjection = {
  issuer: string
  subject: string
  state: IdentityLifecycleEvent['state']
  revision: number
}

export type IdentityLifecycleReductionDisposition =
  | 'applied'
  | 'duplicate'
  | 'stale'
  | 'gap'
  | 'conflict'

export type IdentityLifecycleReduction = {
  disposition: IdentityLifecycleReductionDisposition
  projection: IdentityLifecycleProjection | null
}

export function reduceIdentityLifecycleProjection(
  currentValue: unknown,
  eventValue: unknown,
): IdentityLifecycleReduction {
  let current: IdentityLifecycleProjection | null = null
  try {
    current = currentValue === null ? null : parseProjection(currentValue)
    if (currentValue !== null && !current) return result('conflict', null)

    const event = parseEvent(eventValue)
    if (!event) return result('conflict', current)

    if (!current) return result('applied', projectEvent(event))
    if (event.issuer !== current.issuer || event.subject !== current.subject) {
      return result('conflict', current)
    }
    if (event.revision < current.revision) return result('stale', current)
    if (event.revision === current.revision) {
      return result(event.state === current.state ? 'duplicate' : 'conflict', current)
    }
    if (event.revision !== current.revision + 1) return result('gap', current)
    return result('applied', projectEvent(event))
  } catch {
    return result('conflict', current)
  }
}

function result(
  disposition: IdentityLifecycleReductionDisposition,
  projection: IdentityLifecycleProjection | null,
): IdentityLifecycleReduction {
  return {
    disposition,
    projection: projection ? cloneProjection(projection) : null,
  }
}

function projectEvent(event: IdentityLifecycleEvent): IdentityLifecycleProjection {
  return {
    issuer: event.issuer,
    subject: event.subject,
    state: event.state,
    revision: event.revision,
  }
}

function cloneProjection(projection: IdentityLifecycleProjection): IdentityLifecycleProjection {
  return {
    issuer: projection.issuer,
    subject: projection.subject,
    state: projection.state,
    revision: projection.revision,
  }
}

function parseProjection(value: unknown): IdentityLifecycleProjection | null {
  const snapshot = snapshotExactDataProperties(value, PROJECTION_KEYS)
  if (!snapshot
    || !isPrincipal(snapshot)
    || !PUBLISHED_STATES.includes(snapshot.state as IdentityLifecycleEvent['state'])
    || !isRevision(snapshot.revision)) {
    return null
  }
  return {
    issuer: snapshot.issuer as string,
    subject: snapshot.subject as string,
    state: snapshot.state as IdentityLifecycleEvent['state'],
    revision: snapshot.revision as number,
  }
}

function parseEvent(value: unknown): IdentityLifecycleEvent | null {
  const snapshot = snapshotExactDataProperties(value, EVENT_KEYS)
  if (!snapshot
    || typeof snapshot.eventId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.eventId)
    || snapshot.kind !== 'account.lifecycle.changed'
    || !isPrincipal(snapshot)
    || !PUBLISHED_STATES.includes(snapshot.state as IdentityLifecycleEvent['state'])
    || !isRevision(snapshot.revision)
    || typeof snapshot.occurredAt !== 'string'
    || !isExactTimestamp(snapshot.occurredAt)
    || typeof snapshot.reason !== 'string'
    || !PUBLISHED_REASON_CODES.includes(snapshot.reason as IdentityLifecycleEvent['reason'])) {
    return null
  }
  return {
    eventId: snapshot.eventId,
    kind: snapshot.kind,
    issuer: snapshot.issuer as string,
    subject: snapshot.subject as string,
    state: snapshot.state as IdentityLifecycleEvent['state'],
    revision: snapshot.revision,
    occurredAt: snapshot.occurredAt,
    reason: snapshot.reason as IdentityLifecycleEvent['reason'],
  }
}

function snapshotExactDataProperties<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key as Keys[number]))) {
    return null
  }

  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
    })
  }
  return snapshot
}

function isPrincipal(value: Record<string, unknown>): boolean {
  return typeof value.issuer === 'string'
    && isExactHttpsUrl(value.issuer)
    && value.issuer.length <= 512
    && !value.issuer.includes('\0')
    && typeof value.subject === 'string'
    && value.subject.length >= 1
    && value.subject.length <= 512
    && !value.subject.includes('\0')
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1
}

function isExactTimestamp(value: string): boolean {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function isExactHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.toString() === value
  } catch {
    return false
  }
}
