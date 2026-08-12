import type { Metadata } from 'next'
import { CURRENT_CONSENT_VERSION } from '@/lib/consent'
import { PrivacyContent } from './PrivacyContent'

// PDPA notice — ช่องทางติดต่อใช้ค่าเดียวกับ privacy page ของ cyberskills.co.th
//
// เนื้อหาอยู่ใน src/lib/i18n/privacy.ts สองภาษา และหน้านี้เลือกตามภาษาของเว็บ
// (ฉบับไทยคือฉบับที่ผูกกับกฎหมาย ฉบับอังกฤษเป็นคำแปลเพื่อความเข้าใจ ระบุไว้ในหน้าแล้ว)
export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'How CYBERSKILLS Academy collects, uses and deletes your personal data (PDPA).',
}

export default function PrivacyPage() {
  return <PrivacyContent version={CURRENT_CONSENT_VERSION} />
}
