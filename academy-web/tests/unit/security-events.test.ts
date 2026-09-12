import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configureAcademySecurityEventLogger,
  emitAcademySecurityEvent,
  getAcademySecurityEventBudgetForTests,
  resetAcademySecurityEventBudgetForTests,
  type AcademySecurityEventInput,
} from '@/lib/security/security-events'

const validEvent = {
  event: 'durable_session_validation',
  outcome: 'success',
  reason: 'validated',
} as const

describe('Academy security events', () => {
  let lines: string[]
  let restoreLogger: () => void

  beforeEach(() => {
    resetAcademySecurityEventBudgetForTests()
    lines = []
    const previousLogger = configureAcademySecurityEventLogger(line => lines.push(line))
    restoreLogger = () => configureAcademySecurityEventLogger(previousLogger)
  })

  afterEach(() => {
    restoreLogger()
    resetAcademySecurityEventBudgetForTests()
  })

  it('emits only the fixed schema with UTC time', () => {
    expect(emitAcademySecurityEvent(validEvent)).toBe(true)

    expect(lines).toHaveLength(1)
    expect(Object.keys(JSON.parse(lines[0]))).toEqual([
      'schema_version',
      'event',
      'category',
      'outcome',
      'reason',
      'time',
    ])
    expect(JSON.parse(lines[0])).toMatchObject({
      schema_version: 1,
      event: 'durable_session_validation',
      category: 'authentication',
      outcome: 'success',
      reason: 'validated',
    })
    expect((JSON.parse(lines[0]) as { time: string }).time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it.each([
    ['extra key', { ...validEvent, raw_error: 'token=SENTINEL' }],
    ['wrong event', { ...validEvent, event: 'caller/event?x=1' }],
    ['wrong category key', { ...validEvent, category: 'caller' }],
    ['wrong reason', { ...validEvent, reason: '/admin?session=SENTINEL' }],
    ['class prototype', Object.assign(Object.create(null), validEvent, { extra: 'x' })],
    ['throwing getter', {
      ...validEvent,
      get reason() {
        throw new Error('cookie=SENTINEL')
      },
    }],
  ])('does not admit a hostile payload with %s', (_label, input) => {
    expect(emitAcademySecurityEvent(input as AcademySecurityEventInput)).toBe(false)

    expect(lines).toHaveLength(1)
    const summary = JSON.parse(lines[0]) as Record<string, unknown>
    expect(summary).toMatchObject({
      event: 'security_event_budget',
      category: 'security_logging',
      outcome: 'dropped',
      reason: 'per_isolate_limit',
      dropped_count: 1,
    })
    expect(JSON.stringify(summary)).not.toContain('SENTINEL')
    expect(JSON.stringify(summary)).not.toContain('caller')
  })

  it('caps per-isolate output, aggregates the first drop, and resets cleanly', () => {
    for (let index = 0; index < 300; index += 1) {
      emitAcademySecurityEvent(validEvent)
    }

    expect(lines).toHaveLength(256)
    expect(getAcademySecurityEventBudgetForTests()).toMatchObject({
      emittedCount: 256,
      droppedCount: 45,
      loggerLimit: 256,
    })
    const summary = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>
    expect(summary).toMatchObject({
      event: 'security_event_budget',
      outcome: 'dropped',
      reason: 'per_isolate_limit',
      dropped_count: 1,
    })

    resetAcademySecurityEventBudgetForTests()
    lines.length = 0
    expect(emitAcademySecurityEvent(validEvent)).toBe(true)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject(validEvent)
  })

  it('keeps a logger failure from breaking event callers', () => {
    const throwingRestore = configureAcademySecurityEventLogger(() => {
      throw new Error('logger unavailable')
    })

    expect(() => emitAcademySecurityEvent(validEvent)).not.toThrow()
    expect(emitAcademySecurityEvent(validEvent)).toBe(true)
    expect(getAcademySecurityEventBudgetForTests().emittedCount).toBe(2)

    configureAcademySecurityEventLogger(throwingRestore)
  })
})


