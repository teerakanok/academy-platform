import type { IdentityLifecycleEvent } from './lifecycle-envelope-verifier'
import {
  isCanonicalIdentityLifecyclePrincipalIssuer,
  isWellFormedIdentityLifecycleSubject,
} from './lifecycle-principal'
import {
  reduceIdentityLifecycleProjection,
  type IdentityLifecycleProjection,
} from './lifecycle-reducer'
import {
  parseIdentityLifecyclePullLease,
  parseIdentityLifecyclePullLeaseClaimInput,
  parseIdentityLifecyclePullLeaseFence,
  parseIdentityLifecyclePullLeaseReleaseInput,
  parseIdentityLifecyclePullLeaseRenewInput,
  type IdentityLifecyclePullLease,
  type IdentityLifecyclePullLeaseClaimInput,
  type IdentityLifecyclePullLeaseFence,
  type IdentityLifecyclePullLeaseReleaseInput,
  type IdentityLifecyclePullLeaseRenewInput,
  type IdentityLifecyclePullLeaseStore,
} from './lifecycle-pull-lease'

const PAGE_KEYS = ['configRevision', 'events', 'nextCursor'] as const
const COMMIT_KEYS = ['configuration', 'expectedCursor', 'nextCursor', 'projections'] as const
const SNAPSHOT_KEYS = ['configuration', 'cursor', 'projections'] as const
const CONFIGURATION_KEYS = ['approvedRevision', 'health'] as const
const PROJECTION_KEYS = ['current', 'health', 'highestKnownRevision'] as const
const CURRENT_KEYS = ['issuer', 'revision', 'state', 'subject'] as const
const WIRE_CURRENT_KEYS = ['issuer', 'revision', 'state', 'subjectKey'] as const
const READY_HEALTH_KEYS = ['status'] as const
const GAP_HEALTH_KEYS = ['observed', 'status'] as const
const CONFLICT_HEALTH_KEYS = ['reason', 'status'] as const
const CONFIG_CHANGED_HEALTH_KEYS = ['observedRevision', 'status'] as const
const STATES = ['active', 'disabled', 'deleted'] as const
const CONFLICT_REASONS = ['event_conflict', 'unresolved_conflict'] as const
const MAX_PAGE_EVENTS = 100
const MAX_PRINCIPAL_LENGTH = 512
const MAX_CURSOR = BigInt('9223372036854775807')

export type IdentityLifecycleConfigurationProjection = {
  approvedRevision: number
  health:
    | { status: 'ready' }
    | { status: 'config_revision_changed'; observedRevision: number }
}

export type IdentityLifecycleDurableProjection = {
  current: IdentityLifecycleProjection
  health:
    | { status: 'ready' }
    | { status: 'gap'; observed: IdentityLifecycleProjection }
    | { status: 'conflict'; reason: 'event_conflict' | 'unresolved_conflict' }
  highestKnownRevision: number
}

export type IdentityLifecycleConsumerSnapshot = {
  cursor: string | null
  configuration: IdentityLifecycleConfigurationProjection
  projections: IdentityLifecycleDurableProjection[]
}

export type IdentityLifecyclePageCommit = {
  expectedCursor: string | null
  nextCursor: string | null
  configuration: IdentityLifecycleConfigurationProjection
  projections: IdentityLifecycleDurableProjection[]
}

export type VerifiedIdentityLifecyclePage = {
  nextCursor: string | null
  configRevision: number
  events: readonly IdentityLifecycleEvent[]
}

export type IdentityLifecycleRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export type IdentityLifecycleSnapshotStore = {
  read(): Promise<IdentityLifecycleConsumerSnapshot | null>
}

export type IdentityLifecycleLeasedPageStore =
  IdentityLifecycleSnapshotStore
  & IdentityLifecyclePullLeaseStore
  & {
    commitPageUnderLease(
      commit: IdentityLifecyclePageCommit,
      fence: IdentityLifecyclePullLeaseFence,
    ): Promise<void>
  }

