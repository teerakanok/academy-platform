'use client'

import Link from 'next/link'
import { useUi } from '@/components/i18n/LocaleProvider'

export default function AppError({ reset }: { reset: () => void }) {
  const { locale } = useUi()
  const copy = locale === 'th'
    ? {
        eyebrow: 'ยังใช้งานไม่ได้ชั่วคราว',
        heading: 'ตรวจสิทธิ์ Academy ไม่สำเร็จ',
        body: 'บัญชีและประวัติการเรียนของคุณยังคงเดิม ลองตรวจสิทธิ์อีกครั้ง หรือกลับไปที่คอร์สของฉัน',
        retry: 'ลองอีกครั้ง',
        dashboard: 'กลับไปที่คอร์สของฉัน',
      }
    : {
        eyebrow: 'Temporarily unavailable',
        heading: 'We could not check your Academy access',
        body: 'Your account and learning record are unchanged. Try the access check again, or return to My learning.',
        retry: 'Try again',
        dashboard: 'Return to My learning',
      }
  return (
    <main className="mx-auto max-w-2xl px-6 py-16" role="alert" lang={locale}>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">{copy.eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-cs-text">{copy.heading}</h1>
      <p className="mt-4 leading-relaxed text-cs-body">{copy.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
        >
          {copy.retry}
        </button>
        <Link
          href="/dashboard"
          className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm text-cs-body hover:border-cs-accent"
        >
          {copy.dashboard}
        </Link>
      </div>
    </main>
  )
}
