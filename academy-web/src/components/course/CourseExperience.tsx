'use client'

import * as React from 'react'
import { useEffect, useState, type ComponentType } from 'react'
import type { CourseOffer, Locale, PublicCourseCopy, PublicCourseStructure } from '@/lib/content/course-types'
import { isFreeOffer } from '@/lib/course/offer'
import { readAccountResponse } from '@/lib/auth/account-response-client'
import { PublicCourseSyllabus } from './PublicCourseSyllabus'
import { CourseLocaleChromeSync } from './CourseLocaleChromeSync'

type CourseExperienceProps = {
  structure: PublicCourseStructure
  copy: PublicCourseCopy
  locale: Locale
  translatedNodeIds: string[]
  offer?: CourseOffer | null
  requestedLocale?: Locale
  localeParameterPresent?: boolean
}

type LearnerOverviewProps = Omit<CourseExperienceProps, 'requestedLocale' | 'localeParameterPresent' | 'offer'>

/**
 * คอร์สฟรีที่ผู้ใช้ล็อกอินแล้ว: ถาม endpoint ลงเรียนก่อนว่าอยู่สถานะไหน
 * 'can-enrol-free' = คงหน้า syllabus ที่มีปุ่ม "เริ่มเรียนฟรี" · อย่างอื่นไปหน้าผู้เรียนเดิม
 * (enrolled → ปุ่มเรียนต่อ, inactive/ตรวจไม่ได้ → ข้อความสิทธิ์ตามเดิม)
 */
export async function readFreeEnrolmentState(response: Response): Promise<'can-enrol-free' | 'other'> {
  if (!response.ok) return 'other'
  const body = (await response.json().catch(() => null)) as { ok?: unknown; state?: unknown } | null
  return body?.ok === true && body.state === 'can-enrol-free' ? 'can-enrol-free' : 'other'
}

export function CourseExperience(props: CourseExperienceProps) {
  const {
    structure,
    copy,
    locale,
    translatedNodeIds,
    offer = null,
    requestedLocale,
    localeParameterPresent = false,
  } = props
  const [LearnerOverview, setLearnerOverview] = useState<ComponentType<LearnerOverviewProps> | null>(null)
  const free = isFreeOffer(offer)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      .then(readAccountResponse)
      .then(async (account) => {
        if (!active || account?.signedIn !== true) return
        if (free) {
          const state = await fetch(`/api/courses/${structure.slug}/enrol`, { cache: 'no-store' })
            .then(readFreeEnrolmentState)
            .catch(() => 'other' as const)
          if (!active || state === 'can-enrol-free') return
        }
        import('./CourseOverview').then(({ CourseOverview }) => {
          if (active) setLearnerOverview(() => CourseOverview)
        })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [free, structure.slug])

  if (LearnerOverview) {
    return (
      <>
        <CourseLocaleChromeSync
          locale={locale}
          availableLocales={structure.availableLocales}
          requestedLocale={requestedLocale}
          localeParameterPresent={localeParameterPresent}
        />
        <LearnerOverview structure={structure} copy={copy} locale={locale} translatedNodeIds={translatedNodeIds} />
      </>
    )
  }

  // SSR และสถานะที่ตรวจบัญชีไม่สำเร็จต้องเป็นหน้า syllabus ที่อ่านได้เสมอ. หน้า
  // สาธารณะจึงไม่ยิง progress API, ส่วนผู้เรียนกลับไปใช้ CourseOverview เดิมทันทีที่
  // adapter ของ Identity Control ยืนยัน session ผ่าน /api/auth/me.
  return (
    <>
      <CourseLocaleChromeSync
        locale={locale}
        availableLocales={structure.availableLocales}
        requestedLocale={requestedLocale}
        localeParameterPresent={localeParameterPresent}
      />
      <PublicCourseSyllabus structure={structure} copy={copy} locale={locale} translatedNodeIds={translatedNodeIds} offer={offer} />
    </>
  )
}
