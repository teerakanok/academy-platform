import { describe, expect, it } from 'vitest'
import { admissionResponse } from '../../src/lib/edge-admission'
import { assertAdmissionReleasePolicy } from '../../scripts/admission-release-policy.mjs'

describe('Academy maintenance admission', () => {
  it.each([undefined, 'maintenance', '', 'OPEN', ' open', 'false', null, 1])('closes absent, malformed, or maintenance mode %s without cache', (mode) => {
    const response = admissionResponse({ ACADEMY_ADMISSION_MODE: mode as string })!
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('content-security-policy')).toContain("base-uri 'none'")
  })
  it('closes failed binding reads', () => {
    expect(admissionResponse({ get ACADEMY_ADMISSION_MODE(): string { throw new Error('fixture') } })?.status).toBe(503)
  })
  it('allows only explicit open at runtime', () => {
    expect(admissionResponse({ ACADEMY_ADMISSION_MODE: 'open' })).toBeNull()
    expect(admissionResponse({})?.status).toBe(503)
    expect(() => assertAdmissionReleasePolicy({ vars: {}, assets: { run_worker_first: true } })).toThrow(/explicit/)
  })
  it.each(['maintenance', 'open'])('accepts explicit release mode %s with all assets gated', (mode) => {
    expect(() => assertAdmissionReleasePolicy({ vars: { ACADEMY_ADMISSION_MODE: mode }, assets: { run_worker_first: true } })).not.toThrow()
  })
  it.each([undefined, false, ['/media/*']])('rejects asset bypass in release config', (routing) => {
    expect(() => assertAdmissionReleasePolicy({ vars: { ACADEMY_ADMISSION_MODE: 'maintenance' }, assets: { run_worker_first: routing } })).toThrow(/every asset/)
  })
  it('rejects SPA fallback masking application routes as public assets', () => {
    expect(() => assertAdmissionReleasePolicy({ vars: { ACADEMY_ADMISSION_MODE: 'open' }, assets: { run_worker_first: true, not_found_handling: 'single-page-application' } })).toThrow(/SPA/)
  })
})
