import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMediaSessionDigest, issueMediaGrant } from '@/lib/media/grant'
import { MEDIA_DELIVERY_COOKIE } from '@/lib/media/cookie'
import { MEDIA_AUTHORIZATION_PROBE_HEADER } from '@/lib/media/authorization-probe'
import { servePrivateMedia, type PrivateMediaAuthorizer } from '@/lib/media/worker-delivery'
import { createOpenNextMediaAuthorizer } from '@/lib/media/open-next-authorizer'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  authorizeCourseResource: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }))
vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/account/course-access', () => ({
  authorizeCourseResource: mocks.authorizeCourseResource,
  deniedAccessStatus: vi.fn((access: { reason: string }) => {
    if (access.reason === 'unavailable') return 503
    return access.reason === 'retired' ? 404 : 403
  }),
}))

import { GET, HEAD } from '@/app/(site)/course-media/[assetId]/route'

const SECRET = 'test-only-media-signing-secret-32-bytes-minimum'
const SESSION_ID = 'D'.repeat(43)

function bucket() {
  return {
    get: vi.fn(async () => ({
      body: new Blob(['PDF']).stream(),
      size: 3,
      httpEtag: '"etag"',
      writeHttpMetadata() {},
    })),
  }
}

function authorized() {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

async function grant() {
  return issueMediaGrant({
    assetId: 'formats-handout',
    courseSlug: 'content-formats-demo',
    nodeId: 'formats-references',
    expiresAt: Math.floor(Date.now() / 1_000) + 300,
    sessionIdDigest: await createMediaSessionDigest(SESSION_ID),
  }, SECRET)
}

function request(options: { method?: string; probe?: boolean; session?: boolean; grantValue?: string | null } = {}) {
  const headers = new Headers()
  const grantValue = options.grantValue === undefined ? undefined : options.grantValue
  if (grantValue) headers.set('cookie', `${MEDIA_DELIVERY_COOKIE}=${grantValue}`)
  if (options.session ?? true) {
    headers.set('cookie', `${headers.get('cookie') ? `${headers.get('cookie')}; ` : ''}__Host-academy_session=${SESSION_ID}`)
  }
  if (options.probe) headers.set(MEDIA_AUTHORIZATION_PROBE_HEADER, '1')
  return new NextRequest('http://127.0.0.1/course-media/formats-handout', {
    method: options.method ?? 'GET',
    headers,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('private media authorization revalidation', () => {
  it('requires an authorizer and fails closed without R2', async () => {
    const media = bucket()
    const response = await servePrivateMedia(
      request({ session: false, grantValue: await grant() }),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
      undefined as unknown as PrivateMediaAuthorizer,
    )

    expect(response?.status).toBe(503)
    expect(media.get).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'redirect', status: 307 },
    { label: 'dependency error', status: 503 },
    { label: '204 without no-store', status: 204 },
  ])('denies a non-exact authorization probe for $label before R2', async ({ status }) => {
    const media = bucket()
    const response = await servePrivateMedia(
      request({ grantValue: await grant() }),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
      async () => new Response(null, { status }),
    )

    expect(response?.status).toBe(403)
    expect(media.get).not.toHaveBeenCalled()
  })

  it('fails closed when the authoritative authorizer throws before R2', async () => {
    const media = bucket()
    const response = await servePrivateMedia(
      request({ grantValue: await grant() }),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
      async () => {
        throw new Error('authoritative dependency failed')
      },
    )

    expect(response?.status).toBe(503)
    expect(media.get).not.toHaveBeenCalled()
  })

  it('reads R2 only after the exact no-store 204 authorization result', async () => {
    const media = bucket()
    const authorizer = vi.fn(async () => authorized())
    const response = await servePrivateMedia(
      request({ grantValue: await grant() }),
      { MEDIA_SIGNING_SECRET: SECRET, COURSE_MEDIA: media },
      authorizer,
    )

    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe('PDF')
    expect(authorizer).toHaveBeenCalledTimes(1)
    expect(media.get).toHaveBeenCalledTimes(1)
  })

  it('builds a bounded local HEAD probe and strips its range without fetching an external URL', async () => {
    const source = new Request('https://academy.test/course-media/formats-handout', {
      method: 'GET',
      headers: { range: 'bytes=0-1', [MEDIA_AUTHORIZATION_PROBE_HEADER]: 'forged' },
    })
    const observed: Request[] = []
    const response = await createOpenNextMediaAuthorizer(
      (probe) => {
        observed.push(probe)
        return authorized()
      },
      {},
      {},
    )(source)

    expect(response.status).toBe(204)
    expect(observed).toHaveLength(1)
    expect(observed[0].method).toBe('HEAD')
    expect(observed[0].url).toBe(source.url)
    expect(observed[0].headers.get(MEDIA_AUTHORIZATION_PROBE_HEADER)).toBe('1')
    expect(observed[0].headers.get('range')).toBeNull()
    expect(source.headers.get(MEDIA_AUTHORIZATION_PROBE_HEADER)).toBe('forged')
  })

  it('fails closed when the local OpenNext authorization probe times out', async () => {
    vi.useFakeTimers()
    const source = new Request('https://academy.test/course-media/formats-handout', {
      headers: { range: 'bytes=0-1' },
    })
    const pending = createOpenNextMediaAuthorizer(
      () => new Promise<Response>(() => {}),
      {},
      {},
      10,
    )(source)
    const assertion = expect(pending).rejects.toThrow('media authorization timeout')
    await vi.advanceTimersByTimeAsync(10)
    await assertion
  })

  it('does not let an externally supplied probe header bypass a revoked Academy session locally', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)
    vi.stubEnv('MEDIA_LOCAL_ROOT', '/tmp/academy-media')
    mocks.currentUser.mockResolvedValue(null)

    const response = await GET(request({ probe: true, grantValue: await grant() }), {
      params: Promise.resolve({ assetId: 'formats-handout' }),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it.each([
    { reason: 'retired', status: 404 },
    { reason: 'not-entitled', status: 403 },
    { reason: 'unavailable', status: 503 },
  ])('rechecks current course authorization for $reason before local bytes', async ({ reason, status }) => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)
    vi.stubEnv('MEDIA_LOCAL_ROOT', '/tmp/academy-media')
    mocks.currentUser.mockResolvedValue({ account: { id: 'learner-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: false, reason })

    const response = await GET(request({ grantValue: await grant() }), {
      params: Promise.resolve({ assetId: 'formats-handout' }),
    })

    expect(response.status).toBe(status)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('returns an exact no-store 204 only after local route authorization succeeds', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)
    mocks.currentUser.mockResolvedValue({ account: { id: 'learner-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: true })

    const response = await HEAD(request({ probe: true, grantValue: await grant() }), {
      params: Promise.resolve({ assetId: 'formats-handout' }),
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('rechecks authorization before serving local bytes with a valid grant', async () => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', SECRET)
    vi.stubEnv('MEDIA_LOCAL_ROOT', '/tmp/academy-media')
    mocks.currentUser.mockResolvedValue({ account: { id: 'learner-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: true })
    mocks.readFile.mockResolvedValue(new Uint8Array([80, 68, 70]))

    const response = await GET(request({ grantValue: await grant() }), {
      params: Promise.resolve({ assetId: 'formats-handout' }),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('PDF')
    expect(mocks.currentUser).toHaveBeenCalledTimes(1)
    expect(mocks.authorizeCourseResource).toHaveBeenCalledWith(
      'learner-1',
      'content-formats-demo',
      'formats-references',
    )
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })
})
