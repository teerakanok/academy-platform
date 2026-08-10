import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityClientAssertionJtiSource,
  IdentityClientAssertionJtiSourceFailure,
} from '@/lib/identity/client-assertion-jti-source'
import { createIdentityClientAssertionProvider } from '@/lib/identity/client-assertion-provider'

const CLIENT_ID = 'academy-web'
const AUDIENCE = 'https://identity-control.example/v1/lifecycle/events/pull'
const KEY_ID = 'academy-lifecycle-2026-08'
const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Academy Identity client-assertion JTI source', () => {
  it('does not expose a production entropy override', () => {
    expect(createIdentityClientAssertionJtiSource).toHaveLength(0)
  })

  it('uses the Web Crypto default to create canonical distinct UUID v4 values', () => {
    const source = createIdentityClientAssertionJtiSource()
    const values = Array.from({ length: 32 }, () => source.next())

    expect(values.every((value) => UUID_V4_PATTERN.test(value))).toBe(true)
    expect(new Set(values).size).toBe(values.length)
  })

  it('captures the injected method once and preserves its receiver', () => {
    const reads = new Map<PropertyKey, number>()
    const target = {
      marker: 'random-uuid-source',
      randomUUID: vi.fn(function (this: { marker: string }) {
        expect(this.marker).toBe('random-uuid-source')
        return UUID
      }),
    }
    const input = new Proxy(target, {
      get(value, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return Reflect.get(value, key, receiver)
      },
    })
    vi.stubGlobal('crypto', input)
    const source = createIdentityClientAssertionJtiSource()
    target.randomUUID = vi.fn(() => {
      throw new Error('captured method must not be replaced')
    })

    expect(source.next()).toBe(UUID)
    expect(reads.get('randomUUID')).toBe(1)
  })

  it.each([
    ['non-string', 123],
    ['uppercase', UUID.toUpperCase()],
    ['wrong version', '550e8400-e29b-11d4-a716-446655440000'],
    ['wrong variant', '550e8400-e29b-41d4-7716-446655440000'],
    ['missing separators', '550e8400e29b41d4a716446655440000'],
  ])('rejects %s output without coercion', (_label, value) => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => value),
    })
    const source = createIdentityClientAssertionJtiSource()

    expectFixedFailure(() => source.next())
  })

  it('collapses source configuration and runtime detail to one fixed failure', () => {
    vi.stubGlobal('crypto', null)
    expectFixedFailure(() => createIdentityClientAssertionJtiSource())
    vi.stubGlobal('crypto', Object.defineProperty({}, 'randomUUID', {
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    }))
    expectFixedFailure(() => createIdentityClientAssertionJtiSource())
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => {
        throw new Error('credential=TOP_SECRET')
      }),
    })
    const source = createIdentityClientAssertionJtiSource()

    expectFixedFailure(() => source.next())
  })

  it('feeds the exact fresh JTI into the real assertion provider', async () => {
    const randomUUID = vi.fn(() => UUID)
    vi.stubGlobal('crypto', { randomUUID })
    const jtiSource = createIdentityClientAssertionJtiSource()
    const provider = createIdentityClientAssertionProvider({
      clientId: CLIENT_ID,
      purpose: 'lifecycle_pull',
      audience: AUDIENCE,
      keyId: KEY_ID,
      lifetimeSeconds: 60,
      clock: { now: vi.fn(() => new Date(1_786_000_000_000)) },
      jtiSource,
      signer: {
        clientId: CLIENT_ID,
        purpose: 'lifecycle_pull',
        keyId: KEY_ID,
        sign: vi.fn(async () => new Uint8Array(64)),
      },
    })

    const assertion = await provider.createClientAssertion({
      consumerId: CLIENT_ID,
      audience: AUDIENCE,
    })
    const [, encodedClaims] = assertion.split('.') as [string, string, string]
    const claims = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(Buffer.from(encodedClaims, 'base64url'))),
    ) as Record<string, unknown>
    expect(claims.jti).toBe(UUID)
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('contains no weak randomness, secret loading, network, logging, or runtime wiring', async () => {
    const source = await readFile(
      new URL('../../src/lib/identity/client-assertion-jti-source.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/Math\.random|process\.env|fetch\(|console\.|wrangler|scheduled/i)
  })
})

function expectFixedFailure(operation: () => unknown): void {
  let failure: unknown
  try {
    operation()
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(IdentityClientAssertionJtiSourceFailure)
  expect(failure).toMatchObject({
    name: 'IdentityClientAssertionJtiSourceFailure',
    message: 'Identity client assertion JTI source failed',
  })
  expect(String(failure)).toBe(
    'IdentityClientAssertionJtiSourceFailure: Identity client assertion JTI source failed',
  )
  expect((failure as Error).stack).not.toContain('TOP_SECRET')
  expect(Object.keys(failure as object)).toEqual([])
  expect(JSON.stringify(failure)).toBe('{}')
}
