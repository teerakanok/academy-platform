import { describe, expect, it } from 'vitest'
import {
  IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
  IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
  assertIdentityLifecyclePullLeaseClaimInput,
  assertIdentityLifecyclePullLeaseFence,
  assertIdentityLifecyclePullLeaseReleaseInput,
  assertIdentityLifecyclePullLeaseRenewInput,
  parseIdentityLifecyclePullLease,
} from '@/lib/identity/lifecycle-pull-lease'

const CLAIM_TOKEN = 'abcdefab-cdef-4abc-8def-abcdefabcdef'

describe('Academy Identity lifecycle pull lease contract', () => {
  it('accepts only the exact database-backed lease duration boundaries', () => {
    expect(() => assertIdentityLifecyclePullLeaseClaimInput({
      workerId: 'academy-worker/a',
      leaseDurationMs: IDENTITY_LIFECYCLE_PULL_LEASE_MIN_DURATION_MS,
    })).not.toThrow()
    expect(() => assertIdentityLifecyclePullLeaseClaimInput({
      workerId: `a${'b'.repeat(159)}`,
      leaseDurationMs: IDENTITY_LIFECYCLE_PULL_LEASE_MAX_DURATION_MS,
    })).not.toThrow()

    for (const leaseDurationMs of [999, 300_001, 1_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertIdentityLifecyclePullLeaseClaimInput({
        workerId: 'academy-worker/a', leaseDurationMs,
      })).toThrow(/duration/)
    }
  })

  it('rejects malformed worker IDs, extra keys, accessors, and non-plain inputs', () => {
    for (const workerId of [
      '',
      '-worker',
      `a${'b'.repeat(160)}`,
      'worker space',
      'worker\0id',
      'worker-a\n',
      'worker-a\r\n',
      'worker-a\u2028',
    ]) {
      expect(() => assertIdentityLifecyclePullLeaseClaimInput({
        workerId, leaseDurationMs: 1_000,
      })).toThrow(/worker/)
    }
    expect(() => assertIdentityLifecyclePullLeaseClaimInput({
      workerId: 'worker-a', leaseDurationMs: 1_000, extra: true,
    } as never)).toThrow(/shape/)
    expect(() => assertIdentityLifecyclePullLeaseClaimInput(['worker-a', 1_000] as never))
      .toThrow(/input/)

    let getterCalls = 0
    const accessor = Object.defineProperties({}, {
      workerId: {
        enumerable: true,
        get() {
          getterCalls += 1
          return 'worker-a'
        },
      },
      leaseDurationMs: { enumerable: true, value: 1_000 },
    })
    expect(() => assertIdentityLifecyclePullLeaseClaimInput(accessor as never)).toThrow(/data properties/)
    expect(getterCalls).toBe(0)
  })

  it('requires a canonical random-token fence for renew, release, and commit', () => {
    expect(() => assertIdentityLifecyclePullLeaseRenewInput({
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
      leaseDurationMs: 60_000,
    })).not.toThrow()
    expect(() => assertIdentityLifecyclePullLeaseReleaseInput({
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
    })).not.toThrow()
    expect(() => assertIdentityLifecyclePullLeaseFence({
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
    })).not.toThrow()

    for (const claimToken of [
      CLAIM_TOKEN.toUpperCase(),
      '00000000-0000-1000-8000-000000000001',
      '00000000-0000-4000-7000-000000000001',
      'not-a-token',
      `${CLAIM_TOKEN}\n`,
    ]) {
      expect(() => assertIdentityLifecyclePullLeaseReleaseInput({
        claimToken, claimedBy: 'worker-a',
      })).toThrow(/token/)
    }
  })

  it('strictly parses and detaches the database lease response', () => {
    const response = {
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
      leaseUntil: '2026-08-10T05:06:07.890Z',
    }
    const parsed = parseIdentityLifecyclePullLease(response)
    expect(parsed).toEqual({
      claimToken: CLAIM_TOKEN,
      claimedBy: 'worker-a',
      leaseUntil: new Date('2026-08-10T05:06:07.890Z'),
    })
    expect(parsed.leaseUntil).not.toBe(response.leaseUntil)

    for (const malformed of [
      { ...response, extra: true },
      { ...response, claimToken: 'not-a-token' },
      { ...response, claimedBy: '-worker' },
      { ...response, leaseUntil: 'not-a-time' },
      { ...response, leaseUntil: new Date(response.leaseUntil) },
    ]) {
      expect(() => parseIdentityLifecyclePullLease(malformed)).toThrow(/lease/)
    }
  })
})
