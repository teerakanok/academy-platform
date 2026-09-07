import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMediaSessionDigest, verifyMediaGrantSignature } from '@/lib/media/grant'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  authorizeCourseResource: vi.fn(),
}))

const SECRET = 'test-only-media-signing-secret-32-bytes-minimum'
const SESSION_ID = 'C'.repeat(43)

async function issueLegacyUnboundGrant(): Promise<string> {
  const payload = btoa(JSON.stringify({
    assetId: 'formats-handout',
    courseSlug: 'content-formats-demo',
    nodeId: 'formats-references',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${payload}.${encodedSignature}`
}

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

    const response = await GET(new NextRequest('http://127.0.0.1/course-media/formats-handout', {
      headers: { cookie: `academy_session=${SESSION_ID}` },
    }), {
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
    const grant = await verifyMediaGrantSignature(
      response.cookies.get('academy_media_grant')?.value ?? '',
      SECRET,
    )
    expect(grant?.sessionIdDigest).toBe(await createMediaSessionDigest(SESSION_ID))
    expect(response.cookies.get('academy_media_grant')!.value.split('.')[0]).not.toContain(SESSION_ID)
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

  it('requires a verified Academy session before issuing a grant', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)

    for (const cookie of ['', 'academy_session=short', `academy_session=${SESSION_ID}; academy_session=${SESSION_ID}`]) {
      const response = await GET(new NextRequest('http://127.0.0.1/course-media/formats-handout', {
        headers: cookie ? { cookie } : undefined,
      }), { params: Promise.resolve({ assetId: 'formats-handout' }) })

      expect(response.status).toBe(401)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    expect(mocks.currentUser).not.toHaveBeenCalled()
  })

  it('reauthorizes an old unbound grant and issues a session-bound replacement', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)
    mocks.currentUser.mockResolvedValue({ account: { id: 'learner-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: true })

    const response = await GET(new NextRequest('http://127.0.0.1/course-media/formats-handout', {
      headers: { cookie: `academy_session=${SESSION_ID}; academy_media_grant=${await issueLegacyUnboundGrant()}` },
    }), { params: Promise.resolve({ assetId: 'formats-handout' }) })

    expect(response.status).toBe(307)
    const replacement = await verifyMediaGrantSignature(
      response.cookies.get('academy_media_grant')?.value ?? '',
      SECRET,
    )
    expect(replacement?.sessionIdDigest).toBe(await createMediaSessionDigest(SESSION_ID))
  })
})
