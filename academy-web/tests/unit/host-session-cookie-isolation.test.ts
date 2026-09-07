import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import {
  academySessionCookie,
  expireAcademySessionCookie,
  parseAcademySessionCookie,
} from '@/lib/identity/session-store'
import { parseAcademySessionCookie as parseMediaSessionCookie } from '@/lib/media/cookie'
import { middleware } from '@/middleware'

const sessionId = 'A'.repeat(43)

afterEach(() => vi.unstubAllEnvs())

describe('production browser session cookie isolation', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))

  it('issues and expires browser-enforced host-only session cookies', () => {
    const issued = academySessionCookie(sessionId, { maxAge: 900 })
    expect(issued).toBe([
      `__Host-academy_session=${sessionId}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Secure',
      'Max-Age=900',
    ].join('; '))

    const expired = expireAcademySessionCookie()
    expect(expired).toBe('__Host-academy_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0')
  })

  it('rejects legacy bearer authority and malformed or duplicate names', () => {
    expect(parseAcademySessionCookie(`academy_session=${sessionId}`)).toBeNull()
    expect(parseAcademySessionCookie(`__Host-academy_session=${sessionId}`)).toBe(sessionId)
    expect(parseAcademySessionCookie(`__Host-academy_session=${sessionId}; __Host-academy_session=${sessionId}`)).toBeNull()
    expect(parseAcademySessionCookie(`__Host-academy_session=${sessionId}; __Host-academy_session=short`)).toBeNull()
    expect(parseAcademySessionCookie(`__Host-academy_session=${sessionId}; __Host-academy_session`)).toBeNull()
    expect(parseAcademySessionCookie(`academy_session=${sessionId}; __Host-academy_session=${sessionId}`)).toBe(sessionId)

    expect(parseMediaSessionCookie(new Headers({ cookie: `academy_session=${sessionId}` }))).toBeNull()
    expect(parseMediaSessionCookie(new Headers({ cookie: `__Host-academy_session=${sessionId}` }))).toBe(sessionId)
  })

  it('uses the same accepted session in middleware and rejects an injected legacy cookie', async () => {
    const protectedRequest = new NextRequest('https://academy.cyberskills.co.th/dashboard', {
      headers: { cookie: `__Host-academy_session=${sessionId}; academy_session=${'B'.repeat(43)}` },
    })
    await expect(middleware(protectedRequest)).resolves.toMatchObject({ status: 200 })

    const legacyRequest = new NextRequest('https://academy.cyberskills.co.th/dashboard', {
      headers: { cookie: `academy_session=${sessionId}` },
    })
    const response = await middleware(legacyRequest)
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in')
  })
})
