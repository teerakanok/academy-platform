import { describe, expect, it } from 'vitest'
import { languageNavigationTarget } from '@/components/i18n/LanguageToggle'
import { requestedUiLocale } from '@/components/i18n/LocaleProvider'

describe('language navigation', () => {
  it('switches only the terminal locale segment on a public course URL', () => {
    expect(languageNavigationTarget(
      '/courses/basic-os-linux/en',
      'https://academy.test/courses/basic-os-linux/en?lang=en&utm_source=course#roadmap',
      'th',
    )).toEqual({
      href: '/courses/basic-os-linux/th?utm_source=course#roadmap',
      method: 'replace',
    })
  })

  it('keeps protected learner routes and changes only their locale query', () => {
    expect(languageNavigationTarget(
      '/courses/basic-os-linux/learn',
      'https://academy.test/courses/basic-os-linux/learn?lang=en&utm_source=dashboard#course-progress',
      'th',
    )).toEqual({
      href: '/courses/basic-os-linux/learn?lang=th&utm_source=dashboard#course-progress',
      method: 'replace',
    })
    expect(languageNavigationTarget(
      '/courses/basic-os-linux/lessons/permissions',
      'https://academy.test/courses/basic-os-linux/lessons/permissions?lang=en#checkpoint',
      'th',
    )).toEqual({
      href: '/courses/basic-os-linux/lessons/permissions?lang=th#checkpoint',
      method: 'replace',
    })
  })

  it('updates the catalog query and routes an English-only root to a translated surface', () => {
    expect(languageNavigationTarget(
      '/courses',
      'https://academy.test/courses?lang=en&utm_source=nav#main',
      'th',
    )).toEqual({
      href: '/courses?lang=th&utm_source=nav#main',
      method: 'assign',
    })
    expect(languageNavigationTarget(
      '/',
      'https://academy.test/?utm_source=nav',
      'th',
    )).toEqual({
      href: '/courses?lang=th&utm_source=nav',
      method: 'assign',
    })
  })

  it('uses an exact locale query only on translated routes', () => {
    expect(requestedUiLocale('/courses/basic-os-linux/learn', '?lang=th')).toBe('th')
    expect(requestedUiLocale('/access-required', '?lang=th')).toBe('th')
    expect(requestedUiLocale('/courses', '?lang=en&lang=th')).toBeNull()
    expect(requestedUiLocale('/', '?lang=th')).toBeNull()
  })
})
