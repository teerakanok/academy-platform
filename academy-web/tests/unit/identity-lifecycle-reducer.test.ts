import { describe, expect, it } from 'vitest'
import {
  reduceIdentityLifecycleProjection,
  type IdentityLifecycleProjection,
} from '@/lib/identity/lifecycle-reducer'
import type { IdentityLifecycleEvent } from '@/lib/identity/lifecycle-envelope-verifier'

const BASE_EVENT: IdentityLifecycleEvent = {
  eventId: '00000000-0000-4000-8000-000000000501',
  kind: 'account.lifecycle.changed',
  issuer: 'https://accounts.example.test/auth/v1',
  subject: 'consumer-conformance-subject',
  state: 'disabled',
  revision: 2,
  occurredAt: '2026-08-09T01:59:00.000Z',
  reason: 'account_disabled',
}

function event(overrides: Partial<IdentityLifecycleEvent> = {}): IdentityLifecycleEvent {
  return { ...BASE_EVENT, ...overrides }
}

function projection(overrides: Partial<IdentityLifecycleProjection> = {}): IdentityLifecycleProjection {
  return {
    issuer: BASE_EVENT.issuer,
    subject: BASE_EVENT.subject,
    state: 'active',
    revision: 1,
    ...overrides,
  }
}

function withoutOwnKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value }
  delete copy[key]
  return copy
}

