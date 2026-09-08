import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  academyDb: vi.fn(),
  createProductionSessionStore: vi.fn(),
  headers: vi.fn(),
}))

vi.mock('@/lib/db/server', () => ({ academyDb: database.academyDb }))
vi.mock('next/headers', () => ({ headers: database.headers }))
vi.mock('@/lib/identity/production-runtime', () => ({
  createAcademyIdentityProductionSessionStore: database.createProductionSessionStore,
}))

import { currentUser } from '@/lib/auth/session'
import { findActiveUser } from '@/lib/account/users'

const issuer = 'https://supabase.cyberskills.co.th/auth/v1'
const claims = {
  issuer,
  subject: 'principal-subject',
  email: 'learner@example.com',
}
const sessionId = 'A'.repeat(43)

function databaseUser(activation: unknown) {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    issuer,
    subject: claims.subject,
    email: claims.email,
    display_name: null,
    created_at: '2026-01-01T00:00:00.000Z',
    service_activation: activation,
  }
}

function mockUserQuery(data: unknown, error: null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnThis()
  const select = vi.fn().mockReturnThis()
  const from = vi.fn().mockReturnValue({ select, eq, maybeSingle })
  database.academyDb.mockReturnValue({ from })

  return { eq, from, maybeSingle, select }
}

describe('active Academy account activation resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('accepts the PostgREST singular activation object and canonical principal', async () => {
    const query = mockUserQuery(databaseUser({ status: 'active' }))

    await expect(findActiveUser(claims)).resolves.toEqual({
      id: '123e4567-e89b-42d3-a456-426614174000',
      issuer,
      subject: claims.subject,
      email: claims.email,
      displayName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(query.select).toHaveBeenCalledWith('*, service_activation(status)')
    expect(query.eq).toHaveBeenCalledWith('issuer', claims.issuer)
    expect(query.eq).toHaveBeenCalledWith('subject', claims.subject)
  })

  it('still accepts a singular array embed', async () => {
    mockUserQuery(databaseUser([{ status: 'active' }]))

    await expect(findActiveUser(claims)).resolves.toMatchObject({ subject: claims.subject })
  })

  it.each([
    ['missing', null],
    ['malformed', 'active'],
    ['inactive', { status: 'suspended' }],
    ['ambiguous', [{ status: 'active' }, { status: 'active' }]],
  ])('fails closed for a %s activation embed', async (_label, activation) => {
    mockUserQuery(databaseUser(activation))

    await expect(findActiveUser(claims)).resolves.toBeNull()
  })

  it('resolves production currentUser through the real account resolver', async () => {
    const sessionStore = {
      get: vi.fn().mockResolvedValue({
        issuer,
        subject: claims.subject,
        verifiedEmail: claims.email,
        activation: { status: 'active', revision: 3 },
        createdAt: 1_000,
        expiresAt: 2_000,
      }),
    }
    database.createProductionSessionStore.mockReturnValue(sessionStore)
    database.headers.mockResolvedValue(new Headers({
      cookie: `__Host-academy_session=${sessionId}`,
    }))
    mockUserQuery(databaseUser({ status: 'active' }))

    await expect(currentUser()).resolves.toEqual({
      account: {
        id: '123e4567-e89b-42d3-a456-426614174000',
        issuer,
        subject: claims.subject,
        email: claims.email,
        displayName: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      email: claims.email,
    })
    expect(sessionStore.get).toHaveBeenCalledWith(sessionId)
    expect(database.academyDb).toHaveBeenCalledTimes(1)
  })
})
