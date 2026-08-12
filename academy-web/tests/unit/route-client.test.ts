import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAll = vi.fn()
const deleteCookie = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll, delete: deleteCookie })),
}))

import { clearRouteAuthCookies, safeNextPath } from '@/lib/auth/route-client'

describe('route auth cookies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expire auth cookies ทุกก้อนโดยไม่แตะ cookie อื่น', async () => {
    getAll.mockReturnValue([
      { name: 'sb-project-auth-token', value: 'token' },
      { name: 'sb-project-auth-token.0', value: 'part-0' },
      { name: 'academy-locale', value: 'th' },
    ])

    await clearRouteAuthCookies()

    expect(deleteCookie.mock.calls).toEqual([
      ['sb-project-auth-token'],
      ['sb-project-auth-token.0'],
    ])
  })

  it('rejects browser-normalized cross-origin return paths', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\n/evil.example',
      '/\t/evil.example',
    ]) {
      expect(safeNextPath(value)).toBe('/dashboard')
    }
    expect(safeNextPath('/courses/basic-os-linux/learn?lang=th#progress'))
      .toBe('/courses/basic-os-linux/learn?lang=th#progress')
  })
})
