'use client'

import { useEffect } from 'react'
import type { Locale } from '@/lib/content/course-types'
import { useUi } from '@/components/i18n/LocaleProvider'

type CourseLocaleChromeSyncProps = {
  locale: Locale
  availableLocales: Locale[]
  requestedLocale?: Locale
  localeParameterPresent: boolean
}

export function courseLocaleNavigationTarget({
  availableLocales,
  courseLocale,
  requestedLocale,
  localeParameterPresent,
  uiLocale,
}: {
  availableLocales: Locale[]
  courseLocale: Locale
  requestedLocale?: Locale
  localeParameterPresent: boolean
  uiLocale: Locale
}): Locale | null {
  if (localeParameterPresent && !requestedLocale) return courseLocale
  if (requestedLocale && !availableLocales.includes(requestedLocale)) return courseLocale
  if (requestedLocale || courseLocale === uiLocale) return null
  return availableLocales.includes(uiLocale) ? uiLocale : courseLocale
}

// `?lang=` is resolved on the server for a public course. A supported explicit
// locale wins over the chrome preference; unsupported values and bare static
// URLs are normalized to a locale the course can actually serve. This keeps
// query links shareable without making the shared root layout dynamic.
export function CourseLocaleChromeSync({
  locale,
  availableLocales,
  requestedLocale,
  localeParameterPresent,
}: CourseLocaleChromeSyncProps) {
  const { locale: uiLocale, setLocale } = useUi()

  useEffect(() => {
    const navigationTarget = courseLocaleNavigationTarget({
      availableLocales,
      courseLocale: locale,
      requestedLocale,
      localeParameterPresent,
      uiLocale,
    })
    if (navigationTarget) {
      const url = new URL(window.location.href)
      url.searchParams.set('lang', navigationTarget)
      window.location.replace(`${url.pathname}${url.search}${url.hash}`)
      return
    }

    if (localeParameterPresent) {
      if (locale !== uiLocale) setLocale(locale)
    }
  }, [availableLocales, locale, localeParameterPresent, requestedLocale, setLocale, uiLocale])

  return null
}
