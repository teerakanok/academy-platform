import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { attemptQuota } from '@/lib/course/attempt-db'
import {
  assessmentServeCount,
  assessmentIntegrityEnforced,
  minimumAssessmentDwellSeconds,
} from '@/lib/course/assessment-policy'
import { recordAssessmentIntegrityEvent } from '@/lib/observability/assessment-integrity'

describe('assessment integrity admission policy', () => {
  it('keeps the authored bank usable while capping future assessed sampling', () => {
    expect(assessmentServeCount(3)).toBe(3)
    expect(assessmentServeCount(5)).toBe(5)
    expect(assessmentServeCount(15)).toBe(5)
    expect(assessmentServeCount(47)).toBe(5)
  })

  it('uses an accessible per-task minimum dwell time', () => {
    expect(minimumAssessmentDwellSeconds(1)).toBe(30)
    expect(minimumAssessmentDwellSeconds(4)).toBe(60)
    expect(minimumAssessmentDwellSeconds(5)).toBe(75)
    expect(minimumAssessmentDwellSeconds(0)).toBe(30)
  })

  it('cannot weaken the production attempt quota through environment override', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', '500')
    expect(attemptQuota()).toBe(3)
    vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', '1')
    expect(attemptQuota()).toBe(1)
    vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', 'invalid')
    expect(attemptQuota()).toBe(3)
    vi.unstubAllEnvs()

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ATTEMPT_MAX_PER_WINDOW', '500')
    expect(attemptQuota()).toBe(100)
    vi.unstubAllEnvs()
  })

  it('rejects the local integrity fixture in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ACADEMY_ASSESSMENT_INTEGRITY_LOCAL_FIXTURE', '1')
    expect(assessmentIntegrityEnforced()).toBe(true)
    vi.unstubAllEnvs()

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ACADEMY_ASSESSMENT_INTEGRITY_LOCAL_FIXTURE', '1')
    expect(assessmentIntegrityEnforced()).toBe(false)
    vi.unstubAllEnvs()
  })

  it('emits bounded privacy-safe suspicious-attempt evidence', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    recordAssessmentIntegrityEvent('dwell-time', new Date(Date.now() + 61_000))
    recordAssessmentIntegrityEvent('daily-cap', new Date(Date.now() + 3_600_000))

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '{"event":"assessment-integrity","reason":"dwell-time","retry_wait":"1m-15m"}',
      '{"event":"assessment-integrity","reason":"daily-cap","retry_wait":"1h+"}',
    ])
    warn.mockRestore()
  })

  it('declares concurrency-safe durable SQL guards and no destructive expiration', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/0033_assessment_attempt_integrity.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('v_daily_count >= 10')
    expect(migration).toContain("interval '15 minutes'")
    expect(migration).toContain('least(p_max_per_window, 3)')
    expect(migration).toContain("integrityEnforced', 'true')")
    expect(migration).toContain('order by result_recorded_at desc, attempt_id desc')
    expect(migration).toContain('academy.attempt_integrity_enforced(a.params)')
    expect(migration).toContain('set search_path = academy, pg_temp')
    expect(migration).toContain('now() >= a.created_at + make_interval(secs =>')
    expect(migration).not.toMatch(/\bdelete\s+from\s+academy\.attempt\b/i)
  })
})
