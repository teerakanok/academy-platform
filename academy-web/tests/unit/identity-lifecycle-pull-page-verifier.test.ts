import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  verifyIdentityLifecyclePullPage,
  type IdentityLifecyclePullPageVerificationOptions,
} from '@/lib/identity/lifecycle-pull-page-verifier'

const MAX_CURSOR = '9223372036854775807'

const PRODUCER_VECTOR = {
  schema: 'identity-consumer-lifecycle-envelope-vector/v1',
  fixtureOnly: true,
  verification: {
    expectedIssuer: 'https://identity.example.test/',
    expectedAudience: 'https://consumer.example.test/auth/events',
    verificationTime: '2026-08-09T02:01:00.000Z',
    clockSkewSeconds: 30,
    maximumLifetimeSeconds: 180,
    key: {
      keyId: 'identity-events-conformance-v1',
      algorithm: 'ES256',
      publicJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'oWKIvOzecbm5Zwg3fVWCoYamzbO6Sdd97DAMX5qxwiU',
        y: 'c3R-MRMG7D3BUaVJE3Ap6gvxKvOgJG7itnZOx95ezKQ',
      },
    },
  },
  expectedEvent: {
    eventId: '00000000-0000-4000-8000-000000000501',
    kind: 'account.lifecycle.changed',
    issuer: 'https://accounts.example.test/auth/v1',
    subject: 'consumer-conformance-subject',
    state: 'disabled',
    revision: 2,
    occurredAt: '2026-08-09T01:59:00.000Z',
    reason: 'account_disabled',
  },
  envelope: [
    'eyJhbGciOiJFUzI1NiIsImtpZCI6ImlkZW50aXR5LWV2ZW50cy1jb25mb3JtYW5jZS12MSIsInR5cCI6ImlkZW50aXR5LWV2ZW50K2p3dCJ9',
    'eyJhdWQiOiJodHRwczovL2NvbnN1bWVyLmV4YW1wbGUudGVzdC9hdXRoL2V2ZW50cyIsImV2ZW50Ijp7ImV2ZW50SWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDA1MDEiLCJraW5kIjoiYWNjb3VudC5saWZlY3ljbGUuY2hhbmdlZCIsImlzc3VlciI6Imh0dHBzOi8vYWNjb3VudHMuZXhhbXBsZS50ZXN0L2F1dGgvdjEiLCJzdWJqZWN0IjoiY29uc3VtZXItY29uZm9ybWFuY2Utc3ViamVjdCIsInN0YXRlIjoiZGlzYWJsZWQiLCJyZXZpc2lvbiI6Miwib2NjdXJyZWRBdCI6IjIwMjYtMDgtMDlUMDE6NTk6MDAuMDAwWiIsInJlYXNvbiI6ImFjY291bnRfZGlzYWJsZWQifSwiZXhwIjoxNzg2MjQwOTIwLCJpYXQiOjE3ODYyNDA4MDAsImlzcyI6Imh0dHBzOi8vaWRlbnRpdHkuZXhhbXBsZS50ZXN0LyIsImp0aSI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDUwMSJ9',
    'Q0lBRfk_FsYr9zzdmPDuE4Q59IcbXt-8nAwb5NowqX_9tAuK5wgD9kZhgg6A40dQwUXAWY9rGV9XxjJsUpZsEQ',
  ].join('.'),
} as const

function options(
  overrides: Partial<IdentityLifecyclePullPageVerificationOptions> = {},
): IdentityLifecyclePullPageVerificationOptions {
  return {
    requestedCursor: null,
    requestedLimit: 100,
    verificationTime: new Date(PRODUCER_VECTOR.verification.verificationTime),
    envelopePolicy: {
      expectedIssuer: PRODUCER_VECTOR.verification.expectedIssuer,
      expectedAudience: PRODUCER_VECTOR.verification.expectedAudience,
      clockSkewSeconds: PRODUCER_VECTOR.verification.clockSkewSeconds,
      maximumLifetimeSeconds: PRODUCER_VECTOR.verification.maximumLifetimeSeconds,
      key: structuredClone(PRODUCER_VECTOR.verification.key),
    },
    ...overrides,
  }
}

