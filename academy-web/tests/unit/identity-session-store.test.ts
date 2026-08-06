import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FileIdentitySessionStore,
  academySessionCookie,
  type IdentitySessionClaims,
} from '@/lib/identity/session-store'

const claims: IdentitySessionClaims = {
  issuer: 'https://identity.local.invalid',
  subject: 'learner-1',
  verifiedEmail: 'learner@example.test',
  activation: { status: 'active', revision: 3 },
}

function withTempStore(test: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'academy-identity-session-'))
  try {
    test(join(dir, 'sessions.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('local durable identity session store', () => {
  it('survives a store instance restart without adding entitlement claims', () => {
    withTempStore((path) => {
      const created = new FileIdentitySessionStore(path, { now: () => 1_000, ttlMs: 60_000 }).create(claims)
      expect(existsSync(`${path}.lock`)).toBe(false)
      const restarted = new FileIdentitySessionStore(path, { now: () => 2_000 })

      expect(restarted.get(created.id)).toEqual({
        ...claims,
        createdAt: 1_000,
        expiresAt: 61_000,
      })
      expect(restarted.get(created.id)).not.toHaveProperty('courseEntitlements')
    })
  })

  it('expires and revokes sessions durably', () => {
    withTempStore((path) => {
      let now = 1_000
      const store = new FileIdentitySessionStore(path, { now: () => now, ttlMs: 60_000 })
      const created = store.create(claims)

      store.revoke(created.id)
      expect(store.get(created.id)).toBeNull()
      expect(existsSync(`${path}.lock`)).toBe(false)

      const second = store.create(claims)
      now = 61_000
      expect(store.get(second.id)).toBeNull()
      expect(new FileIdentitySessionStore(path, { now: () => 61_000 }).get(second.id)).toBeNull()
    })
  })

  it('returns a host-scoped HttpOnly cookie without a parent-domain attribute', () => {
    const cookie = academySessionCookie('session_token_123456789012345678901234', { secure: true, maxAge: 900 })

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Max-Age=900')
    expect(cookie).not.toMatch(/Domain=/i)
  })
})
