import { describe, expect, it } from 'vitest'
import {
  catalogLocaleNavigationTarget,
  filterPublicCourseCatalog,
} from '@/components/course/PublicCourseCatalog'
import type { Locale, PublicCourseCatalogItem } from '@/lib/content/course-types'

function makeCourse(
  slug: string,
  level: PublicCourseCatalogItem['structure']['level'],
  copies: PublicCourseCatalogItem['copies'],
): PublicCourseCatalogItem {
  const availableLocales: Locale[] = ['en']
  if ('th' in copies) {
    availableLocales.push('th')
  }

  return {
    structure: {
      slug,
      defaultLocale: 'en',
      availableLocales,
      level,
      estimatedMinutes: 60,
      nodes: [],
    },
    copies,
  }
}

const courses = [
  makeCourse('linux', 'beginner', {
    en: { title: 'Basic OS & Linux', subtitle: 'Foundations for security work' },
    th: { title: 'พื้นฐานระบบปฏิบัติการ', subtitle: 'จุดเริ่มต้นสำหรับงานความปลอดภัย' },
  }),
  makeCourse('network', 'intermediate', {
    en: { title: 'Network Defense', subtitle: 'Read traffic and respond' },
  }),
  makeCourse('threat', 'advanced', {
    en: { title: 'Threat Hunting', subtitle: 'Follow evidence across systems' },
    th: { title: 'ล่าภัยคุกคาม', subtitle: 'ตามหลักฐานข้ามระบบ' },
  }),
]

describe('catalogLocaleNavigationTarget', () => {
  it('keeps a supported explicit locale and carries a saved locale into a bare catalog URL', () => {
    expect(catalogLocaleNavigationTarget({ rawLocales: ['th'], uiLocale: 'en' })).toBeNull()
    expect(catalogLocaleNavigationTarget({ rawLocales: [], uiLocale: 'th' })).toBe('th')
  })

  it('normalizes an unsupported locale parameter to the static catalog default', () => {
    expect(catalogLocaleNavigationTarget({ rawLocales: ['de'], uiLocale: 'th' })).toBe('en')
  })

  it('normalizes duplicate locale parameters to one default locale', () => {
    expect(catalogLocaleNavigationTarget({ rawLocales: ['th', 'de'], uiLocale: 'th' })).toBe('en')
  })
})

describe('filterPublicCourseCatalog', () => {
  it('searches the title and subtitle in the active locale', () => {
    expect(filterPublicCourseCatalog({ courses, locale: 'th', query: 'ภัยคุกคาม', level: 'all' }).map((course) => course.structure.slug))
      .toEqual(['threat'])
    expect(filterPublicCourseCatalog({ courses, locale: 'en', query: 'traffic', level: 'all' }).map((course) => course.structure.slug))
      .toEqual(['network'])
  })

  it('normalizes letter case and surrounding whitespace', () => {
    expect(filterPublicCourseCatalog({ courses, locale: 'en', query: '  BASIC os  ', level: 'all' }).map((course) => course.structure.slug))
      .toEqual(['linux'])
  })

  it('falls back to the course default locale exactly as the catalog renders it', () => {
    const network = courses[1]

    expect(filterPublicCourseCatalog({ courses: [network], locale: 'th', query: 'network defense', level: 'all' }))
      .toEqual([network])
    expect(filterPublicCourseCatalog({ courses: [network], locale: 'th', query: 'การป้องกันเครือข่าย', level: 'all' }))
      .toEqual([])
  })

  it('filters by level and preserves the input order', () => {
    expect(filterPublicCourseCatalog({ courses: [...courses].reverse(), locale: 'en', query: '', level: 'beginner' }).map((course) => course.structure.slug))
      .toEqual(['linux'])
    expect(filterPublicCourseCatalog({ courses: [...courses].reverse(), locale: 'en', query: '', level: 'advanced' }).map((course) => course.structure.slug))
      .toEqual(['threat'])
  })

  it('composes query and level filters', () => {
    expect(filterPublicCourseCatalog({ courses, locale: 'en', query: 'systems', level: 'advanced' }).map((course) => course.structure.slug))
      .toEqual(['threat'])
    expect(filterPublicCourseCatalog({ courses, locale: 'en', query: 'systems', level: 'intermediate' }))
      .toEqual([])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterPublicCourseCatalog({ courses, locale: 'en', query: 'container', level: 'all' }))
      .toEqual([])
  })
})
