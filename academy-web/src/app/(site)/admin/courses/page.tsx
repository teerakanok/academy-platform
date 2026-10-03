import * as React from 'react'
import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import { CourseManagement } from '@/components/admin/CourseManagement'
import { requireInternalOwner } from '@/lib/staff/authorization'

export const metadata: Metadata = privatePage('Course management')
export const dynamic = 'force-dynamic'

// ตรวจ owner ฝั่งเซิร์ฟเวอร์ก่อนส่งโครงหน้า — ผู้เรียนทั่วไปได้ 404 (AC-SEC-06)
export default async function CourseManagementPage() {
  await requireInternalOwner()
  return <CourseManagement />
}
