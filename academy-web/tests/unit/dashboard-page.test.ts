import { describe, expect, it, vi } from 'vitest'

const { internalSurfacesEnabled } = vi.hoisted(() => ({
  internalSurfacesEnabled: vi.fn(),
}))

vi.mock('@/lib/internal-surface', () => ({ internalSurfacesEnabled }))
vi.mock('@/components/course/CourseDashboard', () => ({ CourseDashboard: () => null }))

import DashboardPage from '@/app/(site)/dashboard/page'

describe('learner dashboard page', () => {
  it('does not serialize a course catalog into the client Flight payload', () => {
    internalSurfacesEnabled.mockReturnValue(false)

    const page = DashboardPage()
    const dashboard = (page as { props: { children: { props: Record<string, unknown> } } }).props.children

    expect(dashboard.props).not.toHaveProperty('courses')
  })
})
