import {
  buildIdentityLifecyclePageCommit,
  type IdentityLifecycleLeasedPageStore,
  type IdentityLifecyclePageCommit,
  type VerifiedIdentityLifecyclePage,
} from './lifecycle-page-store'

const PULL_CYCLE_FAILURE_MESSAGE = 'Identity lifecycle pull cycle failed'

export type IdentityLifecyclePullCycleClock = {
  now(): Date
}

// The adapter returns only pages already authenticated, request-bound, and
// cryptographically verified using the supplied time.
export type IdentityLifecycleVerifiedPageTransport = {
  pullVerifiedPage(input: {
    cursor: string | null
    verificationTime: Date
  }): Promise<VerifiedIdentityLifecyclePage>
}

export type IdentityLifecyclePullCycleInput = {
  store: IdentityLifecycleLeasedPageStore
  transport: IdentityLifecycleVerifiedPageTransport
  clock: IdentityLifecyclePullCycleClock
  approvedConfigRevision: number
  workerId: string
  leaseDurationMs: number
}

export type IdentityLifecycleLeaseReleaseStatus =
  | 'confirmed'
  | 'not_confirmed'
  | 'unknown'

type IdentityLifecyclePullCyclePrimaryResult =
  | {
    outcome: 'committed'
    cursor: string | null
    health: {
      configuration: 'ready' | 'config_revision_changed'
      page: {
        gap: boolean
        conflict: boolean
      }
    }
  }
  | {
    outcome: 'retry_required'
    sensitiveOperationsAllowed: false
  }

export type IdentityLifecyclePullCycleResult =
  | (IdentityLifecyclePullCyclePrimaryResult & {
    leaseRelease: IdentityLifecycleLeaseReleaseStatus
  })
  | {
    outcome: 'lease_busy'
  }

export class IdentityLifecyclePullCycleFailure extends Error {
  constructor(
    cause: unknown,
    readonly leaseRelease: IdentityLifecycleLeaseReleaseStatus,
  ) {
    super(PULL_CYCLE_FAILURE_MESSAGE, { cause })
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullCycleFailure',
      configurable: true,
    })
  }
}

export async function runIdentityLifecyclePullCycle(
  input: IdentityLifecyclePullCycleInput,
): Promise<IdentityLifecyclePullCycleResult> {
  const lease = await input.store.claimPullLease({
    workerId: input.workerId,
    leaseDurationMs: input.leaseDurationMs,
  })
  if (!lease) return { outcome: 'lease_busy' }

  let primary:
    | { kind: 'result'; result: IdentityLifecyclePullCyclePrimaryResult }
    | { kind: 'failure'; cause: unknown }
  try {
    primary = { kind: 'result', result: await executeClaimedPullCycle(input, lease) }
  } catch (cause) {
    primary = { kind: 'failure', cause }
  }
  const leaseRelease = await releaseClaimedLease(input, lease)
  if (primary.kind === 'failure') {
    throw new IdentityLifecyclePullCycleFailure(primary.cause, leaseRelease)
  }
  return { ...primary.result, leaseRelease }
}

async function executeClaimedPullCycle(
  input: IdentityLifecyclePullCycleInput,
  lease: { claimToken: string; claimedBy: string },
): Promise<IdentityLifecyclePullCyclePrimaryResult> {
  const snapshot = await input.store.read()
  if (snapshot
    && snapshot.configuration.approvedRevision !== input.approvedConfigRevision) {
    throw new Error('Identity lifecycle approved config revision does not match durable state')
  }
  const cursor = snapshot?.cursor ?? null
  const verificationTime = readVerificationTime(input.clock)
  let page: VerifiedIdentityLifecyclePage
  try {
    page = await input.transport.pullVerifiedPage({ cursor, verificationTime })
  } catch {
    return { outcome: 'retry_required', sensitiveOperationsAllowed: false }
  }

  const commit = buildIdentityLifecyclePageCommit(
    snapshot,
    page,
    input.approvedConfigRevision,
  )
  const health = classifyCommittedPageHealth(commit)
  await input.store.commitPageUnderLease(commit, {
    claimToken: lease.claimToken,
    claimedBy: lease.claimedBy,
  })
  return { outcome: 'committed', cursor: commit.nextCursor, health }
}

async function releaseClaimedLease(
  input: IdentityLifecyclePullCycleInput,
  lease: { claimToken: string; claimedBy: string },
): Promise<IdentityLifecycleLeaseReleaseStatus> {
  try {
    return await input.store.releasePullLease({
      claimToken: lease.claimToken,
      claimedBy: lease.claimedBy,
    }) ? 'confirmed' : 'not_confirmed'
  } catch {
    return 'unknown'
  }
}

function readVerificationTime(clock: IdentityLifecyclePullCycleClock): Date {
  try {
    const value = clock.now()
    if (!(value instanceof Date)) throw new Error('invalid clock value')
    const milliseconds = Date.prototype.getTime.call(value)
    if (!Number.isFinite(milliseconds)) throw new Error('invalid clock value')
    return new Date(milliseconds)
  } catch {
    throw new Error('Identity lifecycle pull-cycle clock is invalid')
  }
}

function classifyCommittedPageHealth(
  commit: IdentityLifecyclePageCommit,
): {
  configuration: 'ready' | 'config_revision_changed'
  page: {
    gap: boolean
    conflict: boolean
  }
} {
  const statuses = commit.projections.map((projection) => projection.health.status)
  return {
    configuration: commit.configuration.health.status,
    page: {
      gap: statuses.includes('gap'),
      conflict: statuses.includes('conflict'),
    },
  }
}
