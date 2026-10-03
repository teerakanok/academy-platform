import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Academy local database reset runbook', () => {
  it('documents the complete local command and production history boundary', () => {
    const runbook = readFileSync(
      join(process.cwd(), 'docs/local-database-reset.md'),
      'utf8',
    )

    expect(runbook).toContain('supabase db reset --local --no-seed')
    expect(runbook).toContain("to_regclass('academy.course_offer')")
    expect(runbook).toContain('6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0')
    expect(runbook).toContain('does not mutate production history')
    expect(runbook).toContain('must not be re-applied')
  })

  it('bootstraps the activation owner for the non-superuser local migration role', () => {
    const roles = readFileSync(join(process.cwd(), 'supabase/roles.sql'), 'utf8')
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0035_service_activation_runtime_definer.sql'),
      'utf8',
    )

    expect(roles).toMatch(
      /create role academy_activation_writer\s+nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i,
    )
    expect(roles).toMatch(/grant academy_activation_writer to postgres;/i)
    expect(migration).toMatch(/rolname = 'academy_activation_writer'/i)
    expect(migration).toMatch(/activation writer role already exists/i)
    expect(migration).not.toMatch(/^\s*alter role academy_activation_writer\b/im)
    expect(migration).toMatch(
      /grant create on schema academy to academy_activation_writer/i,
    )
    expect(migration).toMatch(
      /revoke create on schema academy from academy_activation_writer/i,
    )
  })

  it('keeps later migrations free of statements the local postgres role cannot execute', () => {
    const migrationDirectory = join(process.cwd(), 'supabase/migrations')
    for (const version of ['0036', '0037', '0038', '0039', '0040']) {
      const filename = readdirSync(migrationDirectory)
        .find((name) => name.startsWith(`${version}_`))
      expect(filename, `${version} migration should exist`).toBeDefined()
      const sql = readFileSync(join(migrationDirectory, filename!), 'utf8')
        .replace(/--[^\n]*/g, '')

      expect(sql, `${version} top-level LOCK TABLE`).not.toMatch(/^\s*lock\s+table\b/im)
      expect(sql, `${version} ALTER ROLE`).not.toMatch(/^\s*alter\s+role\b/im)
      expect(sql, `${version} SET ROLE`).not.toMatch(/^\s*set\s+role\b/im)
      expect(sql, `${version} role attribute`).not.toMatch(
        /\b(?:superuser|bypassrls|createdb|createrole|replication)\b/i,
      )

      for (const match of sql.matchAll(/\bowner\s+to\s+([^\n;]+)/gi)) {
        expect(match[1].trim().toLowerCase(), `${version} OWNER TO`).toBe('postgres')
      }
    }
  })
})
