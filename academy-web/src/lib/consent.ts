import { CONSENT_TEXTS } from './content/registry.generated'

// เวอร์ชันข้อความ consent ที่ระบบยอมรับ — ต้องตรงกับไฟล์ใน src/content/consent/
// และตรงกับ CHECK constraint ใน supabase/migrations (academy.leads.consent_text_version)
// เพิ่มเวอร์ชันใหม่ = เพิ่มไฟล์ + เพิ่มค่าใน CHECK constraint (migration ใหม่) พร้อมกัน
export const CONSENT_VERSIONS = ['v1', 'v2'] as const
export type ConsentVersion = (typeof CONSENT_VERSIONS)[number]

export const CURRENT_CONSENT_VERSION: ConsentVersion = 'v2'

// ข้อความถูกฝังมาตอน build (ดู scripts/generate-content-registry.mjs) — เดิมอ่านจาก
// ดิสก์ตอน request ซึ่งรันบน runtime ที่ไม่มี filesystem ไม่ได้ และทำให้ข้อความทาง
// กฎหมายที่หายไปกลายเป็น error ตอนผู้ใช้กดยินยอม แทนที่จะเป็น build ที่แดง
export function consentText(version: ConsentVersion = CURRENT_CONSENT_VERSION): string {
  const text = CONSENT_TEXTS[version]
  if (!text) throw new Error(`ไม่พบข้อความ consent เวอร์ชัน ${version} ใน registry — รัน generate-content-registry ใหม่`)
  return text
}
