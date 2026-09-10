import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const select = vi.fn()
  const insert = vi.fn()
  const currentUser = vi.fn()
  const getCourseStructure = vi.fn()
  const authorizeCourseResource = vi.fn()
  const deniedAccessStatus = vi.fn()
  const certificateEligibility = vi.fn()
  const academyDb = vi.fn(() => ({
    from: vi.fn(() => ({
      select: () => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: select })) })) }),
      insert,
    })),
  }))
  return { select, insert, currentUser, getCourseStructure, authorizeCourseResource, deniedAccessStatus, certificateEligibility, academyDb }
})

vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('@/lib/content/course-source', () => ({ getCourseStructure: mocks.getCourseStructure }))
vi.mock('@/lib/account/course-access', () => ({ authorizeCourseResource: mocks.authorizeCourseResource, deniedAccessStatus: mocks.deniedAccessStatus }))
vi.mock('@/lib/course/certificate-eligibility', () => ({
  certificateEligibility: mocks.certificateEligibility,
  certificateEvidenceSnapshot: () => ({}),
}))
vi.mock('@/lib/db/server', () => ({ academyDb: mocks.academyDb }))

import { GET, POST } from '@/app/(site)/api/courses/[slug]/certificate/route'

const structure = { slug: 'iccs227-operating-systems', version: '1.0.0' }
const issuedRow = {
  certificate_number: 'a'.repeat(32),
  course_slug: 'iccs227-operating-systems',
  course_version: '1.0.0',
  issued_at: '2026-09-10T12:00:00.000Z',
  revoked_at: null,
}

function issueRequest() {
  return POST(
    new Request('http://localhost/api/courses/iccs227-operating-systems/certificate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ slug: 'iccs227-operating-systems' }) },
  )
}

describe('POST /api/courses/[slug]/certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' }, email: 'learner@example.com' })
    mocks.getCourseStructure.mockReturnValue(structure)
    mocks.authorizeCourseResource.mockResolvedValue({ allowed: true })
    mocks.certificateEligibility.mockResolvedValue({
      eligible: true,
      courseVersion: '1.0.0',
      summary: { recordComplete: true, lessonsFinished: 22, total: 22, assessedPassed: 4, assessedTotal: 4, blocking: [], courseIssue: null },
      passedAttempts: {},
    })
    mocks.select.mockResolvedValue({ data: null, error: null })
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('rejects unauthenticated callers', async () => {
    mocks.currentUser.mockResolvedValue(null)
    const response = await issueRequest()
    expect(response.status).toBe(401)
  })

  it('issues idempotently: an existing record is returned without issuing again', async () => {
    mocks.select.mockResolvedValue({ data: issuedRow, error: null })
    const response = await issueRequest()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.alreadyIssued).toBe(true)
    expect(body.issued.certificateNumber).toBe('a'.repeat(32))
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('refuses to issue when evidence-based eligibility fails', async () => {
    mocks.certificateEligibility.mockResolvedValue({
      eligible: false,
      courseVersion: '1.0.0',
      summary: { recordComplete: false, lessonsFinished: 10, total: 22, assessedPassed: 1, assessedTotal: 4, blocking: [], courseIssue: null },
    })
    const response = await issueRequest()
    expect(response.status).toBe(409)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('a concurrent insert conflict falls back to the winner record instead of failing', async () => {
    mocks.select.mockResolvedValueOnce({ data: null, error: null })
    mocks.insert.mockResolvedValue({ error: { code: '23505' } })
    mocks.select.mockResolvedValueOnce({ data: issuedRow, error: null })
    const response = await issueRequest()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.alreadyIssued).toBe(true)
  })
})

describe('GET /api/courses/[slug]/certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser.mockResolvedValue({ account: { id: 'user-1' }, email: 'learner@example.com' })
    mocks.getCourseStructure.mockReturnValue(structure)
  })

  it('reports eligibility when nothing is issued yet', async () => {
    mocks.select.mockResolvedValue({ data: null, error: null })
    mocks.certificateEligibility.mockResolvedValue({
      eligible: false,
      courseVersion: '1.0.0',
      summary: { recordComplete: false, lessonsFinished: 5, total: 22, assessedPassed: 0, assessedTotal: 4, blocking: [], courseIssue: null },
    })
    const response = await GET(new Request('http://localhost/api/courses/iccs227-operating-systems/certificate'), {
      params: Promise.resolve({ slug: 'iccs227-operating-systems' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.issued).toBeNull()
    expect(body.eligible).toBe(false)
  })
})
