import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideCourseAccess } from '@/lib/account/course-access'

const {
  getActivation,
  hasCourseEntitlement,
  getEffectiveCourseAvailability,
  getCourseStructure,
  loadProgress,
} = vi.hoisted(() => ({
  getActivation: vi.fn(),
  hasCourseEntitlement: vi.fn(),
  getEffectiveCourseAvailability: vi.fn(),
  getCourseStructure: vi.fn(),
  loadProgress: vi.fn(),
}))

vi.mock('@/lib/account/access', () => ({
  getActivation,
  hasCourseEntitlement,
  isServiceUsable: (activation: { status: string } | null) => activation?.status === 'active',
}))
vi.mock('@/lib/course/settings', () => ({ getEffectiveCourseAvailability }))
vi.mock('@/lib/content/course-source', () => ({ getCourseStructure }))
vi.mock('@/lib/course/progress-db', () => ({ loadProgress }))

import {
  authorizeCourseResource,
  getCourseAccess,
} from '@/lib/account/course-access'
import {
  configureAcademySecurityEventLogger,
  resetAcademySecurityEventBudgetForTests,
} from '@/lib/security/security-events'

describe('course access decision', () => {
  let securityLines: string[]
  let restoreLogger: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    resetAcademySecurityEventBudgetForTests()
    securityLines = []
    const previousLogger = configureAcademySecurityEventLogger(line => securityLines.push(line))
    restoreLogger = () => configureAcademySecurityEventLogger(previousLogger)
  })

  afterEach(() => {
    restoreLogger()
    resetAcademySecurityEventBudgetForTests()
  })

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

  it('emits one sanitized accepted and denied course decision', async () => {
    getEffectiveCourseAvailability.mockResolvedValue({ visibility: 'published' })
    getActivation.mockResolvedValue({ status: 'active', revision: 2 })
    hasCourseEntitlement
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(getCourseAccess('user-SENTINEL', 'course-SENTINEL'))
      .resolves.toEqual({ allowed: true })
    await expect(getCourseAccess('user-SENTINEL', 'course-SENTINEL'))
      .resolves.toEqual({ allowed: false, reason: 'not-entitled' })

    expect(securityLines.map(line => {
      const event = JSON.parse(line) as Record<string, unknown>
      return { event: event.event, category: event.category, outcome: event.outcome, reason: event.reason }
    })).toEqual([
      {
        event: 'course_access',
        category: 'authorization',
        outcome: 'success',
        reason: 'allowed',
      },
      {
        event: 'course_access',
        category: 'authorization',
        outcome: 'failure',
        reason: 'not_entitled',
      },
    ])
    expect(securityLines.join('\n')).not.toContain('SENTINEL')
  })

  it('emits denied and unavailable resource decisions once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getEffectiveCourseAvailability.mockResolvedValue({ visibility: 'published' })
    getActivation.mockResolvedValue({ status: 'active', revision: 2 })
    hasCourseEntitlement.mockResolvedValue(true)
    getCourseStructure.mockReturnValue({
      nodes: [
        { id: 'node-1', prerequisites: ['missing-prerequisite'] },
      ],
    })
    loadProgress.mockResolvedValue({
      version: 2,
      slug: 'course-SENTINEL',
      completed: [],
      skipped: [],
      testedOut: [],
      inProgress: [],
      checkpointResults: {},
      videoCueResults: {},
      simulationEvidence: {},
      lastNodeId: null,
      updatedAt: 0,
    })

    await expect(authorizeCourseResource('user-SENTINEL', 'course-SENTINEL', 'node-1'))
      .resolves.toEqual({ allowed: false, reason: 'locked' })
    loadProgress.mockRejectedValue(new Error('progress unavailable user=SENTINEL'))
    await expect(authorizeCourseResource('user-SENTINEL', 'course-SENTINEL', 'node-1'))
      .resolves.toEqual({ allowed: false, reason: 'unavailable' })

    expect(securityLines.map(line => {
      const event = JSON.parse(line) as Record<string, unknown>
      return { event: event.event, outcome: event.outcome, reason: event.reason }
    })).toEqual([
      { event: 'course_resource', outcome: 'failure', reason: 'locked' },
      { event: 'course_resource', outcome: 'failure', reason: 'unavailable' },
    ])
    expect(securityLines.join('\n')).not.toContain('SENTINEL')
    consoleError.mockRestore()
  })
})
