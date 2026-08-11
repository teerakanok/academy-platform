import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FileIdentitySessionStore,
  academySessionCookie,
  expireAcademySessionCookie,
  parseAcademySessionCookie,
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

  it('serializes and expires the host-only cookie with one deterministic attribute policy', () => {
    const sessionId = 'session_token_123456789012345678901234'

    expect(academySessionCookie(sessionId, { secure: true, maxAge: 900 })).toBe(
      `academy_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=900`,
    )
    expect(academySessionCookie(sessionId, { secure: false })).toBe(
      `academy_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
    )
    expect(expireAcademySessionCookie({ secure: true })).toBe(
      'academy_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    )
    expect(expireAcademySessionCookie({ secure: false })).toBe(
      'academy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    )

    const cookie = expireAcademySessionCookie()
    expect(cookie).not.toMatch(/Domain=/i)
  })

  it('parses only one canonical opaque session cookie from the raw header', () => {
    const sessionId = 'opaque_session-id_12345678901234567890'

    expect(parseAcademySessionCookie(`theme=dark; academy_session=${sessionId}; locale=th`)).toBe(sessionId)
    expect(parseAcademySessionCookie(` academy_session = ${sessionId} `)).toBe(sessionId)
    expect(parseAcademySessionCookie(`Academy_Session=ignored; academy_session=${sessionId}`)).toBe(sessionId)
    expect(parseAcademySessionCookie('theme=dark')).toBeNull()
    expect(parseAcademySessionCookie(null)).toBeNull()
  })

  it('rejects every duplicate canonical name without depending on cookie order', () => {
    const valid = 'A'.repeat(32)
    const invalid = 'short'
    const duplicateHeaders = [
      `academy_session=${valid}; academy_session=${valid}`,
      `academy_session=${valid}; theme=dark; academy_session=${invalid}`,
      `academy_session=${invalid}; theme=dark; academy_session=${valid}`,
      `academy_session=; academy_session=${valid}`,
      `academy_session=${valid}; academy_session`,
    ]

    for (const header of duplicateHeaders) {
      expect(parseAcademySessionCookie(header)).toBeNull()
    }
  })

  it('enforces the opaque session id alphabet and inclusive length bounds', () => {
    expect(parseAcademySessionCookie(`academy_session=${'A'.repeat(32)}`)).toBe('A'.repeat(32))
    expect(parseAcademySessionCookie(`academy_session=${'A'.repeat(160)}`)).toBe('A'.repeat(160))

    for (const value of [
      'A'.repeat(31),
      'A'.repeat(161),
      `${'A'.repeat(31)}.`,
      `${'A'.repeat(31)}%`,
      `${'A'.repeat(31)}=`,
      `${'A'.repeat(31)} `,
      '',
    ]) {
      expect(parseAcademySessionCookie(`academy_session=${value}`)).toBeNull()
    }
  })
})
