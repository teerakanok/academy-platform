import { beforeEach, describe, expect, it, vi } from 'vitest'

const { academyDb, from, select, eq, inFilter } = vi.hoisted(() => ({
  academyDb: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  inFilter: vi.fn(),
}))

vi.mock('@/lib/db/server', () => ({ academyDb }))

import { loadAllProgress } from '@/lib/course/progress-db'

describe('loadAllProgress allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { data: [], error: null }
    inFilter.mockReturnValue(query)
    eq.mockReturnValue({ in: inFilter })
    select.mockReturnValue({ eq })
    from.mockReturnValue({ select })
    academyDb.mockReturnValue({ from })
  })

  it('does not open a database query for an empty entitlement list', async () => {
    await expect(loadAllProgress('user-1', [])).resolves.toEqual({})
    expect(academyDb).not.toHaveBeenCalled()
  })

  it('filters the dashboard progress query to the entitled course slugs', async () => {
    await expect(loadAllProgress('user-1', ['course-a', 'course-b'])).resolves.toEqual({})
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(inFilter).toHaveBeenCalledWith('course_slug', ['course-a', 'course-b'])
  })
})
