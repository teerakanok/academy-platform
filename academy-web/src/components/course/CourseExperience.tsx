'use client'

import * as React from 'react'
import { useEffect, useState, type ComponentType } from 'react'
import type { Locale, PublicCourseCopy, PublicCourseStructure } from '@/lib/content/course-types'
import { readAccountResponse } from '@/lib/auth/account-response-client'
import { PublicCourseSyllabus } from './PublicCourseSyllabus'
import { CourseLocaleChromeSync } from './CourseLocaleChromeSync'

type CourseExperienceProps = {
  structure: PublicCourseStructure
  copy: PublicCourseCopy
  locale: Locale
  translatedNodeIds: string[]
  requestedLocale?: Locale
  localeParameterPresent?: boolean
}

export function CourseExperience(props: CourseExperienceProps) {
  const {
    structure,
    copy,
    locale,
    translatedNodeIds,
    requestedLocale,
    localeParameterPresent = false,
  } = props
  const [LearnerOverview, setLearnerOverview] = useState<ComponentType<Omit<CourseExperienceProps, 'requestedLocale' | 'localeParameterPresent'>> | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      .then(readAccountResponse)
      .then((account) => {
        if (!active || account?.signedIn !== true) return
        import('./CourseOverview').then(({ CourseOverview }) => {
          if (active) setLearnerOverview(() => CourseOverview)
        })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

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
      <PublicCourseSyllabus structure={structure} copy={copy} locale={locale} translatedNodeIds={translatedNodeIds} />
    </>
  )
}
