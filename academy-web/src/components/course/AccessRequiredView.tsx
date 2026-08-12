import * as React from 'react'
import Link from 'next/link'
import type { Locale } from '@/lib/content/course-types'

type AccessReason = 'inactive' | 'locked' | 'not-enrolled'

const COPY = {
  en: {
    eyebrow: 'Course access',
    heading: {
      inactive: 'Academy access is not active yet',
      locked: 'This lesson is not unlocked yet',
      'not-enrolled': 'This course is not in your access',
    },
    body: {
      inactive: 'Your CYBERSKILLS account is signed in, but Academy enrollment has not been activated. No learning record has been changed.',
      locked: 'Continue from the course roadmap first. Your learning record and completed work are unchanged.',
      'not-enrolled': (title: string) => `${title} is not included in your current enrollment. Your existing learning record is unchanged.`,
    },
    roadmap: 'Return to the course roadmap',
    dashboard: 'Return to My learning',
    browse: 'Browse courses',
  },
  th: {
    eyebrow: 'สิทธิ์เข้าเรียน',
    heading: {
      inactive: 'ยังไม่เปิดสิทธิ์ Academy สำหรับบัญชีนี้',
      locked: 'บทเรียนนี้ยังไม่ถูกปลดล็อก',
      'not-enrolled': 'คอร์สนี้ยังไม่อยู่ในสิทธิ์การเรียนของคุณ',
    },
    body: {
      inactive: 'บัญชี CYBERSKILLS ของคุณเข้าสู่ระบบแล้ว แต่ยังไม่ได้เปิดสิทธิ์ Academy เราไม่ได้เปลี่ยนแปลงประวัติการเรียนของคุณ',
      locked: 'กลับไปเรียนตามลำดับในแผนการเรียนก่อน ประวัติการเรียนและบทที่ทำเสร็จแล้วยังคงเดิม',
      'not-enrolled': (title: string) => `${title} ยังไม่อยู่ในสิทธิ์การเรียนปัจจุบัน ประวัติการเรียนเดิมของคุณยังคงเดิม`,
    },
    roadmap: 'กลับไปที่แผนการเรียน',
    dashboard: 'กลับไปที่คอร์สของฉัน',
    browse: 'ดูคอร์สทั้งหมด',
  },
} as const

export function AccessRequiredView({
  courseTitle,
  locale,
  reason,
  slug,
}: {
  courseTitle: string
  locale: Locale
  reason: AccessReason
  slug: string
}) {
  const copy = COPY[locale]
  const body = copy.body[reason]
  const overview = `/courses/${slug}/learn?lang=${locale}`
  return (
    <main
      className="mx-auto max-w-2xl px-6 py-16"
      data-testid="course-access-required"
      lang={locale}
    >
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">{copy.eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-cs-text">
        {copy.heading[reason]}
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-cs-body">
        {typeof body === 'function' ? body(courseTitle) : body}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={reason === 'locked' ? overview : '/dashboard'}
          className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
        >
          {reason === 'locked' ? copy.roadmap : copy.dashboard}
        </Link>
        <Link
          href={`/courses?lang=${locale}`}
          className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm text-cs-body hover:border-cs-accent"
        >
          {copy.browse}
        </Link>
      </div>
    </main>
  )
}
