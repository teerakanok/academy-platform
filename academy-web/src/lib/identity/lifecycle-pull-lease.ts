export const IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS = 1_000
export const IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS = 5 * 60_000

const CLAIM_KEYS = ['leaseDurationMs', 'workerId'] as const
const RENEW_KEYS = ['claimToken', 'claimedBy', 'leaseDurationMs'] as const
const FENCE_KEYS = ['claimToken', 'claimedBy'] as const
const LEASE_KEYS = ['claimToken', 'claimedBy', 'leaseUntil'] as const
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/
const CLAIM_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type IdentityLifecyclePullLeaseClaimInput = {
  workerId: string
  leaseDurationMs: number
}

export type IdentityLifecyclePullLeaseRenewInput = {
  claimToken: string
  claimedBy: string
  leaseDurationMs: number
}

export type IdentityLifecyclePullLeaseReleaseInput = {
  claimToken: string
  claimedBy: string
}

export type IdentityLifecyclePullLeaseFence = IdentityLifecyclePullLeaseReleaseInput

export type IdentityLifecyclePullLease = {
  claimToken: string
  claimedBy: string
  leaseUntil: Date
}

export type IdentityLifecyclePullLeaseStore = {
  claimPullLease(
    input: IdentityLifecyclePullLeaseClaimInput,
  ): Promise<IdentityLifecyclePullLease | null>
  renewPullLease(
    input: IdentityLifecyclePullLeaseRenewInput,
  ): Promise<IdentityLifecyclePullLease | null>
  releasePullLease(input: IdentityLifecyclePullLeaseReleaseInput): Promise<boolean>
}

export function assertIdentityLifecyclePullLeaseClaimInput(
  value: unknown,
): asserts value is IdentityLifecyclePullLeaseClaimInput {
  parseIdentityLifecyclePullLeaseClaimInput(value)
}

export function parseIdentityLifecyclePullLeaseClaimInput(
  value: unknown,
): IdentityLifecyclePullLeaseClaimInput {
  const input = exactDataProperties(value, CLAIM_KEYS)
  if (!input) {
    throw new Error('Identity lifecycle pull lease input shape must use exact data properties')
  }
  assertWorkerId(input.workerId)
  assertLeaseDuration(input.leaseDurationMs)
  return { workerId: input.workerId, leaseDurationMs: input.leaseDurationMs }
}

export function assertIdentityLifecyclePullLeaseRenewInput(
  value: unknown,
): asserts value is IdentityLifecyclePullLeaseRenewInput {
  parseIdentityLifecyclePullLeaseRenewInput(value)
}

export function parseIdentityLifecyclePullLeaseRenewInput(
  value: unknown,
): IdentityLifecyclePullLeaseRenewInput {
  const input = exactDataProperties(value, RENEW_KEYS)
  if (!input) throw new Error('Identity lifecycle pull lease renew input shape is invalid')
  assertClaimToken(input.claimToken)
  assertWorkerId(input.claimedBy)
  assertLeaseDuration(input.leaseDurationMs)
  return {
    claimToken: input.claimToken,
    claimedBy: input.claimedBy,
    leaseDurationMs: input.leaseDurationMs,
  }
}

export function assertIdentityLifecyclePullLeaseReleaseInput(
  value: unknown,
): asserts value is IdentityLifecyclePullLeaseReleaseInput {
  parseIdentityLifecyclePullLeaseReleaseInput(value)
}

export function parseIdentityLifecyclePullLeaseReleaseInput(
  value: unknown,
): IdentityLifecyclePullLeaseReleaseInput {
  const input = exactDataProperties(value, FENCE_KEYS)
  if (!input) throw new Error('Identity lifecycle pull lease release input shape is invalid')
  assertClaimToken(input.claimToken)
  assertWorkerId(input.claimedBy)
  return { claimToken: input.claimToken, claimedBy: input.claimedBy }
}

export function assertIdentityLifecyclePullLeaseFence(
  value: unknown,
): asserts value is IdentityLifecyclePullLeaseFence {
  parseIdentityLifecyclePullLeaseFence(value)
}

export function parseIdentityLifecyclePullLeaseFence(
  value: unknown,
): IdentityLifecyclePullLeaseFence {
  const input = exactDataProperties(value, FENCE_KEYS)
  if (!input) throw new Error('Identity lifecycle pull lease fence shape is invalid')
  assertClaimToken(input.claimToken)
  assertWorkerId(input.claimedBy)
  return { claimToken: input.claimToken, claimedBy: input.claimedBy }
}

export function parseIdentityLifecyclePullLease(value: unknown): IdentityLifecyclePullLease {
  const lease = exactDataProperties(value, LEASE_KEYS)
  if (!lease) throw new Error('Identity lifecycle pull lease response is invalid')
  try {
    assertClaimToken(lease.claimToken)
    assertWorkerId(lease.claimedBy)
  } catch {
    throw new Error('Identity lifecycle pull lease response is invalid')
  }
  if (typeof lease.leaseUntil !== 'string') {
    throw new Error('Identity lifecycle pull lease response is invalid')
  }
  const leaseUntil = new Date(lease.leaseUntil)
  if (!Number.isFinite(leaseUntil.getTime()) || leaseUntil.toISOString() !== lease.leaseUntil) {
    throw new Error('Identity lifecycle pull lease response is invalid')
  }
  return {
    claimToken: lease.claimToken,
    claimedBy: lease.claimedBy,
    leaseUntil,
  }
}

function assertWorkerId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !WORKER_ID_PATTERN.test(value)) {
    throw new Error('Identity lifecycle pull lease worker ID is invalid')
  }
}

function assertClaimToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !CLAIM_TOKEN_PATTERN.test(value)) {
    throw new Error('Identity lifecycle pull lease claim token is invalid')
  }
}

function assertLeaseDuration(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value)
    || (value as number) < IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS
    || (value as number) > IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS) {
    throw new Error('Identity lifecycle pull lease duration is invalid')
  }
}

function exactDataProperties<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
): Record<Keys[number], unknown> | null {
  try {
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
  } catch {
    return null
  }
}
