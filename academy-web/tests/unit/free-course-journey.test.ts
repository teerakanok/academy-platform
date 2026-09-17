import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getCourseAccess: vi.fn(),
  authorizeCourseResource: vi.fn(),
  resolveCourseAvailability: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { target })
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/account/course-access', () => ({
  getCourseAccess: mocks.getCourseAccess,
  authorizeCourseResource: mocks.authorizeCourseResource,
}))
vi.mock('@/lib/course/settings', () => ({ resolveCourseAvailability: mocks.resolveCourseAvailability }))

import { AccessRequiredView } from '@/components/course/AccessRequiredView'
import { readFreeEnrolmentState } from '@/components/course/CourseExperience'
import { PublicCourseSyllabus } from '@/components/course/PublicCourseSyllabus'
import FreeCourseStartPage from '@/app/(site)/courses/[slug]/start/page'
import AccessRequiredPage from '@/app/(site)/access-required/page'
import { getCourse } from '@/lib/content/course-source'
import { toPublicCourse } from '@/lib/content/public-course'

async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    const target = (error as { target?: string }).target
    if (target) return target
    throw error
  }
  throw new Error('expected a redirect')
}

describe('course overview primary button', () => {
  it('shows "เริ่มเรียนฟรี" for a free course and starts through the single start path', () => {
    const page = renderToStaticMarkup(createElement(PublicCourseSyllabus, toPublicCourse(getCourse('basic-os-linux', 'th')!)))
    expect(page).toContain('data-testid="course-primary-cta"')
    expect(page).toContain('href="/courses/basic-os-linux/start?lang=th"')
    expect(page).toContain('เริ่มเรียนฟรี')
    expect(page).toContain('เรียนฟรีด้วยบัญชี CYBERSKILLS')
    expect(page).not.toContain('เมื่อเปิดให้ใช้งาน')
  })

  it('English copy for the same state', () => {
    const page = renderToStaticMarkup(createElement(PublicCourseSyllabus, toPublicCourse(getCourse('git-essentials', 'en')!)))
    expect(page).toContain('href="/courses/git-essentials/start?lang=en"')
    expect(page).toContain('Start for free')
  })

  it('keeps today\'s page, with no enrol button, for a course that is not free', () => {
    const page = renderToStaticMarkup(createElement(PublicCourseSyllabus, toPublicCourse(getCourse('cissp')!)))
    expect(page).not.toContain('course-primary-cta')
    expect(page).not.toContain('/start?')
    expect(page).toContain('Learn with an account when access opens')
  })

  it('stays on the free button only when the enrol endpoint says the learner can enrol', async () => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
    expect(await readFreeEnrolmentState(reply(200, { ok: true, state: 'can-enrol-free' }))).toBe('can-enrol-free')
    expect(await readFreeEnrolmentState(reply(200, { ok: true, state: 'enrolled' }))).toBe('other')
    expect(await readFreeEnrolmentState(reply(200, { ok: true, state: 'inactive' }))).toBe('other')
    expect(await readFreeEnrolmentState(reply(503, { ok: false }))).toBe('other')
  })
})

describe('/courses/[slug]/start', () => {
  const run = (slug: string, lang?: string) => () =>
    FreeCourseStartPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ lang }) })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    mocks.getCourseAccess.mockResolvedValue({ allowed: false, reason: 'not-entitled' })
  })

  it('sends a signed-out visitor to sign-in and brings them back to the same start path', async () => {
    mocks.currentUser.mockResolvedValueOnce(null)
    expect(await redirectTarget(run('basic-os-linux', 'th')))
      .toBe('/sign-in?next=%2Fcourses%2Fbasic-os-linux%2Fstart%3Flang%3Dth')
  })

  it('sends an already enrolled learner straight to the learn page', async () => {
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: true })
    expect(await redirectTarget(run('basic-os-linux', 'th'))).toBe('/courses/basic-os-linux/learn?lang=th')
  })

  it('sends an inactive account to the honest access page instead of trying to enrol', async () => {
    mocks.getCourseAccess.mockResolvedValueOnce({ allowed: false, reason: 'inactive' })
    expect(await redirectTarget(run('basic-os-linux', 'en'))).toBe('/access-required?course=basic-os-linux&lang=en')
  })

  it('renders the automatic enrol step for a signed-in, not-enrolled learner', async () => {
    const element = await run('basic-os-linux', 'th')()
    const markup = renderToStaticMarkup(element as React.ReactElement)
    expect(markup).toContain('data-testid="free-course-start"')
    expect(markup).toContain('กำลังเพิ่ม')
  })

  it('does not exist for a course that is not free', async () => {
    await expect(run('cissp')()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.currentUser).not.toHaveBeenCalled()
  })
})

describe('/access-required for a not-enrolled learner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' } })
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: false, reason: 'not-entitled' })
    mocks.resolveCourseAvailability.mockResolvedValue({ visibility: 'published' })
  })

  const page = async (course: string, lang: string) => {
    const element = await AccessRequiredPage({ searchParams: Promise.resolve({ course, lang }) })
    return renderToStaticMarkup(element as React.ReactElement)
  }

  it('offers "เริ่มเรียนฟรี" instead of a dead end on a free course', async () => {
    const markup = await page('basic-os-linux', 'th')
    expect(markup).toContain('คอร์สนี้เรียนฟรี')
    expect(markup).toContain('href="/courses/basic-os-linux/start?lang=th"')
    expect(markup).toContain('เริ่มเรียนฟรี')
  })

  it('keeps the existing not-enrolled page for a course that is not free', async () => {
    const markup = await page('cissp', 'en')
    expect(markup).toContain('This course is not in your access')
    expect(markup).not.toContain('/start?')
  })

  it('keeps the existing page when an admin has unpublished the free course', async () => {
    mocks.resolveCourseAvailability.mockResolvedValueOnce({ visibility: 'unpublished' })
    const markup = await page('basic-os-linux', 'en')
    expect(markup).toContain('This course is not in your access')
    expect(markup).not.toContain('/start?')
  })

  it('AccessRequiredView ignores the free button for inactive and locked reasons', () => {
    for (const reason of ['inactive', 'locked'] as const) {
      const markup = renderToStaticMarkup(createElement(AccessRequiredView, {
        courseTitle: 'Basic OS & Linux',
        locale: 'en',
        reason,
        slug: 'basic-os-linux',
        freeStartHref: '/courses/basic-os-linux/start?lang=en',
      }))
      expect(markup).not.toContain('/start?')
    }
  })
})

describe('production middleware for the free start path', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })

  it('sends a signed-out visitor to sign-in with the start path (and language) kept as next', async () => {
    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')
    const response = await middleware(new NextRequest('https://academy.cyberskills.co.th/courses/basic-os-linux/start?lang=th'))
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/sign-in')
    expect(location.searchParams.get('next')).toBe('/courses/basic-os-linux/start?lang=th')
    vi.unstubAllEnvs()
  })

  it('lets a signed-in learner reach the start page, and still 404s other three-segment paths', async () => {
    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')
    const cookie = { cookie: `__Host-academy_session=${'A'.repeat(43)}` }
    const start = await middleware(new NextRequest('https://academy.cyberskills.co.th/courses/basic-os-linux/start', { headers: cookie }))
    const other = await middleware(new NextRequest('https://academy.cyberskills.co.th/courses/basic-os-linux/checkout', { headers: cookie }))
    expect(start.status).toBe(200)
    expect(other.status).toBe(404)
    vi.unstubAllEnvs()
  })
})