export class AcademyIdentityLifecyclePageStore
implements IdentityLifecycleLeasedPageStore {
  readonly durable = true

  constructor(private readonly client: IdentityLifecycleRpcClient) {}

  async read(): Promise<IdentityLifecycleConsumerSnapshot | null> {
    const { data, error } = await this.client.rpc('read_identity_lifecycle_snapshot', {})
    if (error) throw new Error('Identity lifecycle snapshot read failed')
    if (data === null) return null
    const snapshot = parseRpcSnapshot(data)
    if (!snapshot) throw new Error('Identity lifecycle snapshot response is invalid')
    return snapshot
  }

  async claimPullLease(
    inputValue: IdentityLifecyclePullLeaseClaimInput,
  ): Promise<IdentityLifecyclePullLease | null> {
    const input = parseIdentityLifecyclePullLeaseClaimInput(inputValue)
    const { data, error } = await this.client.rpc('claim_identity_lifecycle_pull_lease', {
      p_claimed_by: input.workerId,
      p_lease_duration_ms: input.leaseDurationMs,
    })
    if (error) throw new Error('Identity lifecycle pull lease claim failed')
    if (data === null) return null
    try {
      return parseIdentityLifecyclePullLease(data)
    } catch {
      throw new Error('Identity lifecycle pull lease claim response is invalid')
    }
  }

  async renewPullLease(
    inputValue: IdentityLifecyclePullLeaseRenewInput,
  ): Promise<IdentityLifecyclePullLease | null> {
    const input = parseIdentityLifecyclePullLeaseRenewInput(inputValue)
    const { data, error } = await this.client.rpc('renew_identity_lifecycle_pull_lease', {
      p_claim_token: input.claimToken,
      p_claimed_by: input.claimedBy,
      p_lease_duration_ms: input.leaseDurationMs,
    })
    if (error) throw new Error('Identity lifecycle pull lease renewal failed')
    if (data === null) return null
    try {
      return parseIdentityLifecyclePullLease(data)
    } catch {
      throw new Error('Identity lifecycle pull lease renewal response is invalid')
    }
  }

  async releasePullLease(inputValue: IdentityLifecyclePullLeaseReleaseInput): Promise<boolean> {
    const input = parseIdentityLifecyclePullLeaseReleaseInput(inputValue)
    const { data, error } = await this.client.rpc('release_identity_lifecycle_pull_lease', {
      p_claim_token: input.claimToken,
      p_claimed_by: input.claimedBy,
    })
    if (error) throw new Error('Identity lifecycle pull lease release failed')
    if (typeof data !== 'boolean') {
      throw new Error('Identity lifecycle pull lease release response is invalid')
    }
    return data
  }

  async commitPageUnderLease(
    commitValue: unknown,
    fenceValue: unknown,
  ): Promise<void> {
    const commit = parseCommit(commitValue)
    if (!commit) throw new Error('Identity lifecycle page commit is invalid')
    const fence = parseIdentityLifecyclePullLeaseFence(fenceValue)
    const { error } = await this.client.rpc('commit_identity_lifecycle_page_under_lease', {
      p_claim_token: fence.claimToken,
      p_claimed_by: fence.claimedBy,
      ...commitRpcParameters(commit),
    })
    if (error) throw new Error('Identity lifecycle page commit under lease failed')
  }
}

function commitRpcParameters(commit: IdentityLifecyclePageCommit): Record<string, unknown> {
  const configuration = commit.configuration
  return {
    p_expected_cursor: commit.expectedCursor,
    p_next_cursor: commit.nextCursor,
    p_approved_config_revision: configuration.approvedRevision,
    p_configuration_health: configuration.health.status,
    p_observed_config_revision: configuration.health.status === 'config_revision_changed'
      ? configuration.health.observedRevision
      : null,
    p_projections: commit.projections.map(toWireDurableProjection),
  }
}

export function buildIdentityLifecyclePageCommit(
  snapshotValue: unknown,
  pageValue: unknown,
  approvedConfigRevision: unknown,
): IdentityLifecyclePageCommit {
  assertPositiveSafeInteger(approvedConfigRevision, 'approved config revision')
  const snapshot = snapshotValue === null ? null : parseSnapshot(snapshotValue)
  if (snapshotValue !== null && !snapshot) {
    throw new Error('Identity lifecycle durable snapshot is invalid')
  }
  if (snapshot && snapshot.configuration.approvedRevision !== approvedConfigRevision) {
    throw new Error('Identity lifecycle approved config revision does not match durable state')
  }
  const page = parseVerifiedPage(pageValue)
  const configuration = observeConfiguration(
    snapshot?.configuration ?? {
      approvedRevision: approvedConfigRevision,
      health: { status: 'ready' },
    },
    page.configRevision,
  )

  const projections = new Map<string, IdentityLifecycleDurableProjection>()
  for (const projection of snapshot?.projections ?? []) {
    projections.set(principalKey(projection.current), cloneDurableProjection(projection))
  }
  const updates = new Map<string, IdentityLifecycleDurableProjection>()
  for (const eventValue of page.events) {
    const incoming = projectValidatedEvent(eventValue)
    const key = principalKey(incoming)
    const reduced = applyProjection(projections.get(key) ?? null, incoming)
    projections.set(key, reduced)
    updates.set(key, reduced)
  }

  return {
    expectedCursor: snapshot?.cursor ?? null,
    nextCursor: page.nextCursor,
    configuration,
    projections: [...updates.values()].sort(compareDurableProjections),
  }
}

