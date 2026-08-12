import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCourseStructure, getLessonAnswerKey, loadPassedAttemptExplanations } = vi.hoisted(() => ({
  getCourseStructure: vi.fn(),
  getLessonAnswerKey: vi.fn(),
  loadPassedAttemptExplanations: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  currentUser: vi.fn(async () => ({ account: { id: 'user-1' } })),
}))
vi.mock('@/lib/content/course-source', () => ({
  getCourseStructure,
}))
vi.mock('@/lib/content/answer-key', () => ({
  getLessonAnswerKey,
  mcqItems: vi.fn((items) => items),
  simulationItems: vi.fn((items) => items.filter((item: { kind: string }) => item.kind === 'simulation')),
}))
vi.mock('@/lib/course/progress-db', () => ({
  loadProgress: vi.fn(async () => ({ completed: ['node-1'], testedOut: [] })),
}))
vi.mock('@/lib/account/course-access', () => ({
  authorizeCourseResource: vi.fn(async () => ({ allowed: true })),
  deniedAccessStatus: vi.fn(() => 403),
}))
vi.mock('@/lib/course/attempt-db', () => ({ loadPassedAttemptExplanations }))

import { GET } from '@/app/(site)/api/explanations/route'

describe('explanations route ใช้หลักฐานตอนผ่าน', () => {
  beforeEach(() => {
    loadPassedAttemptExplanations.mockReset()
    getCourseStructure.mockReturnValue({ slug: 'course-1', nodes: [{ id: 'node-1', kind: 'lesson' }] })
    getLessonAnswerKey.mockReturnValue({
      checkpoint: [{ kind: 'mcq', id: 'q-current', explanation: 'current deploy' }],
    })
  })

  it('คืน snapshot แม้ content deploy ปัจจุบันเป็นคนละชุด', async () => {
    loadPassedAttemptExplanations.mockResolvedValue({
      status: 'ready',
      explanations: { 'q-snapshot': 'attempt deploy' },
    })

    const response = await GET(new Request('http://localhost/api/explanations?slug=course-1&nodeId=node-1'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      questions: [{ id: 'q-snapshot', explanation: 'attempt deploy' }],
    })
    expect(getLessonAnswerKey).not.toHaveBeenCalled()
  })

  it('fallback ไป content ปัจจุบันเฉพาะเมื่อไม่มี passing attempt pointer', async () => {
    loadPassedAttemptExplanations.mockResolvedValue({ status: 'none' })

    const response = await GET(new Request('http://localhost/api/explanations?slug=course-1&nodeId=node-1'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      questions: [{ id: 'q-current', explanation: 'current deploy' }],
    })
  })

  it('completion ของ capstone ที่ไม่มี passing attempt pointer ต้อง fail closed', async () => {
    getCourseStructure.mockReturnValue({ slug: 'course-1', nodes: [{ id: 'node-1', kind: 'capstone' }] })
    loadPassedAttemptExplanations.mockResolvedValue({ status: 'none' })

    const response = await GET(new Request('http://localhost/api/explanations?slug=course-1&nodeId=node-1'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
  })
})
