import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActivation: vi.fn(),
  hasCourseEntitlement: vi.fn(),
  getCourseStructure: vi.fn(),
  loadProgress: vi.fn(),
  requireEffectiveCourseVisibility: vi.fn(),
}))

vi.mock('@/lib/account/access', () => ({
  getActivation: mocks.getActivation,
  hasCourseEntitlement: mocks.hasCourseEntitlement,
  isServiceUsable: (activation: { status?: string } | null) => activation?.status === 'active',
}))
vi.mock('@/lib/content/course-source', () => ({ getCourseStructure: mocks.getCourseStructure }))
vi.mock('@/lib/course/progress-db', () => ({ loadProgress: mocks.loadProgress }))
vi.mock('@/lib/course/progress', () => ({ toLearnerState: vi.fn() }))
vi.mock('@/lib/course/roadmap', () => ({ nodeStatus: vi.fn() }))
vi.mock('@/lib/course/settings', () => ({
  requireEffectiveCourseVisibility: mocks.requireEffectiveCourseVisibility,
}))

import { authorizeCourseResource, decideCourseAccess, deniedAccessStatus } from '@/lib/account/course-access'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getActivation.mockResolvedValue({ status: 'active', revision: 1 })
  mocks.hasCourseEntitlement.mockResolvedValue(true)
  mocks.getCourseStructure.mockReturnValue({ publicAvailability: 'syllabus-preview', nodes: [{ id: 'lesson-1' }] })
  mocks.requireEffectiveCourseVisibility.mockResolvedValue('published')
})

describe('course access decision', () => {
  it('มี session อย่างเดียวไม่พอ', () => {
    expect(decideCourseAccess(null, false)).toEqual({ allowed: false, reason: 'inactive' })
  })

  it('activation ที่ถูกพักหรือปิดใช้ต้องถูกปฏิเสธ', () => {
    for (const status of ['pending', 'suspended', 'deactivated'] as const) {
      expect(decideCourseAccess({ status, revision: 1 }, true)).toEqual({
        allowed: false,
        reason: 'inactive',
      })
    }
  })

  it('active แต่ไม่มี entitlement ยังเข้าไม่ได้', () => {
    expect(decideCourseAccess({ status: 'active', revision: 2 }, false)).toEqual({
      allowed: false,
      reason: 'not-entitled',
    })
  })

  it('ต้อง active และมี entitlement พร้อมกัน', () => {
    expect(decideCourseAccess({ status: 'active', revision: 2 }, true)).toEqual({ allowed: true })
  })

  it.each(['unpublished', 'retired'] as const)(
    'ปฏิเสธบทเรียนแม้ยังมี entitlement เมื่อคอร์สเป็น %s',
    async (visibility) => {
      mocks.requireEffectiveCourseVisibility.mockResolvedValueOnce(visibility)

      const access = await authorizeCourseResource('user-1', 'git-essentials', 'lesson-1')

      expect(access).toEqual({ allowed: false, reason: 'hidden' })
      expect(mocks.hasCourseEntitlement).toHaveBeenCalledWith('user-1', 'git-essentials')
      expect(mocks.requireEffectiveCourseVisibility)
        .toHaveBeenCalledWith('syllabus-preview', 'git-essentials')
      expect(mocks.loadProgress).not.toHaveBeenCalled()
      if (access.allowed) throw new Error('expected hidden course access to be denied')
      expect(deniedAccessStatus(access)).toBe(403)
    },
  )

  it('fails closed when course visibility cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mocks.requireEffectiveCourseVisibility.mockRejectedValueOnce(new Error('settings unavailable'))

      await expect(authorizeCourseResource('user-1', 'git-essentials', 'lesson-1'))
        .resolves.toEqual({ allowed: false, reason: 'unavailable' })
    } finally {
      consoleError.mockRestore()
    }
  })
})
