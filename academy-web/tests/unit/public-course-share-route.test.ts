import { describe, expect, it } from 'vitest'
import { generateStaticParams } from '@/app/(site)/courses/[slug]/share/[locale]/route'

describe('public course share-image route', () => {
  it('pre-renders each available locale of public courses only', () => {
    expect(generateStaticParams()).toEqual([
      { slug: 'basic-os-linux', locale: 'en' },
      { slug: 'basic-os-linux', locale: 'th' },
    ])
  })
})
