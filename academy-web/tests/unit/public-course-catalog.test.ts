import { describe, expect, it } from 'vitest'
import { catalogLocaleNavigationTarget } from '@/components/course/PublicCourseCatalog'

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
