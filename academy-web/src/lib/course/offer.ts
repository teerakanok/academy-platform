import type { CourseOffer, Locale } from '@/lib/content/course-types'

// ทางเดินเดียวของ "เริ่มเรียนฟรี" — ปุ่มทุกจุด (หน้าคอร์ส, access-required) ชี้มาที่นี่
// หน้า /start จัดการเองทั้ง "ยังไม่ล็อกอิน → sign-in แล้วกลับมา" และ "ล็อกอินแล้ว →
// ลงเรียนแล้วพาไปหน้าเรียน" ปุ่มจึงไม่ต้องรู้ว่าผู้ใช้อยู่สถานะไหน

export function isFreeOffer(offer: CourseOffer | null | undefined): boolean {
  return offer?.model === 'free'
}

export function freeCourseStartPath(slug: string, locale: Locale): string {
  return `/courses/${slug}/start?lang=${locale}`
}

export function courseLearnPath(slug: string, locale: Locale): string {
  return `/courses/${slug}/learn?lang=${locale}`
}
