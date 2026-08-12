import { describe, expect, it } from 'vitest'
import { courseLocaleNavigationTarget } from '@/components/course/CourseLocaleChromeSync'

describe('courseLocaleNavigationTarget', () => {
  it('uses a saved locale only when the public course can serve it', () => {
    expect(
      courseLocaleNavigationTarget({
        availableLocales: ['en', 'th'],
        courseLocale: 'en',
        uiLocale: 'th',
        localeParameterPresent: false,
      }),
    ).toBe('th')

    expect(
      courseLocaleNavigationTarget({
        availableLocales: ['en'],
        courseLocale: 'en',
        uiLocale: 'th',
        localeParameterPresent: false,
      }),
    ).toBe('en')
  })

  it('normalizes an explicit unsupported locale to the locale actually served', () => {
    expect(
      courseLocaleNavigationTarget({
        availableLocales: ['en'],
        courseLocale: 'en',
        requestedLocale: 'th',
        uiLocale: 'th',
        localeParameterPresent: true,
      }),
    ).toBe('en')
  })

  it('normalizes a malformed locale parameter instead of treating it as a bare URL', () => {
    expect(
      courseLocaleNavigationTarget({
        availableLocales: ['en', 'th'],
        courseLocale: 'en',
        uiLocale: 'th',
        localeParameterPresent: true,
      }),
    ).toBe('en')
  })
})