function page(
  envelopes: unknown[],
  nextCursor: { sequence: unknown } | null,
  configRevision: unknown = 1,
): Record<string, unknown> {
  return { envelopes, nextCursor, configRevision }
}

function descriptorOnlyProxy<T extends object>(target: T, divergent?: Partial<T>) {
  const get = vi.fn((_: T, key: PropertyKey) => {
    if (divergent && typeof key === 'string' && key in divergent) {
      return divergent[key as keyof T]
    }
    throw new Error('input property get must not run')
  })
  return { value: new Proxy(target, { get }), get }
}

describe('Academy Identity lifecycle pull-page verifier', () => {
  it('accepts the exact producer envelope vector and projects a fresh verified page', async () => {
    expect(createHash('sha256').update(PRODUCER_VECTOR.envelope).digest('hex'))
      .toBe('8768d5258b9cfa2ae602ff24ddf273b37b48f26075bbeb2d5b6498c6d2b0b730')
    const input = page([PRODUCER_VECTOR.envelope], { sequence: '1' })

    const result = await verifyIdentityLifecyclePullPage(input, options())

    expect(result).toEqual({
      nextCursor: '1',
      configRevision: 1,
      events: [PRODUCER_VECTOR.expectedEvent],
    })
    expect(result?.events[0]).not.toBe(PRODUCER_VECTOR.expectedEvent)
    ;(input.nextCursor as { sequence: string }).sequence = '99'
    expect(result?.nextCursor).toBe('1')
  })

  it.each([
    ['initial empty', null, [], null],
    ['initial nonempty', null, [PRODUCER_VECTOR.envelope, PRODUCER_VECTOR.envelope], { sequence: '2' }],
    ['continued empty', '42', [], { sequence: '42' }],
    ['continued nonempty', '42', [PRODUCER_VECTOR.envelope], { sequence: '43' }],
  ] as const)('matches producer cursor parity for %s', async (_, requestedCursor, envelopes, nextCursor) => {
    const result = await verifyIdentityLifecyclePullPage(
      page([...envelopes], nextCursor),
      options({ requestedCursor, requestedLimit: 2 }),
    )

    expect(result?.nextCursor).toBe(nextCursor?.sequence ?? null)
    expect(result?.events).toHaveLength(envelopes.length)
  })

  it.each([
    [null, [], { sequence: '0' }, 100],
    [null, [PRODUCER_VECTOR.envelope], null, 100],
    ['42', [], null, 100],
    ['42', [PRODUCER_VECTOR.envelope], { sequence: '44' }, 100],
    [null, [PRODUCER_VECTOR.envelope, PRODUCER_VECTOR.envelope], { sequence: '2' }, 1],
    [MAX_CURSOR, [PRODUCER_VECTOR.envelope], { sequence: MAX_CURSOR }, 100],
  ] as const)('rejects producer cursor or request-limit relation violations %#', async (
    requestedCursor,
    envelopes,
    nextCursor,
    requestedLimit,
  ) => {
    await expect(verifyIdentityLifecyclePullPage(
      page([...envelopes], nextCursor),
      options({ requestedCursor, requestedLimit }),
    )).resolves.toBeNull()
  })

  it('captures exact page descriptors once without invoking a Proxy get trap', async () => {
    const input = descriptorOnlyProxy(
      page([PRODUCER_VECTOR.envelope], { sequence: '1' }),
      { configRevision: 0 },
    )

    await expect(verifyIdentityLifecyclePullPage(input.value, options()))
      .resolves.toMatchObject({ nextCursor: '1', configRevision: 1 })
    expect(input.get).not.toHaveBeenCalled()
  })

  it('rejects missing, extra, accessor, symbol, or non-enumerable page properties', async () => {
    const missing = { envelopes: [], nextCursor: null }
    const extra = { ...page([], null), extra: true }
    const accessor = page([], null)
    const getConfigRevision = vi.fn(() => 1)
    Object.defineProperty(accessor, 'configRevision', {
      get: getConfigRevision,
      enumerable: true,
    })
    const symbolic = page([], null)
    Object.defineProperty(symbolic, Symbol('extra'), { value: true, enumerable: true })
    const hidden = page([], null)
    Object.defineProperty(hidden, 'configRevision', { value: 1, enumerable: false })

    for (const input of [null, [], missing, extra, accessor, symbolic, hidden]) {
      await expect(verifyIdentityLifecyclePullPage(input, options())).resolves.toBeNull()
    }
    expect(getConfigRevision).not.toHaveBeenCalled()
  })

  it('requires a dense bounded plain envelope array with exact data indices', async () => {
    const sparse = new Array(1)
    const extra = [PRODUCER_VECTOR.envelope]
    Object.defineProperty(extra, 'extra', { value: true, enumerable: true })
    const symbolic = [PRODUCER_VECTOR.envelope]
    Object.defineProperty(symbolic, Symbol('extra'), { value: true, enumerable: true })
    const accessor: unknown[] = []
    const readEnvelope = vi.fn(() => PRODUCER_VECTOR.envelope)
    Object.defineProperty(accessor, '0', { get: readEnvelope, enumerable: true })
    const oversized = Array.from({ length: 101 }, () => PRODUCER_VECTOR.envelope)

    for (const envelopes of [sparse, extra, symbolic, accessor, oversized]) {
      await expect(verifyIdentityLifecyclePullPage(
        page(envelopes, envelopes.length === 0 ? null : { sequence: String(envelopes.length) }),
        options(),
      )).resolves.toBeNull()
    }
    expect(readEnvelope).not.toHaveBeenCalled()
  })

  it('rejects an overbound envelope array before invoking its ownKeys trap', async () => {
    const ownKeys = vi.fn((): (string | symbol)[] => {
      throw new Error('overbound array must stop before ownKeys')
    })
    const envelopes = new Proxy(
      Array.from({ length: 101 }, () => PRODUCER_VECTOR.envelope),
      { ownKeys },
    )

    await expect(verifyIdentityLifecyclePullPage(
      page(envelopes, { sequence: '101' }),
      options(),
    )).resolves.toBeNull()
    expect(ownKeys).not.toHaveBeenCalled()
  })

  it('rejects overbound JWK key operations before invoking their ownKeys trap', async () => {
    const ownKeys = vi.fn((): (string | symbol)[] => {
      throw new Error('overbound key_ops must stop before ownKeys')
    })
    const keyOps = new Proxy(['verify', 'sign'], { ownKeys })
    const base = options()

    await expect(verifyIdentityLifecyclePullPage(
      page([], null),
      options({
        envelopePolicy: {
          ...base.envelopePolicy,
          key: {
            ...base.envelopePolicy.key,
            publicJwk: {
              ...base.envelopePolicy.key.publicJwk,
              key_ops: keyOps,
            },
          },
        },
      }),
    )).resolves.toBeNull()
    expect(ownKeys).not.toHaveBeenCalled()
  })

  it.each([
    'a'.repeat(31),
    'a'.repeat(4097),
    'not-a-compact-jws',
    `${'a'.repeat(16)}.${'b'.repeat(16)}.bad+segment`,
  ])('rejects malformed or out-of-bounds compact JWS input %#', async (envelope) => {
    await expect(verifyIdentityLifecyclePullPage(
      page([envelope], { sequence: '1' }),
      options(),
    )).resolves.toBeNull()
  })

  it('requires an exact canonical next-cursor object and never invokes its get trap', async () => {
    const cursor = descriptorOnlyProxy({ sequence: '1' }, { sequence: '99' })
    await expect(verifyIdentityLifecyclePullPage(
      page([PRODUCER_VECTOR.envelope], cursor.value),
      options(),
    )).resolves.toMatchObject({ nextCursor: '1' })
    expect(cursor.get).not.toHaveBeenCalled()

    const accessor = {}
    const readSequence = vi.fn(() => '1')
    Object.defineProperty(accessor, 'sequence', { get: readSequence, enumerable: true })
    const symbolic = { sequence: '1' }
    Object.defineProperty(symbolic, Symbol('extra'), { value: true, enumerable: true })
    for (const nextCursor of [
      {},
      { sequence: '01' },
      { sequence: '-1' },
      { sequence: '9223372036854775808' },
      { sequence: '1', extra: true },
      accessor,
      symbolic,
    ]) {
      await expect(verifyIdentityLifecyclePullPage(
        page([PRODUCER_VECTOR.envelope], nextCursor as { sequence: unknown }),
        options(),
      )).resolves.toBeNull()
    }
    expect(readSequence).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    'rejects unsafe config revision %#',
    async (configRevision) => {
      await expect(verifyIdentityLifecyclePullPage(
        page([], null, configRevision),
        options(),
      )).resolves.toBeNull()
    },
  )

  it.each([
    { requestedCursor: '01' },
    { requestedCursor: '-1' },
    { requestedCursor: '9223372036854775808' },
    { requestedLimit: 0 },
    { requestedLimit: 101 },
    { requestedLimit: 1.5 },
    { verificationTime: new Date('invalid') },
  ])('rejects malformed request-bound verification input %#', async (override) => {
    await expect(verifyIdentityLifecyclePullPage(
      page([], null),
      options(override),
    )).resolves.toBeNull()
  })

  it('validates the verification time once and passes one native clone to every envelope', async () => {
    class HostileDate extends Date {
      readonly getTime = vi.fn(() => {
        throw new Error('overridden getTime must not run')
      })
    }
    const verificationTime = new HostileDate(PRODUCER_VECTOR.verification.verificationTime)
    const envelopePolicy = descriptorOnlyProxy(
      options().envelopePolicy,
      { expectedAudience: 'https://wrong.example.test/' },
    )

    const result = await verifyIdentityLifecyclePullPage(
      page(
        [PRODUCER_VECTOR.envelope, PRODUCER_VECTOR.envelope],
        { sequence: '2' },
      ),
      options({ requestedLimit: 2, verificationTime, envelopePolicy: envelopePolicy.value }),
    )

    expect(result?.events).toEqual([
      PRODUCER_VECTOR.expectedEvent,
      PRODUCER_VECTOR.expectedEvent,
    ])
    expect(result?.events[0]).not.toBe(result?.events[1])
    expect(verificationTime.getTime).not.toHaveBeenCalled()
    expect(envelopePolicy.get).not.toHaveBeenCalled()
  })

  it('rejects invalid policy even for an empty page and fails the whole page on one bad signature', async () => {
    const invalidPolicy = options({
      envelopePolicy: {
        ...options().envelopePolicy,
        expectedAudience: 'http://consumer.example.test/auth/events',
      },
    })
    const tampered = `${PRODUCER_VECTOR.envelope.slice(0, -1)}A`

    await expect(verifyIdentityLifecyclePullPage(page([], null), invalidPolicy))
      .resolves.toBeNull()
    await expect(verifyIdentityLifecyclePullPage(
      page([PRODUCER_VECTOR.envelope, tampered], { sequence: '2' }),
      options({ requestedLimit: 2 }),
    )).resolves.toBeNull()
  })

  it('remains disconnected from runtime entrypoints and imports only the local verification boundary', () => {
    const source = readFileSync(
      new URL('../../src/lib/identity/lifecycle-pull-page-verifier.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain("from './lifecycle-envelope-verifier'")
    expect(source).not.toMatch(/\bfetch\s*\(|\bResponse\b/)
    expect(source).not.toMatch(/\b(?:console|logger)\./)

    for (const path of [
      '../../worker.ts',
      '../../wrangler.jsonc',
      '../../open-next.config.ts',
      '../../src/middleware.ts',
      '../../src/lib/identity/registry.ts',
      '../../src/app/(site)/auth/callback/route.ts',
    ]) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8'))
        .not.toContain('lifecycle-pull-page-verifier')
    }
  })
})
