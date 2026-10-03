import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrations = join(__dirname, '..', '..', 'supabase', 'migrations')
const migration = readFileSync(join(migrations, '0042_course_visibility_enforcement.sql'), 'utf8')
const rpc = migration.match(/create or replace function academy\.enrol_free_course[\s\S]*?\$\$;/)?.[0] ?? ''
const rollback = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'rollbacks', '0042_course_visibility_enforcement.rollback.sql'),
  'utf8',
)
const restoredRpc = rollback.match(/create or replace function academy\.enrol_free_course[\s\S]*?\$\$;/)?.[0] ?? ''

describe('migration 0042 free enrolment visibility guard', () => {
  it('reads and locks the runtime visibility before granting or returning an entitlement', () => {
    expect(rpc).toMatch(/select visibility into v_visibility\s+from academy\.course_settings\s+where course_slug = p_course_slug\s+for share;/)
    expect(rpc).toMatch(/coalesce\(v_visibility, 'published'\) <> 'published'[\s\S]*?errcode = '42501'/)
    expect(rpc.indexOf('from academy.course_settings')).toBeLessThan(rpc.indexOf('insert into academy.course_entitlement('))
  })

  it('preserves the security definer boundary and pinned search path', () => {
    expect(rpc).toMatch(/security definer\s+set search_path = pg_catalog, academy/)
    expect(migration).not.toMatch(/grant\s+[^;]+\s+on\s+(?:function\s+)?academy\./i)
    expect(migration).not.toMatch(/revoke\s+[^;]+\s+on\s+(?:function\s+)?academy\./i)
  })

  it('restores the prior free-enrolment RPC without dropping entitlements or audit history', () => {
    expect(restoredRpc).toContain('academy.enrol_free_course')
    expect(restoredRpc).not.toContain('academy.course_settings')
    expect(rollback).not.toMatch(/delete\s+from\s+academy\.course_entitlement/i)
    expect(rollback).not.toMatch(/delete\s+from\s+academy\.course_entitlement_audit/i)
  })
})
