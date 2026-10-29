import { beforeEach, expect, it, vi } from 'vitest'

const { get, maybeSingle, share, createCoreHostClient } = vi.hoisted(() => ({
  get: vi.fn(), maybeSingle: vi.fn(), share: vi.fn(), createCoreHostClient: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: `__Host-academy_session=${'A'.repeat(43)}` }),
}))
vi.mock('@/lib/identity/production-runtime', () => ({ createAcademyIdentityProductionSessionStore: () => ({ get }) }))
vi.mock('@/lib/db/server', () => ({ academyDb: () => ({ from: () => ({ select: () => ({
  eq: () => ({ eq: () => ({ maybeSingle }) }),
}) }) }) }))
vi.mock('@/lib/profile/core-host-client', () => ({ createCoreHostClient }))
import { POST } from '@/app/(site)/api/profile/self/route'

const principal = { issuer: 'https://accounts.example.test/', subject: 'synthetic-learner' }
const claims = { ...principal, verifiedEmail: 'synthetic@example.test', activation: { status: 'active', revision: 1 },
  createdAt: 1, expiresAt: 2 }
const command = { operation: 'share', command: { requestId: '00000000-0000-4000-8000-000000000021',
  skillIds: ['log-analysis'], includeRoleComparison: false, expiresInDays: 7, secret: '1'.repeat(64) } }

beforeEach(() => {
  vi.clearAllMocks()
  createCoreHostClient.mockReturnValue({ share })
  share.mockResolvedValue({ synthetic: true })
})

it.each(['revoked', 'suspended', 'active'] as const)(
  're-reads the actual session and activation resolver after body wait: %s', async state => {
    let current = 'active'
    get.mockImplementation(async () => current === 'revoked' ? null : claims)
    maybeSingle.mockImplementation(async () => ({ error: null, data: { id: 'synthetic-id', ...principal,
      email: claims.verifiedEmail, created_at: '2026-01-01T00:00:00.000Z',
      service_activation: { status: current === 'suspended' ? 'suspended' : 'active' } } }))
    let controller!: ReadableStreamDefaultController<Uint8Array>
    let readStarted!: () => void
    const waitingForBody = new Promise<void>(resolve => { readStarted = resolve })
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      pull() { readStarted() },
    }, { highWaterMark: 0 })
    const pending = POST(new Request('https://academy.example.test/api/profile/self', {
      method: 'POST', headers: { origin: 'https://academy.example.test', 'content-type': 'application/json' },
      body, duplex: 'half',
    } as RequestInit))
    await waitingForBody
    current = state
    controller.enqueue(new TextEncoder().encode(JSON.stringify(command)))
    controller.close()
    const response = await pending
    expect(response.status).toBe(state === 'active' ? 200 : 401)
    expect(get).toHaveBeenCalledTimes(2)
    expect(maybeSingle).toHaveBeenCalledTimes(state === 'revoked' ? 1 : 2)
    if (state === 'active') expect(share).toHaveBeenCalledWith(principal, command.command)
    else {
      expect(createCoreHostClient).not.toHaveBeenCalled()
      expect(share).not.toHaveBeenCalled()
    }
  },
)
