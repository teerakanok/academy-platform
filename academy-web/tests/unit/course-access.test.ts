import { describe, expect, it } from 'vitest'
import { decideCourseAccess } from '@/lib/account/course-access'

describe('course access decision', () => {
  it('มี session อย่างเดียวไม่พอ', () => {
    expect(decideCourseAccess(null, false)).toEqual({ allowed: false, reason: 'inactive' })
  })

  it('activation ที่ถูกพักหรือปิดใช้ต้องถูกปฏิเสธ', () => {
    for (const status of ['pending', 'suspended', 'deactivated'] as const) {
      expect(decideCourseAccess({ status, revision: 1 }, true)).toEqual({
        allowed: false,
        reason: 'inactive',
      })
    }
  })

  it('active แต่ไม่มี entitlement ยังเข้าไม่ได้', () => {
    expect(decideCourseAccess({ status: 'active', revision: 2 }, false)).toEqual({
      allowed: false,
      reason: 'not-entitled',
    })
  })

  it('ต้อง active และมี entitlement พร้อมกัน', () => {
    expect(decideCourseAccess({ status: 'active', revision: 2 }, true)).toEqual({ allowed: true })
  })
})