function adversarialGetProxy<T extends object>(
  target: T,
  mode: 'throw' | 'diverge',
): {
  value: T
  getCalls: () => number
  descriptorCalls: (key: PropertyKey) => number
} {
  let reads = 0
  const descriptors = new Map<PropertyKey, number>()
  return {
    value: new Proxy(target, {
      get(current, key, receiver) {
        reads += 1
        if (mode === 'throw') throw new Error('untrusted get trap')
        if (key === 'issuer') return 'https://attacker.example.test/auth/v1'
        if (key === 'state') return 'deleted'
        if (key === 'revision') return 9
        return Reflect.get(current, key, receiver)
      },
      getOwnPropertyDescriptor(current, key) {
        descriptors.set(key, (descriptors.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(current, key)
      },
    }),
    getCalls: () => reads,
    descriptorCalls: (key) => descriptors.get(key) ?? 0,
  }
}

describe('identity.lifecycle-projection-reducer', () => {
  it('accepts a first valid seed and a contiguous revision', () => {
    expect(reduceIdentityLifecycleProjection(null, event({ revision: 5 }))).toEqual({
      disposition: 'applied',
      projection: {
        issuer: BASE_EVENT.issuer,
        subject: BASE_EVENT.subject,
        state: 'disabled',
        revision: 5,
      },
    })

    expect(reduceIdentityLifecycleProjection(projection(), event())).toEqual({
      disposition: 'applied',
      projection: {
        issuer: BASE_EVENT.issuer,
        subject: BASE_EVENT.subject,
        state: 'disabled',
        revision: 2,
      },
    })
  })

  it('returns an immutable clone for an applied projection', () => {
    const current = Object.freeze(projection())
    const incoming = Object.freeze(event())
    const result = reduceIdentityLifecycleProjection(current, incoming)

    expect(result.projection).toEqual({
      issuer: BASE_EVENT.issuer,
      subject: BASE_EVENT.subject,
      state: 'disabled',
      revision: 2,
    })
    expect(result.projection).not.toBe(current)
    expect(current).toEqual(projection())
    expect(incoming).toEqual(BASE_EVENT)
  })

  it.each([
    ['duplicate', projection(), event({ state: 'active', revision: 1, reason: 'account_active' })],
    ['stale', projection({ state: 'disabled', revision: 3 }), event({ revision: 2 })],
    ['gap', projection(), event({ revision: 3 })],
    ['conflict', projection(), event({ state: 'disabled', revision: 1 })],
  ] as const)('returns %s without changing the current projection', (disposition, current, incoming) => {
    const original = structuredClone(current)
    const result = reduceIdentityLifecycleProjection(current, incoming)

    expect(result).toEqual({ disposition, projection: current })
    expect(result.projection).not.toBe(current)
    expect(current).toEqual(original)
  })

  it.each([
    event({ issuer: 'https://other.example.test/auth/v1' }),
    event({ subject: 'another-principal' }),
  ])('fails closed when an event crosses the current principal scope', (incoming) => {
    const current = projection()
    const result = reduceIdentityLifecycleProjection(current, incoming)

    expect(result).toEqual({ disposition: 'conflict', projection: current })
    expect(result.projection).not.toBe(current)
  })

  it.each([
    { ...BASE_EVENT, extra: true },
    withoutOwnKey(BASE_EVENT, 'reason'),
    { ...BASE_EVENT, kind: 'service.activation.changed' },
    { ...BASE_EVENT, eventId: 'not-a-uuid' },
    { ...BASE_EVENT, issuer: 'http://accounts.example.test/auth/v1' },
    { ...BASE_EVENT, issuer: 'https://a.1/' },
    { ...BASE_EVENT, issuer: 'https://xn--a.example/' },
    { ...BASE_EVENT, issuer: 'https://identity-control.example.test/' },
    { ...BASE_EVENT, subject: '' },
    { ...BASE_EVENT, subject: '\ud800' },
    { ...BASE_EVENT, subject: '\udc00' },
    { ...BASE_EVENT, state: 'suspended' },
    { ...BASE_EVENT, revision: 1.5 },
    { ...BASE_EVENT, occurredAt: '2026-08-09T01:59:00Z' },
    { ...BASE_EVENT, reason: 'internal_operator_reason' },
  ])('rejects an event outside the exact published schema', (incoming) => {
    const current = projection()
    expect(reduceIdentityLifecycleProjection(current, incoming)).toEqual({
      disposition: 'conflict',
      projection: current,
    })
  })

  it('rejects extra, missing, accessor, or symbol projection keys', () => {
    const withAccessor = projection() as IdentityLifecycleProjection & { injected?: string }
    Object.defineProperty(withAccessor, 'injected', { get: () => 'value' })
    const withSymbol = projection() as IdentityLifecycleProjection & { [key: symbol]: string }
    withSymbol[Symbol('injected')] = 'value'

    for (const current of [
      { ...projection(), extra: true },
      withoutOwnKey(projection(), 'subject'),
      withAccessor,
      withSymbol,
    ]) {
      expect(reduceIdentityLifecycleProjection(current, event())).toEqual({
        disposition: 'conflict',
        projection: null,
      })
    }
  })

  it('returns only the exact result and projection keys', () => {
    const result = reduceIdentityLifecycleProjection(null, event())

    expect(Reflect.ownKeys(result)).toEqual(['disposition', 'projection'])
    expect(Reflect.ownKeys(result.projection!)).toEqual(['issuer', 'subject', 'state', 'revision'])
  })

  it('fails closed when an input object throws during inspection', () => {
    const current = projection()
    const throwingEvent = new Proxy(BASE_EVENT, {
      ownKeys: () => {
        throw new Error('untrusted proxy')
      },
    })

    const result = reduceIdentityLifecycleProjection(current, throwingEvent)
    expect(result).toEqual({ disposition: 'conflict', projection: current })
    expect(result.projection).not.toBe(current)
  })

  it.each(['throw', 'diverge'] as const)(
    'captures event descriptor values without invoking a %s get trap',
    (mode) => {
      const target = event()
      const incoming = adversarialGetProxy(target, mode)

      const result = reduceIdentityLifecycleProjection(null, incoming.value)

      expect(incoming.getCalls()).toBe(0)
      for (const key of Reflect.ownKeys(target)) expect(incoming.descriptorCalls(key)).toBe(1)
      expect(result).toEqual({
        disposition: 'applied',
        projection: {
          issuer: BASE_EVENT.issuer,
          subject: BASE_EVENT.subject,
          state: 'disabled',
          revision: 2,
        },
      })
    },
  )

  it.each(['throw', 'diverge'] as const)(
    'captures current descriptor values without invoking a %s get trap',
    (mode) => {
      const target = projection()
      const current = adversarialGetProxy(target, mode)

      const result = reduceIdentityLifecycleProjection(current.value, event())

      expect(current.getCalls()).toBe(0)
      for (const key of Reflect.ownKeys(target)) expect(current.descriptorCalls(key)).toBe(1)
      expect(result).toEqual({
        disposition: 'applied',
        projection: {
          issuer: BASE_EVENT.issuer,
          subject: BASE_EVENT.subject,
          state: 'disabled',
          revision: 2,
        },
      })
    },
  )
})
