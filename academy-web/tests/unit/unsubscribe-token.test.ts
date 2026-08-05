import { describe, expect, it } from 'vitest'
import { unsubscribeTokenFromFragment } from '@/lib/unsubscribe-token'

describe('unsubscribe token fragment contract', () => {
  it('accepts only a UUID carried in the URL fragment', () => {
    expect(unsubscribeTokenFromFragment('#4b0f42d8-5cce-4c7b-9662-865e2289c144')).toBe(
      '4b0f42d8-5cce-4c7b-9662-865e2289c144',
    )
  })

  it('rejects malformed values and query-style fragments', () => {
    const queryStyleValue = '4b0f42d8-5cce-4c7b-9662-865e2289c144'

    expect(unsubscribeTokenFromFragment('')).toBeNull()
    expect(unsubscribeTokenFromFragment(`#token=${queryStyleValue}`)).toBeNull()
    expect(unsubscribeTokenFromFragment('#not-a-token')).toBeNull()
  })
})
