import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import type { ActivationStatus } from './adapter'
import { withExclusiveFileStoreLock } from './file-store-lock'

const SESSION_ID = /^[A-Za-z0-9_-]{32,160}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface IdentitySessionClaims {
  issuer: string
  subject: string
  verifiedEmail: string
  activation: { status: ActivationStatus; revision: number }
  createdAt?: number
  expiresAt?: number
}

interface StoredIdentitySession {
  id: string
  claims: IdentitySessionClaims & { createdAt: number; expiresAt: number }
}

interface PersistedSessionFile {
  version: 1
  sessions: StoredIdentitySession[]
}

export class IdentitySessionStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdentitySessionStoreError'
  }
}

function isStoredSession(value: unknown): value is StoredIdentitySession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredIdentitySession>
  if (typeof candidate.id !== 'string' || !SESSION_ID.test(candidate.id) || !candidate.claims || typeof candidate.claims !== 'object') {
    return false
  }
  const claims = candidate.claims as Partial<StoredIdentitySession['claims']>
  return (
    typeof claims.issuer === 'string' &&
    claims.issuer.length > 0 &&
    typeof claims.subject === 'string' &&
    claims.subject.length > 0 &&
    typeof claims.verifiedEmail === 'string' &&
    EMAIL.test(claims.verifiedEmail) &&
    typeof claims.createdAt === 'number' &&
    Number.isSafeInteger(claims.createdAt) &&
    typeof claims.expiresAt === 'number' &&
    Number.isSafeInteger(claims.expiresAt) &&
    claims.expiresAt > claims.createdAt &&
    !!claims.activation &&
    typeof claims.activation === 'object' &&
    ['pending', 'active', 'suspended', 'deactivated'].includes(claims.activation.status ?? '') &&
    Number.isSafeInteger(claims.activation.revision) &&
    claims.activation.revision >= 1
  )
}

/** Local-only durable session preparation; deliberately not wired into auth/session.ts. */
export class FileIdentitySessionStore {
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(
    private readonly filePath: string,
    { now = Date.now, ttlMs = 30 * 24 * 60 * 60_000 }: { now?: () => number; ttlMs?: number } = {},
  ) {
    if (!isAbsolute(filePath)) throw new IdentitySessionStoreError('identity session store ต้องใช้ absolute file path')
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new IdentitySessionStoreError('identity session store TTL ไม่ถูกต้อง')
    this.now = now
    this.ttlMs = ttlMs
  }

  create(input: IdentitySessionClaims): { id: string; claims: IdentitySessionClaims & { createdAt: number; expiresAt: number } } {
    validateClaims(input)
    const createdAt = input.createdAt ?? this.now()
    const expiresAt = input.expiresAt ?? createdAt + this.ttlMs
    if (!Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= createdAt) {
      throw new IdentitySessionStoreError('identity session claims มีเวลาไม่ถูกต้อง')
    }
    return withExclusiveFileStoreLock(this.filePath, () => {
      const sessions = this.read().filter((session) => session.claims.expiresAt > this.now())
      const session = {
        id: randomBytes(32).toString('base64url'),
        claims: { ...input, createdAt, expiresAt },
      }
      sessions.push(session)
      this.write(sessions)
      return session
    })
  }

  get(id: string): (IdentitySessionClaims & { createdAt: number; expiresAt: number }) | null {
    if (!SESSION_ID.test(id)) return null
    return withExclusiveFileStoreLock(this.filePath, () => {
      const sessions = this.read()
      const index = sessions.findIndex((session) => session.id === id)
      if (index === -1) return null
      const session = sessions[index]
      if (this.now() >= session.claims.expiresAt) {
        sessions.splice(index, 1)
        this.write(sessions)
        return null
      }
      return { ...session.claims, activation: { ...session.claims.activation } }
    })
  }

  revoke(id: string): void {
    if (!SESSION_ID.test(id)) return
    withExclusiveFileStoreLock(this.filePath, () => {
      const sessions = this.read()
      const remaining = sessions.filter((session) => session.id !== id)
      if (remaining.length !== sessions.length) this.write(remaining)
    })
  }

  private read(): StoredIdentitySession[] {
    if (!existsSync(this.filePath)) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      throw new IdentitySessionStoreError('identity session store อ่านข้อมูลไม่ได้')
    }
    if (!parsed || typeof parsed !== 'object') throw new IdentitySessionStoreError('identity session store มีรูปแบบไม่ถูกต้อง')
    const file = parsed as Partial<PersistedSessionFile>
    if (file.version !== 1 || !Array.isArray(file.sessions) || !file.sessions.every(isStoredSession)) {
      throw new IdentitySessionStoreError('identity session store มีรูปแบบไม่ถูกต้อง')
    }
    return file.sessions.map((session) => ({ ...session, claims: { ...session.claims, activation: { ...session.claims.activation } } }))
  }

  private write(sessions: StoredIdentitySession[]): void {
    const directory = dirname(this.filePath)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
    try {
      writeFileSync(temporaryPath, JSON.stringify({ version: 1, sessions } satisfies PersistedSessionFile), {
        encoding: 'utf8',
        mode: 0o600,
      })
      chmodSync(temporaryPath, 0o600)
      renameSync(temporaryPath, this.filePath)
      chmodSync(this.filePath, 0o600)
    } catch {
      try {
        unlinkSync(temporaryPath)
      } catch {
        // Best-effort cleanup; the original durable file remains untouched.
      }
      throw new IdentitySessionStoreError('identity session store เขียนข้อมูลไม่ได้')
    }
  }
}

function validateClaims(claims: IdentitySessionClaims): void {
  if (!claims.issuer || !claims.subject || !EMAIL.test(claims.verifiedEmail)) {
    throw new IdentitySessionStoreError('identity session claims ไม่มี canonical principal หรือ verified email')
  }
  if (!['pending', 'active', 'suspended', 'deactivated'].includes(claims.activation.status)) {
    throw new IdentitySessionStoreError('identity session claims มี activation status ไม่ถูกต้อง')
  }
  if (!Number.isSafeInteger(claims.activation.revision) || claims.activation.revision < 1) {
    throw new IdentitySessionStoreError('identity session claims มี activation revision ไม่ถูกต้อง')
  }
}

export function academySessionCookie(
  sessionId: string,
  { secure = true, maxAge }: { secure?: boolean; maxAge?: number } = {},
): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('identity session cookie ต้องใช้ opaque session id')
  const parts = [`academy_session=${encodeURIComponent(sessionId)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  if (maxAge !== undefined) {
    if (!Number.isSafeInteger(maxAge) || maxAge < 0) throw new Error('identity session cookie maxAge ไม่ถูกต้อง')
    parts.push(`Max-Age=${maxAge}`)
  }
  return parts.join('; ')
}
