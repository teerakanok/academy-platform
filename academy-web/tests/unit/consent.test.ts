import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONSENT_VERSIONS, CURRENT_CONSENT_VERSION, consentText } from '@/lib/consent'

describe('consent versioning', () => {
  it('ทุกเวอร์ชันใน CONSENT_VERSIONS มีไฟล์ข้อความจริงใน src/content/consent/', () => {
    for (const version of CONSENT_VERSIONS) {
      const text = consentText(version)
      expect(text.trim().length).toBeGreaterThan(50)
    }
  })

  it('CURRENT_CONSENT_VERSION อยู่ในลิสต์ที่ยอมรับ', () => {
    expect(CONSENT_VERSIONS).toContain(CURRENT_CONSENT_VERSION)
  })

  it('migration CHECK constraint ครอบทุกเวอร์ชันใน CONSENT_VERSIONS (กันไฟล์กับ DB หลุด sync)', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'supabase', 'migrations', '0001_academy_schema.sql'),
      'utf8',
    )
    const checkLine = migration.match(/consent_text_version in \(([^)]+)\)/)
    expect(checkLine).not.toBeNull()
    const allowed = checkLine![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(allowed.sort()).toEqual([...CONSENT_VERSIONS].sort())
  })
})
