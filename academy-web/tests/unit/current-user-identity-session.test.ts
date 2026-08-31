import { describe, expect, it, vi } from 'vitest'

import { resolveIdentitySessionUser } from '@/lib/auth/session'

const sessionId = 'A'.repeat(43)
const claims = {
  issuer: 'https://accounts.cyberskills.co.th/auth/v1',
  subject: 'principal-subject',
  verifiedEmail: 'learner@example.com',
  activation: { status: 'active' as const, revision: 3 },
  createdAt: 1_000,
  expiresAt: 2_000,
}
const account = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  issuer: claims.issuer,
  subject: claims.subject,
  email: claims.verifiedEmail,
  displayName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('Academy current user opaque Identity session', () => {
  it('maps one active verified principal to the Academy account', async () => {
    const get = vi.fn().mockResolvedValue(claims)
    const resolveAccount = vi.fn().mockResolvedValue(account)

    await expect(resolveIdentitySessionUser({
      sessionId,
      sessionStore: { get },
      resolveAccount,
    })).resolves.toEqual({ account, email: claims.verifiedEmail })
    expect(get).toHaveBeenCalledWith(sessionId)
    expect(resolveAccount).toHaveBeenCalledWith({
      issuer: claims.issuer,
      subject: claims.subject,
      email: claims.verifiedEmail,
    })
  })

  it('fails closed for an absent session', async () => {
    const resolveAccount = vi.fn()
    await expect(resolveIdentitySessionUser({
      sessionId,
      sessionStore: { get: vi.fn().mockResolvedValue(null) },
      resolveAccount,
    })).resolves.toBeNull()
    expect(resolveAccount).not.toHaveBeenCalled()
  })

  it.each([
    ['suspended', { ...claims, activation: { status: 'suspended' as const, revision: 4 } }],
    ['deactivated', { ...claims, activation: { status: 'deactivated' as const, revision: 5 } }],
  ])('keeps %s identity authenticated so authorization can return the honest inactive state', async (_label, value) => {
    const resolveAccount = vi.fn().mockResolvedValue(account)
    await expect(resolveIdentitySessionUser({
      sessionId,
      sessionStore: { get: vi.fn().mockResolvedValue(value) },
      resolveAccount,
    })).resolves.toEqual({ account, email: claims.verifiedEmail })
  })

  it('fails closed when the durable session store or account mapping fails', async () => {
    await expect(resolveIdentitySessionUser({
      sessionId,
      sessionStore: { get: vi.fn().mockRejectedValue(new Error('private')) },
      resolveAccount: vi.fn(),
    })).resolves.toBeNull()
    await expect(resolveIdentitySessionUser({
      sessionId,
      sessionStore: { get: vi.fn().mockResolvedValue(claims) },
      resolveAccount: vi.fn().mockRejectedValue(new Error('private')),
    })).resolves.toBeNull()
  })
})
