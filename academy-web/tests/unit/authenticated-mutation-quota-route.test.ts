import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  currentUser,
  quotaCounts,
  quotaNamespace,
  resetQuotaHarness,
  authorizeCourseResource,
  getCourseAccess,
  commitNodeEvent,
  captureProgressEpoch,
  resetProgress,
} = vi.hoisted(() => {
  const quotaCounts = new Map<string, { count: number, resetAt: number }>()
  const quotaNamespace = {
    failNextCheck: false,
    getByName(objectName: string) {
      return {
        async check(rule: { limit: number, windowMs: number }, now: number = Date.now()) {
          if (quotaNamespace.failNextCheck) {
            quotaNamespace.failNextCheck = false
            throw new Error('durable limiter unavailable')
          }
          const previous = quotaCounts.get(objectName)
          if (!previous || now >= previous.resetAt) {
            const resetAt = now + rule.windowMs
            quotaCounts.set(objectName, { count: 1, resetAt })
            return { allowed: true, retryAfterSeconds: 0 }
          }
          const count = previous.count + 1
          quotaCounts.set(objectName, { ...previous, count })
          return {
            allowed: count <= rule.limit,
            retryAfterSeconds: Math.max(1, Math.ceil((previous.resetAt - now) / 1_000)),
          }
        },
      }
    },
  }

  ;(globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] = {
    ctx: {},
    cf: undefined,
    env: {
      EDGE_RATE_LIMITER: quotaNamespace,
      RATE_LIMIT_KEY_SECRET: 'authenticated-quota-test-secret-32-bytes',
    },
  }

  return {
    currentUser: vi.fn(),
    quotaCounts,
    quotaNamespace,
    resetQuotaHarness: () => {
      quotaCounts.clear()
      quotaNamespace.failNextCheck = false
    },
    authorizeCourseResource: vi.fn(),
    getCourseAccess: vi.fn(),
    commitNodeEvent: vi.fn(),
    captureProgressEpoch: vi.fn(),
    resetProgress: vi.fn(),
  }
})

vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/content/course-source', () => ({
  getAllCourses: vi.fn(() => []),
  getCourseStructure: vi.fn((slug: string) => ({
    slug,
    nodes: [{ id: 'lesson-1', kind: 'lesson' }],
  })),
}))
vi.mock('@/lib/account/course-access', () => ({
  authorizeCourseResource,
  deniedAccessStatus: () => 403,
  getCourseAccess,
}))
vi.mock('@/lib/course/progress-db', async () => ({
  captureProgressEpoch,
  commitNodeEvent,
  resetProgress,
}))
vi.mock('@/lib/content/answer-key', () => ({
  getLessonAnswerKey: vi.fn(() => ({
    checkpoint: [],
    videoCueQuestions: [],
    simulations: [{
      id: 'simulation-1',
      version: 'v1',
      surface: [],
      initial: {},
      requiredFields: [],
      requirements: [],
    }],
  })),
  mcqItems: vi.fn(() => []),
  sameAnswerSet: vi.fn(() => true),
  simulationItems: vi.fn(() => []),
}))
vi.mock('@/lib/simulation/types', () => ({
  gradeSimulation: vi.fn(() => ({ passed: true, results: [], metCount: 0, total: 0 })),
  gradingFingerprint: vi.fn(() => 'fingerprint'),
  simulationReadiness: vi.fn(() => ({ ready: true })),
}))

const { POST: postProgress } = await import('@/app/(site)/api/progress/route')
const { POST: postReset } = await import('@/app/(site)/api/progress/reset/route')
const { POST: postSimulation } = await import('@/app/(site)/api/practice/simulation/route')

const user = (accountId: string) => ({ account: { id: accountId } })
const progressRequest = (slug: string, accountId?: string) => new Request(
  'https://academy.cyberskills.co.th/api/progress',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://academy.cyberskills.co.th',
      ...(accountId ? { 'x-account-id': accountId } : {}),
    },
    body: JSON.stringify({ action: 'open', slug, nodeId: 'lesson-1' }),
  },
)

const simulationRequest = (slug: string, accountId?: string) => new Request(
  'https://academy.cyberskills.co.th/api/practice/simulation',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://academy.cyberskills.co.th',
      ...(accountId ? { 'x-account-id': accountId } : {}),
    },
    body: JSON.stringify({
      slug,
      nodeId: 'lesson-1',
      challengeId: 'simulation-1',
      state: {},
    }),
  },
)

const resetRequest = (slug: string, operationId: string, accountId?: string) => new Request(
  `https://academy.cyberskills.co.th/api/progress/reset?slug=${slug}&operationId=${operationId}`,
  {
    method: 'POST',
    headers: {
      origin: 'https://academy.cyberskills.co.th',
      ...(accountId ? { 'x-account-id': accountId } : {}),
    },
  },
)

