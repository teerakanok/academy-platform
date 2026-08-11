import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from '@/lib/identity/consumer-policy'
import {
  projectIdentityCodeExchangeRuntimeConfig,
  type IdentityCodeExchangeRuntimeConfigInput,
} from '@/lib/identity/code-exchange-runtime-config'

const ENDPOINT = 'https://accounts.example.test/v1/code/exchange'
const READY_INPUT: IdentityCodeExchangeRuntimeConfigInput = {
  enabled: true,
  releaseApproval: true,
  endpoint: ENDPOINT,
  clientAssertionAudience: ENDPOINT,
  timeoutMs: 1_000,
}

describe('Academy Identity code exchange runtime configuration projection', () => {
  it('admits one fresh exact projection only when both gates and scalar config are valid', () => {
    const input = { ...READY_INPUT }

    const projected = projectIdentityCodeExchangeRuntimeConfig(input)

    expect(projected).toEqual({
      status: 'admitted',
      endpoint: ENDPOINT,
      clientAssertionAudience: ENDPOINT,
      timeoutMs: 1_000,
    })
    expect(projected).not.toBe(input)
    expect(Reflect.ownKeys(projected!)).toEqual([
      'status',
      'endpoint',
      'clientAssertionAudience',
      'timeoutMs',
    ])
  })

  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])('withholds usable values when enabled=%s and releaseApproval=%s', (
    enabled,
    releaseApproval,
  ) => {
    const projected = projectIdentityCodeExchangeRuntimeConfig({
      ...READY_INPUT,
      enabled,
      releaseApproval,
    })

    expect(projected).toEqual({
      status: 'blocked',
      enabled,
      releaseApproval,
      configuration: 'valid',
    })
    expect(Reflect.ownKeys(projected!)).toEqual([
      'status',
      'enabled',
      'releaseApproval',
      'configuration',
    ])
  })

  it('accepts the exact unconfigured disabled state without inventing runtime values', () => {
    expect(projectIdentityCodeExchangeRuntimeConfig({
      enabled: false,
      releaseApproval: false,
      endpoint: null,
      clientAssertionAudience: null,
      timeoutMs: null,
    })).toEqual({
      status: 'blocked',
      enabled: false,
      releaseApproval: false,
      configuration: 'absent',
    })
  })

  it('projects the canonical disabled registry and release evidence as blocked', () => {
    const report = JSON.parse(readFileSync(new URL(
      '../../../reports/conformance/identity-control/academy-identity-control-conformance.json',
      import.meta.url,
    ), 'utf8')) as {
      registryState: { enabled: boolean }
      scope: { releaseApproval: boolean }
    }
    const endpoint = APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.accountCenter.codeExchangeAudience

    expect(projectIdentityCodeExchangeRuntimeConfig({
      enabled: report.registryState.enabled,
      releaseApproval: report.scope.releaseApproval,
      endpoint,
      clientAssertionAudience: endpoint,
      timeoutMs: 1_000,
    })).toEqual({
      status: 'blocked',
      enabled: false,
      releaseApproval: false,
      configuration: 'valid',
    })
  })

  it.each([
    ['non-boolean enabled gate', { ...READY_INPUT, enabled: 'true' }],
    ['non-boolean release gate', { ...READY_INPUT, releaseApproval: 1 }],
    ['partial null values', { ...READY_INPUT, endpoint: null }],
    ['endpoint and assertion audience mismatch', {
      ...READY_INPUT,
      clientAssertionAudience: 'https://other.example.test/v1/code/exchange',
    }],
    ['non-canonical endpoint path', {
      ...READY_INPUT,
      endpoint: 'https://accounts.example.test/v1/code/exchange/',
      clientAssertionAudience: 'https://accounts.example.test/v1/code/exchange/',
    }],
    ['empty query delimiter alias', {
      ...READY_INPUT,
      endpoint: `${ENDPOINT}?`,
      clientAssertionAudience: `${ENDPOINT}?`,
    }],
    ['empty fragment delimiter alias', {
      ...READY_INPUT,
      endpoint: `${ENDPOINT}#`,
      clientAssertionAudience: `${ENDPOINT}#`,
    }],
    ['insecure endpoint', {
      ...READY_INPUT,
      endpoint: 'http://accounts.example.test/v1/code/exchange',
      clientAssertionAudience: 'http://accounts.example.test/v1/code/exchange',
    }],
    ['zero timeout', { ...READY_INPUT, timeoutMs: 0 }],
    ['overbound timeout', { ...READY_INPUT, timeoutMs: 5_001 }],
    ['malformed config even while blocked', {
      ...READY_INPUT,
      enabled: false,
      releaseApproval: false,
      timeoutMs: 0,
    }],
    ['missing admitted config', {
      ...READY_INPUT,
      endpoint: null,
      clientAssertionAudience: null,
      timeoutMs: null,
    }],
  ])('rejects %s', (_label, input) => {
    expect(projectIdentityCodeExchangeRuntimeConfig(input)).toBeNull()
  })

  it.each([
    ['surplus key', { ...READY_INPUT, extra: true }],
    ['symbol key', Object.assign({ ...READY_INPUT }, { [Symbol('extra')]: true })],
    ['array', Object.assign([], READY_INPUT)],
    ['null prototype', Object.assign(Object.create(null), READY_INPUT)],
  ])('rejects an inexact %s input', (_label, input) => {
    expect(projectIdentityCodeExchangeRuntimeConfig(input)).toBeNull()
  })

  it('rejects accessor and non-enumerable fields without invoking the getter', () => {
    const getter = vi.fn(() => true)
    const accessor = { ...READY_INPUT }
    Object.defineProperty(accessor, 'enabled', { enumerable: true, get: getter })
    const hidden = { ...READY_INPUT }
    Object.defineProperty(hidden, 'releaseApproval', {
      enumerable: false,
      value: true,
    })

    expect(projectIdentityCodeExchangeRuntimeConfig(accessor)).toBeNull()
    expect(projectIdentityCodeExchangeRuntimeConfig(hidden)).toBeNull()
    expect(getter).not.toHaveBeenCalled()
  })

  it('reads exact descriptors once without ordinary property access', () => {
    const descriptorReads = new Map<PropertyKey, number>()
    const get = vi.fn(() => {
      throw new Error('credential=TOP_SECRET')
    })
    const input = new Proxy({ ...READY_INPUT }, {
      get,
      getOwnPropertyDescriptor(target, key) {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })

    expect(projectIdentityCodeExchangeRuntimeConfig(input)).toEqual({
      status: 'admitted',
      endpoint: ENDPOINT,
      clientAssertionAudience: ENDPOINT,
      timeoutMs: 1_000,
    })
    expect(get).not.toHaveBeenCalled()
    expect(Object.fromEntries(descriptorReads)).toEqual({
      enabled: 1,
      releaseApproval: 1,
      endpoint: 1,
      clientAssertionAudience: 1,
      timeoutMs: 1,
    })
  })

  it('keeps environment, registry, port construction and production values outside the module', () => {
    const source = readFileSync(new URL(
      '../../src/lib/identity/code-exchange-runtime-config.ts',
      import.meta.url,
    ), 'utf8')

    expect(source).not.toMatch(/process\.env|consumer-policy|registry|createIdentityCodeExchangePort/)
    expect(source).not.toContain('accounts.cyberskills.co.th')
  })
})
