import { describe, expect, it } from 'vitest'
import { safeErrorMessage } from '@/lib/safe-log'

describe('safeErrorMessage', () => {
  it('keeps ordinary Error messages without serializing raw objects', () => {
    expect(safeErrorMessage(new Error('database unavailable'))).toBe('database unavailable')
    expect(safeErrorMessage({ message: 'rate limit failed', token: 'secret-token' })).toBe('rate limit failed')
  })

  it('bounds unexpected values to a generic string', () => {
    expect(safeErrorMessage({ token: 'secret-token' })).toBe('unknown_error')
    expect(safeErrorMessage(null)).toBe('unknown_error')
  })
})
