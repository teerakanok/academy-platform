import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createProductionSessionStore, findOrCreateUser, headers } = vi.hoisted(() => ({
  createProductionSessionStore: vi.fn(),
  findOrCreateUser: vi.fn(),
  headers: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers,
}))
vi.mock('@/lib/account/users', () => ({ findOrCreateUser }))
vi.mock('@/lib/identity/production-runtime', () => ({
  createAcademyIdentityProductionSessionStore: createProductionSessionStore,
}))

import { currentUser } from '@/lib/auth/session'
import { AcademyPostgresIdentitySessionStore } from '@/lib/identity/postgres-session-store'

const sessionId = 'A'.repeat(43)

function storeReturning(status: 'expired' | 'unknown') {
  return new AcademyPostgresIdentitySessionStore({
    rpc: vi.fn().mockResolvedValue({ data: { status }, error: null }),
  })
}

describe('production currentUser opaque-cookie authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    headers.mockResolvedValue(new Headers({
      cookie: `academy_session=${sessionId}`,
    }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['forged', 'unknown'],
    ['expired', 'expired'],
  ] as const)('rejects a syntactically valid but %s session', async (_case, status) => {
    const store = storeReturning(status)
    createProductionSessionStore.mockReturnValue(store)

    await expect(currentUser()).resolves.toBeNull()

    expect(createProductionSessionStore).toHaveBeenCalledTimes(1)
    expect(findOrCreateUser).not.toHaveBeenCalled()
  })

  it('rejects a syntactically valid session after durable revocation', async () => {
    let active = true
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'revoke_identity_session') {
        active = false
        return Promise.resolve({ data: { status: 'revoked' }, error: null })
      }
      return Promise.resolve({
        data: { status: active ? 'active' : 'unknown' },
        error: null,
      })
    })
    const store = new AcademyPostgresIdentitySessionStore({ rpc })
    await store.revoke(sessionId)
    createProductionSessionStore.mockReturnValue(store)

    await expect(currentUser()).resolves.toBeNull()

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'revoke_identity_session',
      'read_identity_session',
    ])
    expect(findOrCreateUser).not.toHaveBeenCalled()
  })
})
