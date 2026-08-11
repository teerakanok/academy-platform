import { describe, expect, it } from 'vitest'
import {
  verifyIdentityCodeExchangeResult,
  type IdentityCodeExchangeResultExpectations,
} from '@/lib/identity/code-exchange-result'

const expectations: IdentityCodeExchangeResultExpectations = {
  audience: 'academy-api',
  expectedIssuer: 'https://accounts.cyberskills.co.th/auth/v1',
  nonce: 'nonce_from_server_transaction',
  serviceId: 'academy',
}

function validResult() {
  return {
    issuer: expectations.expectedIssuer,
    subject: 'principal-123',
    verifiedEmail: 'learner@example.test',
    audience: expectations.audience,
    serviceId: expectations.serviceId,
    nonce: expectations.nonce,
    activation: {
      status: 'active',
      revision: 4,
    },
  }
}

describe('identity code-exchange result verifier', () => {
  it('returns a fresh exact projection for a contract-valid result', () => {
    const input = validResult()
    const verified = verifyIdentityCodeExchangeResult(input, expectations)

    expect(verified).toEqual({ ok: true, result: input })
    if (!verified.ok) throw new Error('expected a verified result')
    expect(verified.result).not.toBe(input)
    expect(verified.result.activation).not.toBe(input.activation)

    input.subject = 'mutated-after-verification'
    input.activation.revision = 99
    expect(verified.result.subject).toBe('principal-123')
    expect(verified.result.activation.revision).toBe(4)
  })

  it.each([
    ['audience', { audience: 'another-api' }],
    ['service', { serviceId: 'another-service' }],
  ])('classifies a mismatched %s as audience_mismatch', (_label, patch) => {
    expect(verifyIdentityCodeExchangeResult({ ...validResult(), ...patch }, expectations)).toEqual({
      ok: false,
      reason: 'audience_mismatch',
    })
  })

  it.each([
    ['nonce mismatch', { nonce: 'another_nonce' }],
    ['wrong issuer', { issuer: 'https://foreign-issuer.example/auth/v1' }],
    ['non-string audience', { audience: 42 }],
    ['empty service ID', { serviceId: '' }],
    ['empty issuer', { issuer: '' }],
    ['empty subject', { subject: '' }],
    ['invalid verified email', { verifiedEmail: 'not-an-email' }],
    ['unknown activation status', { activation: { status: 'approved', revision: 4 } }],
    ['zero activation revision', { activation: { status: 'active', revision: 0 } }],
    ['fractional activation revision', { activation: { status: 'active', revision: 1.5 } }],
  ])('rejects %s as invalid_result', (_label, patch) => {
    expect(verifyIdentityCodeExchangeResult({ ...validResult(), ...patch }, expectations)).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
  })

  it.each([
    ['surplus key', () => ({ ...validResult(), entitlement: 'admin' })],
    ['symbol key', () => Object.assign(validResult(), { [Symbol('hidden')]: true })],
    ['non-enumerable key', () => Object.defineProperty(validResult(), 'hidden', { value: true })],
    ['array value', () => []],
    ['null value', () => null],
  ])('rejects a result with a %s', (_label, build) => {
    expect(verifyIdentityCodeExchangeResult(build(), expectations)).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
  })

  it('rejects accessors without invoking them', () => {
    let getterCalls = 0
    const input = validResult()
    Object.defineProperty(input, 'subject', {
      enumerable: true,
      get() {
        getterCalls += 1
        throw new Error('credential=TOP_SECRET')
      },
    })

    expect(verifyIdentityCodeExchangeResult(input, expectations)).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
    expect(getterCalls).toBe(0)
  })

  it('snapshots every result property once without ordinary property reads', () => {
    const input = validResult()
    const descriptorReads = new Map<PropertyKey, number>()
    let ownKeyReads = 0
    let prototypeReads = 0
    let ordinaryReads = 0
    const value = new Proxy(input, {
      get() {
        ordinaryReads += 1
        throw new Error('ordinary property reads are forbidden')
      },
      getOwnPropertyDescriptor(target, key) {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      getPrototypeOf(target) {
        prototypeReads += 1
        return Reflect.getPrototypeOf(target)
      },
      ownKeys(target) {
        ownKeyReads += 1
        return Reflect.ownKeys(target)
      },
    })

    expect(verifyIdentityCodeExchangeResult(value, expectations)).toMatchObject({ ok: true })
    expect(ordinaryReads).toBe(0)
    expect(ownKeyReads).toBe(1)
    expect(prototypeReads).toBe(1)
    expect([...descriptorReads.values()]).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('collapses hostile reflection failures to the fixed invalid_result classification', () => {
    const value = new Proxy(validResult(), {
      ownKeys() {
        throw new Error('credential=TOP_SECRET')
      },
    })

    expect(() => verifyIdentityCodeExchangeResult(value, expectations)).not.toThrow()
    expect(verifyIdentityCodeExchangeResult(value, expectations)).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
  })

  it('requires exact data-only expectation keys before inspecting the result', () => {
    let resultReads = 0
    const result = new Proxy(validResult(), {
      ownKeys(target) {
        resultReads += 1
        return Reflect.ownKeys(target)
      },
    })
    const invalidExpectations = Object.defineProperty({ ...expectations }, 'nonce', {
      enumerable: true,
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })

    expect(verifyIdentityCodeExchangeResult(result, invalidExpectations)).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
    expect(resultReads).toBe(0)
  })

  it.each([
    ['surplus key', { ...expectations, issuer: 'https://unexpected.example' }],
    ['non-string audience', { ...expectations, audience: 42 }],
    ['empty expected issuer', { ...expectations, expectedIssuer: '' }],
    ['empty service ID', { ...expectations, serviceId: '' }],
  ])('rejects expectations with a %s before inspecting the result', (_label, invalidExpectations) => {
    let resultReads = 0
    const result = new Proxy(validResult(), {
      ownKeys(target) {
        resultReads += 1
        return Reflect.ownKeys(target)
      },
    })

    expect(verifyIdentityCodeExchangeResult(
      result,
      invalidExpectations as IdentityCodeExchangeResultExpectations,
    )).toEqual({ ok: false, reason: 'invalid_result' })
    expect(resultReads).toBe(0)
  })
})
