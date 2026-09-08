import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/0035_service_activation_runtime_definer.sql'),
  'utf8',
)

describe('service activation runtime definer correction', () => {
  it('uses a collision-checked non-login owner with only activation row access', () => {
    expect(migration).toMatch(/activation writer role already exists/)
    expect(migration).toMatch(/create role academy_activation_writer\s+nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i)
    expect(migration).toMatch(/grant usage on schema academy to academy_activation_writer/i)
    expect(migration).toMatch(/grant select, insert, update on academy\.service_activation\s+to academy_activation_writer/i)
    expect(migration).toMatch(/create policy academy_service_activation_sync_writer/i)
    expect(migration).not.toMatch(/grant delete on academy\.service_activation/i)
  })

  it('keeps runtime function-only and does not restore direct table writes', () => {
    expect(migration).toMatch(/alter function academy\.sync_service_activation\(uuid, text, integer\)\s+security definer\s+set search_path = pg_catalog, academy/i)
    expect(migration).toMatch(/owner to academy_activation_writer/i)
    expect(migration).not.toMatch(/create or replace function academy\.sync_service_activation/i)
    expect(migration).toMatch(/revoke all on function academy\.sync_service_activation\(uuid, text, integer\)\s+from public, anon, authenticated, service_role,\s+academy_entitlement_operator, academy_staff_admin/i)
    expect(migration).toMatch(/grant execute on function academy\.sync_service_activation\(uuid, text, integer\)\s+to academy_runtime/i)
    expect(migration).not.toMatch(/grant (?:insert|update|delete|all)[^\n]*on academy\.(?:service_activation|course_entitlement)[^\n]*to academy_runtime/i)
    expect(migration).not.toMatch(/grant[^\n]*to service_role/i)
  })
})
