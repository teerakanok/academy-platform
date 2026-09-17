import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getCourseAccess: vi.fn(),
  enrolFreeCourse: vi.fn(),
  requireEffectiveCourseVisibility: vi.fn(),
  checkAuthenticatedMutationQuota: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/account/course-access', () => ({ getCourseAccess: mocks.getCourseAccess }))
vi.mock('@/lib/account/free-enrolment', () => ({ enrolFreeCourse: mocks.enrolFreeCourse }))
vi.mock('@/lib/course/settings', () => ({ requireEffectiveCourseVisibility: mocks.requireEffectiveCourseVisibility }))
vi.mock('@/lib/authenticated-mutation-quota', () => ({
  checkAuthenticatedMutationQuota: mocks.checkAuthenticatedMutationQuota,
}))

import { GET, POST } from '@/app/(site)/api/courses/[slug]/enrol/route'

const ORIGIN = 'https://academy.cyberskills.co.th'

function enrolRequest(
  slug: string,
  { origin = ORIGIN, body = '{"locale":"th"}', contentType = 'application/json', fetchSite }: {
    origin?: string | null
    body?: string
    contentType?: string
    fetchSite?: string
  } = {},
) {
  const headers: Record<string, string> = { host: 'academy.cyberskills.co.th', 'content-type': contentType }
  if (origin) headers.origin = origin
  if (fetchSite) headers['sec-fetch-site'] = fetchSite
  return new Request(`${ORIGIN}/api/courses/${slug}/enrol`, { method: 'POST', headers, body })
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe('POST /api/courses/[slug]/enrol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    mocks.getCourseAccess.mockResolvedValue({ allowed: false, reason: 'not-entitled' })
    mocks.requireEffectiveCourseVisibility.mockResolvedValue('published')
    mocks.checkAuthenticatedMutationQuota.mockResolvedValue({ allowed: true })
    mocks.enrolFreeCourse.mockResolvedValue({ ok: true, changed: true })
  })

  it('enrols a signed-in learner in a published free course and points at the learn page', async () => {
    const response = await POST(enrolRequest('git-essentials'), params('git-essentials'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      enrolled: true,
      changed: true,
      next: '/courses/git-essentials/learn?lang=th',
    })
    expect(mocks.enrolFreeCourse).toHaveBeenCalledWith('user-1', 'git-essentials')
    expect(mocks.checkAuthenticatedMutationQuota).toHaveBeenCalledWith({
      operation: 'learner-enrol',
      accountId: 'user-1',
      courseSlug: 'git-essentials',
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('refuses a cross-origin request before reading the session or touching the database', async () => {
    const response = await POST(enrolRequest('git-essentials', { origin: 'https://evil.example' }), params('git-essentials'))
    expect(response.status).toBe(403)
    expect(mocks.currentUser).not.toHaveBeenCalled()
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('refuses a request with neither Origin nor same-origin fetch metadata', async () => {
    const crossSite = await POST(enrolRequest('git-essentials', { origin: null, fetchSite: 'cross-site' }), params('git-essentials'))
    const missing = await POST(enrolRequest('git-essentials', { origin: null }), params('git-essentials'))
    expect(crossSite.status).toBe(403)
    expect(missing.status).toBe(403)
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('refuses a form-encoded (simple CORS) body', async () => {
    const response = await POST(
      enrolRequest('git-essentials', { contentType: 'application/x-www-form-urlencoded', body: 'locale=th' }),
      params('git-essentials'),
    )
    expect(response.status).toBe(415)
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('refuses a free course that is not effectively published (admin unpublished or retired)', async () => {
    for (const visibility of ['unpublished', 'retired']) {
      mocks.requireEffectiveCourseVisibility.mockResolvedValueOnce(visibility)
      const response = await POST(enrolRequest('git-essentials'), params('git-essentials'))
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ ok: false, reason: 'not-published' })
    }
    expect(mocks.requireEffectiveCourseVisibility).toHaveBeenCalledWith('syllabus-preview', 'git-essentials')
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('fails closed when course visibility cannot be read', async () => {
    mocks.requireEffectiveCourseVisibility.mockRejectedValueOnce(new Error('settings store down'))
    const response = await POST(enrolRequest('git-essentials'), params('git-essentials'))
    expect(response.status).toBe(503)
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('never calls the RPC for a course without a free offer (internal cert course)', async () => {
    const response = await POST(enrolRequest('cissp'), params('cissp'))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ ok: false, reason: 'not-free' })
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('requires a session and an existing course', async () => {
    mocks.currentUser.mockResolvedValueOnce(null)
    expect((await POST(enrolRequest('git-essentials'), params('git-essentials'))).status).toBe(401)
    expect((await POST(enrolRequest('no-such-course'), params('no-such-course'))).status).toBe(404)
    expect((await POST(enrolRequest('Bad%20Slug'), params('Bad Slug'))).status).toBe(404)
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('rejects unexpected body fields', async () => {
    const response = await POST(enrolRequest('git-essentials', { body: '{"userId":"someone-else"}' }), params('git-essentials'))
    expect(response.status).toBe(400)
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('is a no-op for an already enrolled learner', async () => {
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: true })
    const response = await POST(enrolRequest('git-essentials', { body: '{}' }), params('git-essentials'))
    expect(await response.json()).toEqual({
      ok: true,
      enrolled: true,
      changed: false,
      next: '/courses/git-essentials/learn?lang=en',
    })
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('does not enrol an account whose Academy activation is not active', async () => {
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'inactive' })
    const response = await POST(enrolRequest('git-essentials'), params('git-essentials'))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ reason: 'inactive' })
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('maps database refusals without claiming success', async () => {
    mocks.enrolFreeCourse.mockResolvedValueOnce({ ok: false, reason: 'not-free' })
    expect((await POST(enrolRequest('git-essentials'), params('git-essentials'))).status).toBe(403)
    mocks.enrolFreeCourse.mockResolvedValueOnce({ ok: false, reason: 'revoked' })
    expect((await POST(enrolRequest('git-essentials'), params('git-essentials'))).status).toBe(403)
    mocks.enrolFreeCourse.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
    expect((await POST(enrolRequest('git-essentials'), params('git-essentials'))).status).toBe(503)
  })

  it('applies the authenticated mutation quota', async () => {
    mocks.checkAuthenticatedMutationQuota.mockResolvedValueOnce({ allowed: false, status: 429, retryAfterSeconds: 42 })
    const response = await POST(enrolRequest('git-essentials'), params('git-essentials'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })
})

describe('GET /api/courses/[slug]/enrol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    mocks.requireEffectiveCourseVisibility.mockResolvedValue('published')
  })

  const get = (slug: string) => GET(new Request(`${ORIGIN}/api/courses/${slug}/enrol`), params(slug))

  it('reports one state per learner situation without mutating', async () => {
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: true })
    expect(await (await get('git-essentials')).json()).toEqual({ ok: true, state: 'enrolled' })
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'not-entitled' })
    expect(await (await get('git-essentials')).json()).toEqual({ ok: true, state: 'can-enrol-free' })
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'inactive' })
    expect(await (await get('git-essentials')).json()).toEqual({ ok: true, state: 'inactive' })
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'not-entitled' })
    expect(await (await get('cissp')).json()).toEqual({ ok: true, state: 'not-offered' })
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'not-entitled' })
    mocks.requireEffectiveCourseVisibility.mockResolvedValueOnce('unpublished')
    expect(await (await get('git-essentials')).json()).toEqual({ ok: true, state: 'not-offered' })
    expect(mocks.enrolFreeCourse).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    mocks.currentUser.mockResolvedValueOnce(null)
    expect((await get('git-essentials')).status).toBe(401)
  })
})
