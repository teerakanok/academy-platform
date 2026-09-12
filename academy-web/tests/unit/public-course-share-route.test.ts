import { describe, expect, it } from 'vitest'
import { dynamic } from '@/app/(site)/courses/[slug]/share/[locale]/route'

describe('public course share-image route', () => {
  it('resolves public course visibility at request time', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})