function parseVerifiedPage(value: unknown): VerifiedIdentityLifecyclePage {
  const snapshot = snapshotExactDataProperties(value, PAGE_KEYS)
  if (!snapshot) throw new Error('Identity lifecycle verified page must use the exact schema')
  const nextCursor = parseCursor(snapshot.nextCursor)
  assertPositiveSafeInteger(snapshot.configRevision, 'config revision')
  const events = snapshotDenseArray(snapshot.events, MAX_PAGE_EVENTS)
  if (!events) throw new Error('Identity lifecycle verified page event count is invalid')
  return {
    nextCursor,
    configRevision: snapshot.configRevision,
    events: events as IdentityLifecycleEvent[],
  }
}

function parseCommit(value: unknown): IdentityLifecyclePageCommit | null {
  try {
    const snapshot = snapshotExactDataProperties(value, COMMIT_KEYS)
    if (!snapshot) return null
    const projections = parseDurableProjectionArray(snapshot.projections, MAX_PAGE_EVENTS)
    const configuration = parseConfiguration(snapshot.configuration)
    if (!projections || !configuration) return null
    return {
      expectedCursor: parseCursor(snapshot.expectedCursor),
      nextCursor: parseCursor(snapshot.nextCursor),
      configuration,
      projections,
    }
  } catch {
    return null
  }
}

function parseSnapshot(value: unknown): IdentityLifecycleConsumerSnapshot | null {
  try {
    const snapshot = snapshotExactDataProperties(value, SNAPSHOT_KEYS)
    if (!snapshot) return null
    const configuration = parseConfiguration(snapshot.configuration)
    const projections = parseDurableProjectionArray(snapshot.projections)
    if (!configuration || !projections) return null
    return {
      cursor: parseCursor(snapshot.cursor),
      configuration,
      projections,
    }
  } catch {
    return null
  }
}

function parseRpcSnapshot(value: unknown): IdentityLifecycleConsumerSnapshot | null {
  try {
    const snapshot = snapshotExactDataProperties(value, SNAPSHOT_KEYS)
    if (!snapshot) return null
    const configuration = parseConfiguration(snapshot.configuration)
    const projections = parseWireDurableProjectionArray(snapshot.projections)
    if (!configuration || !projections) return null
    return {
      cursor: parseCursor(snapshot.cursor),
      configuration,
      projections,
    }
  } catch {
    return null
  }
}

function parseConfiguration(value: unknown): IdentityLifecycleConfigurationProjection | null {
  const snapshot = snapshotExactDataProperties(value, CONFIGURATION_KEYS)
  if (!snapshot || !isPositiveSafeInteger(snapshot.approvedRevision)) return null
  const ready = snapshotExactDataProperties(snapshot.health, READY_HEALTH_KEYS)
  if (ready?.status === 'ready') {
    return { approvedRevision: snapshot.approvedRevision, health: { status: 'ready' } }
  }
  const changed = snapshotExactDataProperties(snapshot.health, CONFIG_CHANGED_HEALTH_KEYS)
  if (!changed
    || changed.status !== 'config_revision_changed'
    || !isPositiveSafeInteger(changed.observedRevision)
    || changed.observedRevision === snapshot.approvedRevision) {
    return null
  }
  return {
    approvedRevision: snapshot.approvedRevision,
    health: {
      status: 'config_revision_changed',
      observedRevision: changed.observedRevision,
    },
  }
}

