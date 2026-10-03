import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// AW-SEC-02 + AC-SEC-06: `/admin` ต้องตายตามสวิตช์ INTERNAL_SURFACES ก่อนชั้น auth
// และผู้เรียนที่ล็อกอินแล้วแต่ไม่ใช่ owner ต้องไม่ได้โครงหน้าแอดมิน

const { currentUser, hasStaffRoleRpc, notFound } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  hasStaffRoleRpc: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/db/server', () => ({ academyDb: () => ({ rpc: hasStaffRoleRpc }) }))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/components/admin/CourseManagement', () => ({ CourseManagement: () => null }))

import { CourseManagement } from '@/components/admin/CourseManagement'
import CourseManagementPage from '@/app/(site)/admin/courses/page'
import { middleware } from '@/middleware'

const learner = { account: { id: 'learner-1' } }
const sessionCookie = { cookie: `__Host-academy_session=${'A'.repeat(43)}` }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('middleware: /admin under the internal-surface switch', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })

  it.each(['/admin', '/admin/courses', '/player'])(
    '%s → 404 before auth when the switch is off, even with a session',
    async (path) => {
      vi.stubEnv('INTERNAL_SURFACES', 'off')
      const withSession = await middleware(
        new NextRequest(`https://academy.cyberskills.co.th${path}`, { headers: sessionCookie }),
      )
      const anonymous = await middleware(new NextRequest(`https://academy.cyberskills.co.th${path}`))
      expect(withSession.status).toBe(404)
      // 404 not a sign-in redirect: the auth layer was never consulted
      expect(anonymous.status).toBe(404)
      expect(anonymous.headers.get('location')).toBeNull()
    },
  )

  it('/admin/courses falls through to the auth layer when the switch is on', async () => {
    vi.stubEnv('INTERNAL_SURFACES', ' on ')
    const anonymous = await middleware(new NextRequest('https://academy.cyberskills.co.th/admin/courses'))
    expect(anonymous.status).toBe(307)
    expect(new URL(anonymous.headers.get('location') ?? '').pathname).toBe('/sign-in')
  })

  it('/api/admin/courses is not swallowed by the switch (handlers answer 401/403 themselves)', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'off')
    const response = await middleware(new NextRequest('https://academy.cyberskills.co.th/api/admin/courses'))
    expect(response.status).toBe(401)
  })
})

describe('/admin/courses server-side owner gate', () => {
  it('a signed-in non-staff learner gets 404, not the admin page shell', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    currentUser.mockResolvedValue(learner)
    hasStaffRoleRpc.mockResolvedValue({ data: false, error: null })

    await expect(CourseManagementPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(hasStaffRoleRpc).toHaveBeenCalledWith('has_staff_role', {
      p_account_id: 'learner-1',
      p_required_role: 'owner',
    })
  })

  it('a signed-out request gets 404', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    currentUser.mockResolvedValue(null)
    await expect(CourseManagementPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(hasStaffRoleRpc).not.toHaveBeenCalled()
  })

  it('switch off → 404 without reading the session', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'off')
    await expect(CourseManagementPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(currentUser).not.toHaveBeenCalled()
  })

  it('a staff-role read error fails closed (throws, renders nothing)', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    currentUser.mockResolvedValue(learner)
    hasStaffRoleRpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    await expect(CourseManagementPage()).rejects.toThrow()
  })

  it('an owner gets the management UI', async () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    currentUser.mockResolvedValue({ account: { id: 'owner-1' } })
    hasStaffRoleRpc.mockResolvedValue({ data: true, error: null })
    const element = await CourseManagementPage()
    expect(element.type).toBe(CourseManagement)
    expect(notFound).not.toHaveBeenCalled()
  })
})
