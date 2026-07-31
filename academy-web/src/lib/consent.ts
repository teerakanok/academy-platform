import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// เวอร์ชันข้อความ consent ที่ระบบยอมรับ — ต้องตรงกับไฟล์ใน src/content/consent/
// และตรงกับ CHECK constraint ใน supabase/migrations (academy.leads.consent_text_version)
// เพิ่มเวอร์ชันใหม่ = เพิ่มไฟล์ + เพิ่มค่าใน CHECK constraint (migration ใหม่) พร้อมกัน
export const CONSENT_VERSIONS = ['v1'] as const
export type ConsentVersion = (typeof CONSENT_VERSIONS)[number]

export const CURRENT_CONSENT_VERSION: ConsentVersion = 'v1'

export function consentText(version: ConsentVersion = CURRENT_CONSENT_VERSION): string {
  return readFileSync(join(process.cwd(), 'src', 'content', 'consent', `${version}.md`), 'utf8')
}
