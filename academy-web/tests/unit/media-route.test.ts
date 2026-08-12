import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  authorizeCourseResource: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/account/course-access', () => ({ authorizeCourseResource: mocks.authorizeCourseResource }))

import { GET } from '@/app/(site)/course-media/[assetId]/route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('course-media authorization route', () => {
  it('issues only a path-scoped HttpOnly cookie then redirects to a clean asset path', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', 'test-only-media-signing-secret-32-bytes-minimum')
    mocks.currentUser.mockResolvedValue({ account: { id: 'learner-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: true })

    const response = await GET(new NextRequest('http://127.0.0.1/course-media/formats-handout'), {
      params: Promise.resolve({ assetId: 'formats-handout' }),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/course-media/formats-handout')
    expect(response.headers.get('set-cookie')).toMatch(/academy_media_grant=/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(response.headers.get('set-cookie')).toContain('Path=/course-media/formats-handout')
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i)
    expect(response.headers.get('set-cookie')).not.toContain('token=')
    expect(mocks.authorizeCourseResource).toHaveBeenCalledWith(
      'learner-1',
      'content-formats-demo',
      'formats-references',
    )
  })

  it('does not authorize or set a cookie for an unknown asset path', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', 'test-only-media-signing-secret-32-bytes-minimum')

    const response = await GET(new NextRequest('http://127.0.0.1/course-media/not-an-asset'), {
      params: Promise.resolve({ assetId: 'not-an-asset' }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.currentUser).not.toHaveBeenCalled()
  })
})