function parseDurableProjectionArray(
  value: unknown,
  maximum?: number,
): IdentityLifecycleDurableProjection[] | null {
  const values = snapshotDenseArray(value, maximum)
  if (!values) return null
  const projections: IdentityLifecycleDurableProjection[] = []
  const principals = new Set<string>()
  for (const value of values) {
    const projection = parseDurableProjection(value)
    if (!projection) return null
    const key = principalKey(projection.current)
    if (principals.has(key)) throw new Error('Identity lifecycle page contains a duplicate projection')
    principals.add(key)
    projections.push(projection)
  }
  return projections
}

function parseWireDurableProjectionArray(value: unknown): IdentityLifecycleDurableProjection[] | null {
  const values = snapshotDenseArray(value)
  if (!values) return null
  const projections: IdentityLifecycleDurableProjection[] = []
  const principals = new Set<string>()
  for (const value of values) {
    const projection = parseWireDurableProjection(value)
    if (!projection) return null
    const key = principalKey(projection.current)
    if (principals.has(key)) return null
    principals.add(key)
    projections.push(projection)
  }
  return projections
}

function parseWireDurableProjection(value: unknown): IdentityLifecycleDurableProjection | null {
  const snapshot = snapshotExactDataProperties(value, PROJECTION_KEYS)
  if (!snapshot) return null
  const current = parseWireCurrent(snapshot.current)
  if (!current) return null

  const ready = snapshotExactDataProperties(snapshot.health, READY_HEALTH_KEYS)
  if (ready?.status === 'ready') {
    return parseDurableProjection({
      current,
      health: { status: 'ready' },
      highestKnownRevision: snapshot.highestKnownRevision,
    })
  }
  const gap = snapshotExactDataProperties(snapshot.health, GAP_HEALTH_KEYS)
  if (gap?.status === 'gap') {
    const observed = parseWireCurrent(gap.observed)
    if (!observed) return null
    return parseDurableProjection({
      current,
      health: { status: 'gap', observed },
      highestKnownRevision: snapshot.highestKnownRevision,
    })
  }
  const conflict = snapshotExactDataProperties(snapshot.health, CONFLICT_HEALTH_KEYS)
  if (conflict?.status !== 'conflict') return null
  return parseDurableProjection({
    current,
    health: { status: 'conflict', reason: conflict.reason },
    highestKnownRevision: snapshot.highestKnownRevision,
  })
}

function parseWireCurrent(value: unknown): IdentityLifecycleProjection | null {
  const snapshot = snapshotExactDataProperties(value, WIRE_CURRENT_KEYS)
  if (!snapshot || typeof snapshot.subjectKey !== 'string') return null
  const subject = decodeSubjectKey(snapshot.subjectKey)
  if (subject === null) return null
  return parseCurrent({
    issuer: snapshot.issuer,
    subject,
    state: snapshot.state,
    revision: snapshot.revision,
  })
}

function parseDurableProjection(value: unknown): IdentityLifecycleDurableProjection | null {
  const snapshot = snapshotExactDataProperties(value, PROJECTION_KEYS)
  if (!snapshot || !isPositiveSafeInteger(snapshot.highestKnownRevision)) return null
  const current = parseCurrent(snapshot.current)
  if (!current || snapshot.highestKnownRevision < current.revision) return null

  const ready = snapshotExactDataProperties(snapshot.health, READY_HEALTH_KEYS)
  if (ready?.status === 'ready') {
    if (snapshot.highestKnownRevision !== current.revision) return null
    return { current, health: { status: 'ready' }, highestKnownRevision: current.revision }
  }
  const gap = snapshotExactDataProperties(snapshot.health, GAP_HEALTH_KEYS)
  if (gap?.status === 'gap') {
    const observed = parseCurrent(gap.observed)
    if (!observed
      || !samePrincipal(current, observed)
      || observed.revision <= current.revision
      || observed.revision > snapshot.highestKnownRevision) {
      return null
    }
    return {
      current,
      health: { status: 'gap', observed },
      highestKnownRevision: snapshot.highestKnownRevision,
    }
  }
  const conflict = snapshotExactDataProperties(snapshot.health, CONFLICT_HEALTH_KEYS)
  if (conflict?.status !== 'conflict'
    || !CONFLICT_REASONS.includes(conflict.reason as (typeof CONFLICT_REASONS)[number])) {
    return null
  }
  return {
    current,
    health: {
      status: 'conflict',
      reason: conflict.reason as (typeof CONFLICT_REASONS)[number],
    },
    highestKnownRevision: snapshot.highestKnownRevision,
  }
}

