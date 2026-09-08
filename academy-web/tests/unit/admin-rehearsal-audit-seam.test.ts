import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '0036_admin_rehearsal_audit_projection.sql'),
  'utf8',
)
const rollback = readFileSync(
  join(root, 'supabase', 'rollbacks', '0036_admin_rehearsal_audit_projection.rollback.sql'),
  'utf8',
)

describe('administrative rehearsal audit seam', () => {
  it('exposes only bounded latest-audit projections to dedicated operators', () => {
    expect(migration).toMatch(/security definer/i)
    expect(migration).toMatch(/order by event_id desc limit 1/i)
    expect(migration).toMatch(/revoke all on function academy\.inspect_staff_role_audit[^\n]*\s*\n\s*from [^\n]*academy_entitlement_operator/i)
    expect(migration).toMatch(/revoke all on function academy\.inspect_course_entitlement_audit[^\n]*\s*\n\s*from [^\n]*academy_staff_admin/i)
    expect(migration).toMatch(/grant execute on function academy\.inspect_staff_role_audit[^\n]*\s*\n\s*to academy_staff_admin/i)
    expect(migration).toMatch(/grant execute on function academy\.inspect_course_entitlement_audit[^\n]*\s*\n\s*to academy_entitlement_operator/i)
    expect(migration).not.toMatch(/grant (?:insert|update|delete) on academy\./i)
    expect(rollback).toMatch(/drop function academy\.inspect_staff_role_audit/i)
    expect(rollback).toMatch(/drop function academy\.inspect_course_entitlement_audit/i)
  })
})
