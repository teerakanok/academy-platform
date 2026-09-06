import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/0031_course_entitlement_audit_retention.sql', import.meta.url),
  'utf8',
)

describe('course entitlement audit retention', () => {
  it('separates evidence from identity rows and preserves canonical UUID attribution', () => {
    expect(migration).toMatch(/drop constraint if exists course_entitlement_audit_account_id_fkey/)
    expect(migration).toMatch(/drop constraint if exists course_entitlement_audit_actor_account_id_fkey/)
    expect(migration).not.toMatch(/add constraint .* references academy\.users/i)
    expect(migration).not.toMatch(/actor_email|target_email/i)
  })

  it('keeps the approved three-year bound behind the restricted retention wrapper', () => {
    expect(migration).toMatch(/p_retain_years int default 3/)
    expect(migration).toMatch(/p_retain_years < 3 or p_retain_years > 10/)
    expect(migration).toMatch(/order by occurred_at\s+limit p_limit/)
    expect(migration).toMatch(/security invoker\s+set search_path = pg_catalog/)
    expect(migration).toMatch(/create function academy\.run_retention_course_entitlement_history\(\)/)
    expect(migration).toMatch(/purge_expired_course_entitlement_history\(3, 500\)/)
    expect(migration).toMatch(/revoke all on function academy\.run_retention_course_entitlement_history\(\)\s+from public, anon, authenticated, service_role/)
  })
})