function parseCurrent(value: unknown): IdentityLifecycleProjection | null {
  const snapshot = snapshotExactDataProperties(value, CURRENT_KEYS)
  if (!snapshot
    || typeof snapshot.issuer !== 'string'
    || !isCanonicalIdentityLifecyclePrincipalIssuer(snapshot.issuer)
    || !isWellFormedIdentityLifecycleSubject(snapshot.subject)
    || !STATES.includes(snapshot.state as IdentityLifecycleProjection['state'])
    || !isPositiveSafeInteger(snapshot.revision)) {
    return null
  }
  return {
    issuer: snapshot.issuer,
    subject: snapshot.subject,
    state: snapshot.state as IdentityLifecycleProjection['state'],
    revision: snapshot.revision,
  }
}

function encodeSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function decodeSubjectKey(value: string): string | null {
  if (value.length < 4
    || value.length > MAX_PRINCIPAL_LENGTH * 4
    || value.length % 4 !== 0
    || !/^[0-9a-f]+$/.test(value)) {
    return null
  }
  let subject = ''
  for (let offset = 0; offset < value.length; offset += 4) {
    const group = value.slice(offset, offset + 4)
    if (group === '0000') return null
    subject += String.fromCharCode(Number.parseInt(group, 16))
  }
  return isWellFormedIdentityLifecycleSubject(subject) ? subject : null
}

function toWireCurrent(current: IdentityLifecycleProjection) {
  return {
    issuer: current.issuer,
    subjectKey: encodeSubjectKey(current.subject),
    state: current.state,
    revision: current.revision,
  }
}

function toWireDurableProjection(projection: IdentityLifecycleDurableProjection) {
  return {
    current: toWireCurrent(projection.current),
    health: projection.health.status === 'gap'
      ? { status: 'gap' as const, observed: toWireCurrent(projection.health.observed) }
      : { ...projection.health },
    highestKnownRevision: projection.highestKnownRevision,
  }
}

function observeConfiguration(
  current: IdentityLifecycleConfigurationProjection,
  observedRevision: number,
): IdentityLifecycleConfigurationProjection {
  if (current.health.status === 'ready') {
    return observedRevision === current.approvedRevision
      ? cloneConfiguration(current)
      : {
          approvedRevision: current.approvedRevision,
          health: { status: 'config_revision_changed', observedRevision },
        }
  }
  if (observedRevision === current.approvedRevision
    || observedRevision === current.health.observedRevision) {
    return cloneConfiguration(current)
  }
  return {
    approvedRevision: current.approvedRevision,
    health: { status: 'config_revision_changed', observedRevision },
  }
}

function applyProjection(
  current: IdentityLifecycleDurableProjection | null,
  incoming: IdentityLifecycleProjection,
): IdentityLifecycleDurableProjection {
  if (!current) return readyProjection(incoming)
  if (current.health.status === 'conflict') {
    if (incoming.revision < current.current.revision
      || incoming.revision === current.current.revision && incoming.state === current.current.state) {
      return cloneDurableProjection(current)
    }
    return conflictProjection(
      current.current,
      incoming.revision === current.current.revision ? 'event_conflict' : 'unresolved_conflict',
      Math.max(current.highestKnownRevision, incoming.revision),
    )
  }
  if (current.health.status === 'gap') {
    if (incoming.revision < current.current.revision
      || incoming.revision === current.current.revision && incoming.state === current.current.state) {
      return cloneDurableProjection(current)
    }
    if (incoming.revision === current.current.revision
      || incoming.revision === current.health.observed.revision
        && incoming.state !== current.health.observed.state) {
      return conflictProjection(
        current.current,
        'event_conflict',
        Math.max(current.highestKnownRevision, incoming.revision),
      )
    }
    return {
      current: cloneCurrent(current.current),
      health: { status: 'gap', observed: cloneCurrent(current.health.observed) },
      highestKnownRevision: Math.max(current.highestKnownRevision, incoming.revision),
    }
  }

  const syntheticEvent = projectionEvent(incoming)
  const reduction = reduceIdentityLifecycleProjection(current.current, syntheticEvent)
  if (!reduction.projection) throw new Error('Identity lifecycle projection reduction failed closed')
  if (reduction.disposition === 'applied') return readyProjection(reduction.projection)
  if (reduction.disposition === 'duplicate' || reduction.disposition === 'stale') {
    return cloneDurableProjection(current)
  }
  if (reduction.disposition === 'gap') {
    return {
      current: cloneCurrent(current.current),
      health: { status: 'gap', observed: cloneCurrent(incoming) },
      highestKnownRevision: incoming.revision,
    }
  }
  return conflictProjection(current.current, 'event_conflict', current.highestKnownRevision)
}

