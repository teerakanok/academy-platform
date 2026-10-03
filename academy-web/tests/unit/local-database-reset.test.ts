import { readFileSync } from 'node:fs'
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
})