describe('authenticated learner mutation quotas', () => {
  beforeEach(() => {
    resetQuotaHarness()
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'))
    currentUser.mockReset()
    authorizeCourseResource.mockReset().mockResolvedValue({ allowed: true })
    getCourseAccess.mockReset().mockResolvedValue({ allowed: true })
    captureProgressEpoch.mockReset().mockResolvedValue(1)
    commitNodeEvent.mockReset().mockResolvedValue(true)
    resetProgress.mockReset().mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('permits ordinary learner progress and simulation bursts', async () => {
    currentUser.mockReturnValue(user('burst-user'))

    for (let index = 0; index < 25; index += 1) {
      const response = await postProgress(progressRequest('basic-os-linux'))
      expect(response.status).toBe(200)
    }
    for (let index = 0; index < 30; index += 1) {
      const response = await postSimulation(simulationRequest('basic-os-linux'))
      expect(response.status).toBe(200)
    }
    expect(commitNodeEvent).toHaveBeenCalledTimes(25)
  })

  it('exhausts per-course progress without executing the denied mutation', async () => {
    currentUser.mockReturnValue(user('quota-user'))

    for (let index = 0; index < 60; index += 1) {
      expect((await postProgress(progressRequest('basic-os-linux'))).status).toBe(200)
    }
    const denied = await postProgress(progressRequest('basic-os-linux'))

    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('60')
    expect(commitNodeEvent).toHaveBeenCalledTimes(60)
    expect([...quotaCounts.keys()].every((name) => !name.includes('quota-user'))).toBe(true)
    expect(await denied.text()).not.toContain('quota-user')
  })

  it('exhausts the account ceiling across courses and refills after the window', async () => {
    currentUser.mockReturnValue(user('account-user'))

    for (const slug of ['basic-os-linux', 'secure-networking']) {
      for (let index = 0; index < 60; index += 1) {
        const response = await postProgress(progressRequest(slug))
        expect(response.status).toBe(200)
      }
    }
    const accountDenied = await postProgress(progressRequest('cryptography-essentials'))
    expect(accountDenied.status).toBe(429)
    expect(commitNodeEvent).toHaveBeenCalledTimes(120)

    vi.setSystemTime(new Date('2026-09-09T00:01:01Z'))
    const refilled = await postProgress(progressRequest('cryptography-essentials'))
    expect(refilled.status).toBe(200)
    expect(commitNodeEvent).toHaveBeenCalledTimes(121)
  })

  it('isolates quota users, courses, and mutation operations', async () => {
    currentUser.mockImplementation(() => user('attacker'))
    for (let index = 0; index < 60; index += 1) {
      await postProgress(progressRequest('basic-os-linux', 'victim-account-id'))
    }
    const deniedAttacker = await postProgress(progressRequest('basic-os-linux', 'victim-account-id'))
    const otherAttackerCourse = await postProgress(progressRequest('secure-networking', 'victim-account-id'))
    currentUser.mockImplementation(() => user('victim'))
    const victimSameCourse = await postProgress(progressRequest('basic-os-linux', 'attacker-account-id'))
    currentUser.mockImplementation(() => user('attacker'))
    const attackerSimulation = await postSimulation(simulationRequest('basic-os-linux', 'victim-account-id'))

    expect(deniedAttacker.status).toBe(429)
    expect(otherAttackerCourse.status).toBe(200)
    expect(victimSameCourse.status).toBe(200)
    expect(attackerSimulation.status).toBe(200)
    expect([...quotaCounts.keys()].every((name) => !name.includes('attacker') && !name.includes('victim'))).toBe(true)
  })

  it('fails closed without mutating progress when the limiter fails', async () => {
    currentUser.mockReturnValue(user('failure-user'))
    quotaNamespace.failNextCheck = true
    const response = await postProgress(progressRequest('basic-os-linux'))

    expect(response.status).toBe(503)
    expect(authorizeCourseResource).not.toHaveBeenCalled()
    expect(commitNodeEvent).not.toHaveBeenCalled()
  })

  it('bounds grading more strictly than progress while allowing a 30-request burst', async () => {
    currentUser.mockReturnValue(user('grading-budget-user'))
    for (let index = 0; index < 30; index += 1) {
      expect((await postSimulation(simulationRequest('basic-os-linux'))).status).toBe(200)
    }
    expect((await postSimulation(simulationRequest('basic-os-linux'))).status).toBe(429)
    currentUser.mockReturnValue(user('grading-account-budget-user'))
    for (const slug of ['basic-os-linux', 'secure-networking']) {
      for (let index = 0; index < 30; index += 1) {
        expect((await postSimulation(simulationRequest(slug))).status).toBe(200)
      }
    }
    expect((await postSimulation(simulationRequest('cryptography-essentials'))).status).toBe(429)
  })

  it('advertises the longest denied window when account and course windows are skewed', async () => {
    currentUser.mockReturnValue(user('skew-user'))
    for (const slug of ['basic-os-linux', 'secure-networking']) {
      for (let index = 0; index < 60; index += 1) await postProgress(progressRequest(slug))
    }
    vi.setSystemTime(new Date('2026-09-09T00:00:30Z'))
    for (let index = 0; index < 61; index += 1) await postProgress(progressRequest('cryptography-essentials'))
    const denied = await postProgress(progressRequest('cryptography-essentials'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('60')
    vi.setSystemTime(new Date('2026-09-09T00:01:30Z'))
    expect((await postProgress(progressRequest('cryptography-essentials'))).status).toBe(200)
  })

  it('bounds reset per course, account, and refill window', async () => {
    currentUser.mockReturnValue(user('reset-user'))

    for (const slug of ['basic-os-linux', 'secure-networking', 'cryptography-essentials']) {
      for (let index = 0; index < 2; index += 1) {
        const response = await postReset(resetRequest(slug, crypto.randomUUID()))
        expect(response.status).toBe(200)
      }
    }
    const denied = await postReset(resetRequest('cryptography-essentials', crypto.randomUUID()))

    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('3600')
    expect(resetProgress).toHaveBeenCalledTimes(6)

    vi.setSystemTime(new Date('2026-09-09T01:00:01Z'))
    const refilled = await postReset(resetRequest('cryptography-essentials', crypto.randomUUID()))
    expect(refilled.status).toBe(200)
    expect(resetProgress).toHaveBeenCalledTimes(7)
  })
})