function projectValidatedEvent(value: unknown): IdentityLifecycleProjection {
  const reduction = reduceIdentityLifecycleProjection(null, value)
  if (reduction.disposition !== 'applied' || !reduction.projection) {
    throw new Error('Identity lifecycle verified page contains an invalid event')
  }
  return reduction.projection
}

function projectionEvent(projection: IdentityLifecycleProjection): IdentityLifecycleEvent {
  return {
    eventId: '00000000-0000-4000-8000-000000000000',
    kind: 'account.lifecycle.changed',
    issuer: projection.issuer,
    subject: projection.subject,
    state: projection.state,
    revision: projection.revision,
    occurredAt: '2000-01-01T00:00:00.000Z',
    reason: `account_${projection.state}`,
  }
}

function readyProjection(current: IdentityLifecycleProjection): IdentityLifecycleDurableProjection {
  return {
    current: cloneCurrent(current),
    health: { status: 'ready' },
    highestKnownRevision: current.revision,
  }
}

function conflictProjection(
  current: IdentityLifecycleProjection,
  reason: 'event_conflict' | 'unresolved_conflict',
  highestKnownRevision: number,
): IdentityLifecycleDurableProjection {
  return {
    current: cloneCurrent(current),
    health: { status: 'conflict', reason },
    highestKnownRevision,
  }
}

function parseCursor(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string'
    || !/^(0|[1-9][0-9]{0,18})$/.test(value)
    || BigInt(value) > MAX_CURSOR) {
    throw new Error('Identity lifecycle cursor is invalid')
  }
  return value
}

function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
  if (!isPositiveSafeInteger(value)) throw new Error(`Identity lifecycle ${label} is invalid`)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1
}

function snapshotDenseArray(value: unknown, maximum?: number): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || maximum !== undefined && value.length > maximum) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || !keys.includes('length')) return null
  const result: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index)
    if (!keys.includes(key)) return null
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    result.push(descriptor.value)
  }
  return result
}

function snapshotExactDataProperties<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== 'string'
      || !expectedKeys.includes(key as Keys[number]))) {
    return null
  }
  const snapshot = Object.create(null) as Record<Keys[number], unknown>
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true })
  }
  return snapshot
}

function cloneConfiguration(
  configuration: IdentityLifecycleConfigurationProjection,
): IdentityLifecycleConfigurationProjection {
  return configuration.health.status === 'ready'
    ? { approvedRevision: configuration.approvedRevision, health: { status: 'ready' } }
    : {
        approvedRevision: configuration.approvedRevision,
        health: {
          status: 'config_revision_changed',
          observedRevision: configuration.health.observedRevision,
        },
      }
}

function cloneDurableProjection(
  projection: IdentityLifecycleDurableProjection,
): IdentityLifecycleDurableProjection {
  if (projection.health.status === 'ready') return readyProjection(projection.current)
  if (projection.health.status === 'conflict') {
    return conflictProjection(
      projection.current,
      projection.health.reason,
      projection.highestKnownRevision,
    )
  }
  return {
    current: cloneCurrent(projection.current),
    health: { status: 'gap', observed: cloneCurrent(projection.health.observed) },
    highestKnownRevision: projection.highestKnownRevision,
  }
}

function cloneCurrent(current: IdentityLifecycleProjection): IdentityLifecycleProjection {
  return {
    issuer: current.issuer,
    subject: current.subject,
    state: current.state,
    revision: current.revision,
  }
}

function principalKey(current: IdentityLifecycleProjection): string {
  return `${current.issuer}\0${current.subject}`
}

function samePrincipal(
  left: IdentityLifecycleProjection,
  right: IdentityLifecycleProjection,
): boolean {
  return left.issuer === right.issuer && left.subject === right.subject
}

function compareDurableProjections(
  left: IdentityLifecycleDurableProjection,
  right: IdentityLifecycleDurableProjection,
): number {
  return codeUnitCompare(left.current.issuer, right.current.issuer)
    || codeUnitCompare(left.current.subject, right.current.subject)
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
