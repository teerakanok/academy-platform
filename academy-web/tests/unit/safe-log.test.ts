import { describe, expect, it } from 'vitest'
import { safeErrorMessage } from '@/lib/safe-log'

describe('safeErrorMessage', () => {
  it('keeps only fixed categories without raw upstream messages or objects', () => {
    expect(safeErrorMessage(new Error('database unavailable token=SENTINEL'))).toBe('operation_failed')
    expect(safeErrorMessage({ message: 'sensitive SENTINEL', token: 'secret-token' })).toBe('unknown_error')
    expect(safeErrorMessage('cookie=SENTINEL')).toBe('operation_failed')
    expect(safeErrorMessage(new TypeError('SENTINEL'))).toBe('type_error')
    expect(safeErrorMessage({ get message() { throw new Error('SENTINEL') } })).toBe('unknown_error')
  })

  it('bounds unexpected values to a generic string', () => {
    expect(safeErrorMessage({ token: 'secret-token' })).toBe('unknown_error')
    expect(safeErrorMessage(null)).toBe('unknown_error')
  })
})
