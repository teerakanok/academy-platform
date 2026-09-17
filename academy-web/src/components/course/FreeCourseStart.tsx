'use client'

import * as React from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/content/course-types'
import { courseLearnPath, freeCourseStartPath } from '@/lib/course/offer'

type Phase = 'enrolling' | 'not-available' | 'failed'

const COPY = {
  en: {
    eyebrow: 'Free course',
    enrolling: (title: string) => `Adding ${title} to My learning…`,
    enrollingBody: 'This takes a moment. You will go straight to the course.',
    notAvailableHeading: 'This course cannot be started right now',
    notAvailableBody: 'It is not open for free enrolment at the moment. Nothing was changed on your account.',
    failedHeading: 'We could not start this course',
    failedBody: 'Nothing was changed on your account. Please try again.',
    retry: 'Try again',
    browse: 'Browse courses',
  },
  th: {
    eyebrow: 'คอร์สฟรี',
    enrolling: (title: string) => `กำลังเพิ่ม ${title} เข้าคอร์สของฉัน…`,
    enrollingBody: 'ใช้เวลาไม่นาน แล้วจะพาไปหน้าเรียนทันที',
    notAvailableHeading: 'ยังเริ่มคอร์สนี้ไม่ได้ในตอนนี้',
    notAvailableBody: 'คอร์สนี้ยังไม่เปิดให้ลงเรียนฟรีในขณะนี้ บัญชีของคุณไม่มีอะไรเปลี่ยนแปลง',
    failedHeading: 'เริ่มคอร์สนี้ไม่สำเร็จ',
    failedBody: 'บัญชีของคุณไม่มีอะไรเปลี่ยนแปลง ลองอีกครั้งได้เลย',
    retry: 'ลองอีกครั้ง',
    browse: 'ดูคอร์สทั้งหมด',
  },
} as const

export function FreeCourseStart({
  slug,
  courseTitle,
  locale,
}: {
  slug: string
  courseTitle: string
  locale: Locale
}) {
  const copy = COPY[locale]
  const [phase, setPhase] = useState<Phase>('enrolling')
  const inFlight = useRef(false)

  const enrol = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPhase('enrolling')
    try {
      const response = await fetch(`/api/courses/${slug}/enrol`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const body = (await response.json().catch(() => null)) as { ok?: unknown; reason?: unknown } | null
      if (response.ok && body?.ok === true) {
        // ปลายทางคำนวณเองจาก slug/locale — ไม่เดินตาม URL ที่มากับ response
        window.location.replace(courseLearnPath(slug, locale))
        return
      }
      if (response.status === 401) {
        window.location.replace(`/sign-in?next=${encodeURIComponent(freeCourseStartPath(slug, locale))}`)
        return
      }
      if (body?.reason === 'inactive') {
        window.location.replace(`/access-required?${new URLSearchParams({ course: slug, lang: locale }).toString()}`)
        return
      }
      setPhase(response.status === 403 || response.status === 404 ? 'not-available' : 'failed')
    } catch {
      setPhase('failed')
    } finally {
      inFlight.current = false
    }
  }, [slug, locale])

  useEffect(() => {
    void enrol()
  }, [enrol])

  return (
    <main className="mx-auto max-w-2xl px-6 py-16" data-testid="free-course-start" data-phase={phase} lang={locale}>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">{copy.eyebrow}</p>
      {phase === 'enrolling' ? (
        <div role="status" aria-live="polite">
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-cs-text">
            {copy.enrolling(courseTitle)}
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-cs-body">{copy.enrollingBody}</p>
        </div>
      ) : (
        <div role="alert">
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-cs-text">
            {phase === 'not-available' ? copy.notAvailableHeading : copy.failedHeading}
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-cs-body">
            {phase === 'not-available' ? copy.notAvailableBody : copy.failedBody}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {phase === 'failed' && (
              <button
                type="button"
                onClick={() => void enrol()}
                className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
              >
                {copy.retry}
              </button>
            )}
            <Link
              href={`/courses?lang=${locale}`}
              className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm text-cs-body hover:border-cs-accent"
            >
              {copy.browse}
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
