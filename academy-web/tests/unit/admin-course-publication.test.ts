import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), structure: vi.fn(), ready: vi.fn(), upsert: vi.fn(), db: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ currentUser: mocks.user }))
vi.mock('@/lib/staff/authorization', () => ({ hasStaffRole: mocks.role }))
vi.mock('@/lib/content/course-source', () => ({ getCourseStructure: mocks.structure }))
vi.mock('@/lib/course/certificate-assessment-readiness', () => ({ certificateAssessmentReady: mocks.ready }))
vi.mock('@/lib/db/server', () => ({ academyDb: mocks.db }))
import { PATCH } from '@/app/(site)/api/admin/courses/[slug]/route'
function request(visibility: string) {
  return new Request('https://academy.cyberskills.co.th/api/admin/courses/fixture', { method: 'PATCH', headers: { origin: 'https://academy.cyberskills.co.th', 'content-type': 'application/json' }, body: JSON.stringify({ visibility }) })
}
const params = { params: Promise.resolve({ slug: 'fixture' }) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ account: { id: 'owner' } })
  mocks.role.mockResolvedValue(true)
  mocks.structure.mockReturnValue({ slug: 'fixture', publicAvailability: 'internal' })
  mocks.ready.mockReturnValue(false)
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.db.mockReturnValue({ from: () => ({ upsert: mocks.upsert }) })
})
describe('course publication assessment gate', () => {
  it('denies publishing an unprepared internal course before writing settings', async () => {
    expect((await PATCH(request('published'), params)).status).toBe(409)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('denies inherit when it would publish unprepared static-public content', async () => {
    mocks.structure.mockReturnValue({ slug: 'fixture', publicAvailability: 'syllabus-preview' })
    expect((await PATCH(request('inherit'), params)).status).toBe(409)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('publishes a ready course and preserves private learning or retirement controls', async () => {
    mocks.ready.mockReturnValue(true)
    expect((await PATCH(request('published'), params)).status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'published' }), expect.anything())
    mocks.ready.mockReturnValue(false)
    for (const visibility of ['unpublished', 'retired', 'inherit']) expect((await PATCH(request(visibility), params)).status).toBe(200)
  })
  it('keeps ownership authorization before content readiness or database writes', async () => {
    mocks.role.mockResolvedValue(false)
    expect((await PATCH(request('published'), params)).status).toBe(403)
    expect(mocks.ready).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
