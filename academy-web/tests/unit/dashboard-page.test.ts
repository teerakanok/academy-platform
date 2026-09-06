import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, internalSurfacesEnabled, redirect } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  internalSurfacesEnabled: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/internal-surface', () => ({ internalSurfacesEnabled }))
vi.mock('@/components/course/CourseDashboard', () => ({ CourseDashboard: () => null }))

import DashboardPage from '@/app/(site)/dashboard/page'

describe('learner dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser.mockResolvedValue({ account: { id: 'user-1' }, email: 'learner@example.test' })
  })

  it('does not serialize a course catalog into the client Flight payload', async () => {
    internalSurfacesEnabled.mockReturnValue(false)

    const page = await DashboardPage()
    const dashboard = (page as { props: { children: { props: Record<string, unknown> } } }).props.children

    expect(currentUser).toHaveBeenCalledTimes(1)
    expect(dashboard.props).not.toHaveProperty('courses')
  })

  it('redirects when the authoritative session lookup rejects an opaque cookie', async () => {
    currentUser.mockResolvedValue(null)

    await DashboardPage()

    expect(currentUser).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith('/sign-in?next=%2Fdashboard')
  })
})
