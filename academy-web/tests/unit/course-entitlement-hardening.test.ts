import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { internals } from '../../scripts/manage-course-entitlement.mjs'

const root = join(__dirname, '..', '..')
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '0030_least_privilege_course_entitlement.sql'),
  'utf8',
)
const admissionCap = readFileSync(
  join(root, 'supabase', 'migrations', '0029_identity_authorization_admission_cap.sql'),
  'utf8',
)
const operatorScript = readFileSync(
  join(root, 'scripts', 'manage-course-entitlement.mjs'),
  'utf8',
)
const applyScript = readFileSync(
  join(root, 'scripts', 'apply-course-entitlement-hardening.mjs'),
  'utf8',
)
const rollback = readFileSync(
  join(root, 'supabase', 'rollbacks', '0030_least_privilege_course_entitlement.rollback.sql'),
  'utf8',
)
const staffScript = readFileSync(join(root, 'scripts', 'manage-staff-role.mjs'), 'utf8')

describe('least-privilege course entitlement hardening', () => {
  it('validates strict operator inputs without treating email as identity', () => {
    const base = [
      '--grant',
      '--actor-issuer', 'https://identity.example',
      '--actor-subject', '11111111-1111-4111-8111-111111111111',
      '--target-issuer', 'https://identity.example',
      '--target-subject', '22222222-2222-4222-8222-222222222222',
      '--course', 'setup-and-environment',
      '--source', 'grant',
      '--reference', 'CHANGE-2026-001',
      '--expires-at', new Date(Date.now() + 86_400_000).toISOString(),
    ]
    expect(internals.parseArgs(base)).toMatchObject({ action: 'grant', apply: false, expiresAt: expect.any(String) })
    expect(() => internals.parseArgs(base.filter((value) => value !== '--grant'))).toThrow(/choose --grant or --revoke/)
    expect(() => internals.parseArgs(base.map((value) => (value === '22222222-2222-4222-8222-222222222222' ? 'not-a-uuid' : value)))).toThrow(/canonical UUID/)
    expect(() => internals.parseArgs(base.map((value) => (value === 'grant' ? 'purchase' : value)))).toThrow(/invitation or grant/)
    expect(() => internals.parseArgs([...base.slice(0, 19), '--target-email-hint', 'Not.Canonical@Example.com'])).toThrow(/email hint/)
    expect(() => internals.parseArgs(base.map((value) => (value === 'setup-and-environment' ? 'not course' : value)))).toThrow(/course slug/)
  })

  it('removes direct mutation from runtime and shared service roles', () => {
    expect(migration).toMatch(
      /revoke insert, update, delete on academy\.service_activation\s+from academy_runtime, service_role/i,
    )
    expect(migration).toMatch(
      /revoke insert, update, delete on academy\.course_entitlement\s+from academy_runtime, service_role/i,
    )
    expect(migration).toMatch(/revoke all on academy\.service_activation from service_role/i)
    expect(migration).toMatch(/revoke all on academy\.course_entitlement from service_role/i)
    expect(migration).toMatch(/revoke execute on function academy\.sync_service_activation\(uuid, text, integer\) from service_role/i)
    expect(migration).not.toMatch(/grant (?:insert|update|delete) on academy\.course_entitlement to academy_runtime/i)
    expect(migration).not.toMatch(/grant (?:insert|update|delete) on academy\.course_entitlement to service_role/i)
  })

  it('preserves callback and lifecycle RPC authority for the runtime only', () => {
    expect(migration).toMatch(/grant execute on function academy\.sync_service_activation\(uuid, text, integer\)\s+to academy_runtime/i)
    expect(migration).toMatch(/grant execute on function academy\.create_identity_session\([^)]*\)\s+to academy_runtime/i)
    expect(migration).not.toMatch(/grant execute on function academy\.set_course_entitlement[^\n]*to academy_runtime/i)
    expect(admissionCap).toMatch(/pg_advisory_xact_lock\(2147483001, 29001\)/)
    expect(admissionCap).toMatch(/if v_outstanding_count >= v_outstanding_limit then/)
  })

  it('removes shared service_role control-plane access', () => {
    expect(migration).toMatch(/revoke all on academy\.staff_role_assignment from service_role/i)
    expect(migration).toMatch(/revoke all on academy\.staff_role_audit from service_role/i)
    expect(migration).toMatch(/revoke execute on function academy\.has_staff_role\(uuid, text\) from service_role/i)
    expect(migration).toMatch(/revoke academy_staff_admin from postgres/i)
    expect(staffScript).toMatch(/current_user as user_name/)
    expect(staffScript).toMatch(/user_name !== 'academy_staff_admin'/)
    expect(staffScript).not.toMatch(/set local role academy_staff_admin/i)
  })

  it('creates a dedicated operator surface with audited idempotent RPCs', () => {
    expect(migration).toMatch(/academy_entitlement_operator/i)
    expect(migration).toMatch(/academy\.course_entitlement_audit/i)
    expect(migration).toMatch(/grant execute on function academy\.resolve_staff_account\(text, text\)[^\n]*\s*to academy_staff_admin/i)
    expect(migration).toMatch(/if not academy\.has_staff_role\(p_actor_account_id, 'owner'\) then/i)
    expect(migration).toMatch(/grant execute on function academy\.set_course_entitlement[^]*?to academy_entitlement_operator/i)
    expect(operatorScript).toMatch(/current_user as user_name/)
    expect(operatorScript).toMatch(/user_name !== 'academy_entitlement_operator'/)
    expect(operatorScript).toMatch(/resolve_entitlement_account/)
    expect(operatorScript).not.toMatch(/set local role/i)
  })

  it('requires rollback rehearsal and preserves audit evidence on rollback', () => {
    expect(applyScript).toMatch(/--dry-run/)
    expect(applyScript).toMatch(/query\('rollback'\)/)
    expect(applyScript).toMatch(/query\('commit'\)/)
    expect(rollback).toMatch(/without deleting entitlement audit evidence/)
    expect(rollback).not.toMatch(/drop table academy\.course_entitlement_audit/)
  })
})
