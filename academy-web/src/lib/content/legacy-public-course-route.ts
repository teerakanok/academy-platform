import 'server-only'
import type { Locale } from './course-types'
import { getPublicCourse } from './course-source'
import { isUiLocale } from '@/lib/i18n/ui'

export type LegacyCourseSearchParams = Record<string, string | string[] | undefined>

function singleLocale(searchParams: LegacyCourseSearchParams): Locale | undefined {
  const value = searchParams.lang
  return typeof value === 'string' && isUiLocale(value) ? value : undefined
}

export function legacyCourseRedirectPath({
  slug,
  searchParams,
}: {
  slug: string
  searchParams: LegacyCourseSearchParams
}): string | null {
  const course = getPublicCourse(slug, singleLocale(searchParams))
  if (!course) return null

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'lang' || value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry)
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  return `/courses/${slug}/${course.locale}${suffix}`
}
