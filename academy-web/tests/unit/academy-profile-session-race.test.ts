import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, createCoreHostClient, profile, goal, share, revoke } = vi.hoisted(() => ({
  currentUser: vi.fn(), createCoreHostClient: vi.fn(),
  profile: vi.fn(), goal: vi.fn(), share: vi.fn(), revoke: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ currentUser }))
vi.mock('@/lib/profile/core-host-client', () => ({ createCoreHostClient }))
import { POST } from '@/app/(site)/api/profile/self/route'

const principal = { issuer: 'https://accounts.example.test/', subject: 'synthetic-learner' }
const requestId = '00000000-0000-4000-8000-000000000021'
const commands = [
  { operation: 'profile' },
  { operation: 'goal', command: { requestId, roleId: 'soc-analyst', level: 'entry' } },
  { operation: 'share', command: { requestId, skillIds: ['log-analysis'], includeRoleComparison: false,
    expiresInDays: 7, secret: '1'.repeat(64) } },
  { operation: 'revoke', shareId: `shr_${'2'.repeat(32)}`, command: { requestId } },
] as const

async function afterBodyWait(command: unknown, nextPrincipal: typeof principal | null) {
  let active: typeof principal | null = principal
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let readStarted!: () => void
  const waitingForBody = new Promise<void>(resolve => { readStarted = resolve })
  currentUser.mockImplementation(async () => active ? { account: active } : null)
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    pull() { readStarted() },
  }, { highWaterMark: 0 })
  const request = new Request('https://academy.example.test/api/profile/self', {
    method: 'POST', headers: { origin: 'https://academy.example.test', 'content-type': 'application/json' },
    body: stream, duplex: 'half',
  } as RequestInit)
  const pending = POST(request)
  await waitingForBody
  active = nextPrincipal
  controller.enqueue(new TextEncoder().encode(JSON.stringify(command)))
  controller.close()
  return pending
}

describe('profile authorization after the request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createCoreHostClient.mockReturnValue({ profile, goal, share, revoke })
    for (const call of [profile, goal, share, revoke]) call.mockResolvedValue({ synthetic: true })
  })

  it.each(commands)('denies $operation when the session is revoked or activation suspended while reading', async command => {
    const response = await afterBodyWait(command, null)
    expect(response.status).toBe(401)
    expect(currentUser).toHaveBeenCalledTimes(2)
    expect(createCoreHostClient).not.toHaveBeenCalled()
    for (const call of [profile, goal, share, revoke]) expect(call).not.toHaveBeenCalled()
  })

  it.each([
    { ...principal, subject: 'synthetic-other' },
    { ...principal, issuer: 'https://other.example.test/' },
  ])('denies a principal changed during the body wait', async changed => {
    const response = await afterBodyWait(commands[2], changed)
    expect(response.status).toBe(401)
    expect(createCoreHostClient).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it.each(commands)('allows $operation for the same active principal', async command => {
    const response = await afterBodyWait(command, principal)
    expect(response.status).toBe(200)
    expect(currentUser).toHaveBeenCalledTimes(2)
    const call = { profile, goal, share, revoke }[command.operation]
    expect(call).toHaveBeenCalledOnce()
    expect(call.mock.calls[0][0]).toEqual(principal)
  })
})
