'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { CourseCover } from './CourseCover'
import { LanguageToggle } from '@/components/i18n/LanguageToggle'
import { useUi } from '@/components/i18n/LocaleProvider'
import { DEFAULT_UI_LOCALE, isUiLocale, type UiLocale } from '@/lib/i18n/ui'
import { courseStepCounts } from '@/lib/content/course-step-summary'
import type { Locale, PublicCourseCatalogItem } from '@/lib/content/course-types'

type PublicCourseCatalogProps = {
  courses: PublicCourseCatalogItem[]
}

export type PublicCourseLevelFilter = 'all' | 'beginner' | 'intermediate' | 'advanced'

const LEVEL_FILTERS: PublicCourseLevelFilter[] = ['all', 'beginner', 'intermediate', 'advanced']

export function catalogLocaleNavigationTarget({
  rawLocales,
  uiLocale,
}: {
  rawLocales: string[]
  uiLocale: UiLocale
}): Locale | null {
  const rawLocale = rawLocales.length === 1 ? rawLocales[0] : null
  if (rawLocales.length > 1) return DEFAULT_UI_LOCALE
  if (rawLocale !== null && !isUiLocale(rawLocale)) return DEFAULT_UI_LOCALE
  if (isUiLocale(rawLocale) || uiLocale === DEFAULT_UI_LOCALE) return null
  return uiLocale
}

function courseLinkLocale(course: PublicCourseCatalogItem, locale: Locale): Locale {
  return course.structure.availableLocales.includes(locale) ? locale : course.structure.defaultLocale
}

export function filterPublicCourseCatalog({
  courses,
  locale,
  query,
  level,
}: {
  courses: PublicCourseCatalogItem[]
  locale: Locale
  query: string
  level: PublicCourseLevelFilter
}): PublicCourseCatalogItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)

  return courses.filter((course) => {
    if (level !== 'all' && course.structure.level !== level) return false

    const copy = course.copies[locale] ?? course.copies[course.structure.defaultLocale]
    if (!copy) return false
    if (!normalizedQuery) return true

    return [copy.title, copy.subtitle].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
  })
}

export function PublicCourseCatalog({ courses }: PublicCourseCatalogProps) {
  const { locale, setLocale, t } = useUi()
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<PublicCourseLevelFilter>('all')
  const searchInputId = useId()
  const filteredCourses = useMemo(
    () => filterPublicCourseCatalog({ courses, locale, query: searchQuery, level: levelFilter }),
    [courses, levelFilter, locale, searchQuery],
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    const rawLocales = url.searchParams.getAll('lang')
    const navigationTarget = catalogLocaleNavigationTarget({ rawLocales, uiLocale: locale })
    if (navigationTarget) {
      url.searchParams.set('lang', navigationTarget)
      window.location.replace(`${url.pathname}${url.search}${url.hash}`)
      return
    }

    const rawLocale = rawLocales.length === 1 ? rawLocales[0] : null
    if (isUiLocale(rawLocale) && locale !== rawLocale) setLocale(rawLocale)
  }, [locale, setLocale])

  if (courses.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12" lang={locale}>
        <header className="hero-bleed pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">{t.courses.eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-cs-text text-balance">
            {t.courses.heading}
          </h1>
        </header>
        <section className="mt-10 border-l-2 border-cs-accent px-5 py-1" aria-labelledby="catalog-empty-heading">
          <h2 id="catalog-empty-heading" className="font-display text-xl font-semibold text-cs-text">
            {t.courses.emptyHeading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-body">{t.courses.emptyBody}</p>
          <Link href="/#waitlist-heading" className="mt-5 inline-flex rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent">
            {t.courses.updates}
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12" lang={locale}>
      <header className="hero-bleed pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">{t.courses.eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-cs-text text-balance">
          {t.courses.heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-cs-body">{t.courses.intro}</p>
        <div className="mt-5 sm:hidden" data-testid="catalog-language-toggle-slot">
          <LanguageToggle />
        </div>
      </header>

      <section aria-label={t.courses.searchLabel} className="mt-8">
        <div>
          <label htmlFor={searchInputId} className="block text-sm font-semibold text-cs-text">
            {t.courses.searchLabel}
          </label>
          <input
            id={searchInputId}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.courses.searchPlaceholder}
            className="mt-2 w-full rounded-control border border-cs-border bg-cs-surface px-4 py-3 text-sm text-cs-text placeholder:text-cs-muted focus:border-cs-accent-border focus:outline-none sm:max-w-md"
          />
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-cs-text">{t.courses.levelFilter.legend}</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="level-filter-controls">
            {LEVEL_FILTERS.map((level) => {
              const levelLabel = level === 'all' ? t.courses.levelFilter.all : t.courses.level[level]

              return (
                <label key={level} className="flex min-w-0 cursor-pointer sm:inline-flex">
                  <input
                    type="radio"
                    name="public-course-level-filter"
                    value={level}
                    checked={levelFilter === level}
                    onChange={() => setLevelFilter(level)}
                    className="sr-only peer"
                  />
                    <span className="flex min-h-11 w-full items-center justify-center rounded-control border border-cs-border bg-cs-surface px-4 text-center text-sm font-medium leading-snug text-cs-body peer-checked:border-cs-accent-fill peer-checked:bg-cs-accent-fill peer-checked:text-cs-on-accent peer-focus-visible:border-cs-accent-border sm:w-auto">
                    {levelLabel}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <p role="status" aria-live="polite" className="mt-5 text-sm text-cs-muted">
          {t.courses.resultCount(filteredCourses.length)}
        </p>
      </section>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2">
        {filteredCourses.map((course) => {
          const { lessonCount, checkpointCount } = courseStepCounts(course.structure)
          const copy = course.copies[locale] ?? course.copies[course.structure.defaultLocale]
          const detailLocale = courseLinkLocale(course, locale)
          if (!copy) return null

          return (
            <li key={course.structure.slug} className="min-w-0">
              <Link
                href={`/courses/${course.structure.slug}/${detailLocale}`}
                data-testid={`catalogue-card-${course.structure.slug}`}
                className="card-feature card-interactive block h-full overflow-hidden"
              >
                <CourseCover structure={course.structure} />
                <div className="p-6">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-cs-muted">
                    {t.courses.level[course.structure.level]} · {t.courses.lessons(lessonCount)} · {t.courses.checkpoints(checkpointCount)}
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold text-cs-text">{copy.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-cs-body">{copy.subtitle}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      {filteredCourses.length === 0 && (
        <section aria-labelledby="catalog-no-results-heading" className="mt-8 border-l-2 border-cs-accent px-5 py-1">
          <h2 id="catalog-no-results-heading" className="font-display text-xl font-semibold text-cs-text">
            {t.courses.noResultsHeading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-body">{t.courses.noResultsBody}</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setLevelFilter('all')
            }}
            className="mt-5 inline-flex rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
          >
            {t.courses.clearFilters}
          </button>
        </section>
      )}

      <p className="mt-10 text-sm text-cs-muted">{t.courses.openToAll}</p>
    </div>
  )
}
