import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
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

  it('ข้อความ bilingual ที่แสดงตรงกับ artifact ของ current version ทุกตัวอักษร', () => {
    const artifact = readFileSync(
      join(__dirname, '..', '..', 'src', 'content', 'consent', `${CURRENT_CONSENT_VERSION}.md`),
      'utf8',
    )
    expect(consentText()).toBe(artifact)
    expect(artifact).toContain('I consent to CYBERSKILLS')
    expect(artifact).toContain('ภาษาไทย:')
  })

  it('migration CHECK constraint ครอบทุกเวอร์ชันใน CONSENT_VERSIONS (กันไฟล์กับ DB หลุด sync)', () => {
    const migrationDir = join(__dirname, '..', '..', 'supabase', 'migrations')
    const migrations = readdirSync(migrationDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(join(migrationDir, name), 'utf8'))
      .join('\n')
    const readAllowed = (constraint: string): string[] => {
      const matches = [
        ...migrations.matchAll(new RegExp(`${constraint}[\\s\\S]*?consent_text_version in \\(([^)]+)\\)`, 'g')),
      ]
      expect(matches.length).toBeGreaterThan(0)
      return matches.at(-1)![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort()
    }
    expect(readAllowed('leads_consent_version_allowed')).toEqual([...CONSENT_VERSIONS].sort())
    expect(readAllowed('consent_events_version_allowed')).toEqual([...CONSENT_VERSIONS].sort())
  })
})
