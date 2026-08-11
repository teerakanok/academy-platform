import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FileIdentityTransactionStore,
  beginIdentityAuthorization,
  IdentityTransactionError,
  type LocalIdentityClient,
} from '@/lib/identity/transaction'

const client: LocalIdentityClient = {
  clientId: 'academy-web-local',
  redirectUri: 'http://localhost:3000/auth/callback',
  serviceId: 'academy',
  audience: 'academy-api-local',
  expectedIssuer: 'https://identity.local.invalid',
  clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
}

function withTempStore(test: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'academy-identity-transaction-'))
  try {
    test(join(dir, 'transactions.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('local durable identity transaction store', () => {
  it('survives a store instance restart and consumes state only once', () => {
    withTempStore((path) => {
      const started = beginIdentityAuthorization(new FileIdentityTransactionStore(path), client, '/dashboard')
      expect(existsSync(`${path}.lock`)).toBe(false)
      const restarted = new FileIdentityTransactionStore(path)

      expect(restarted.consume(started.state)).toMatchObject({
        state: started.state,
        codeVerifier: started.codeVerifier,
        nonce: started.request.nonce,
        returnPath: '/dashboard',
      })
      expect(existsSync(`${path}.lock`)).toBe(false)
      expect(() => restarted.consume(started.state)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )
    })
  })

  it('deletes an expired state durably before returning the expiry error', () => {
    withTempStore((path) => {
      let now = 10_000
      const store = new FileIdentityTransactionStore(path, { now: () => now, ttlMs: 1_000 })
      const started = beginIdentityAuthorization(store, client, '/dashboard')
      now += 1_000

      expect(() => store.consume(started.state)).toThrowError(
        expect.objectContaining({ reason: 'expired_state' } satisfies Partial<IdentityTransactionError>),
      )
      expect(() => new FileIdentityTransactionStore(path).consume(started.state)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )
    })
  })

  it('fails closed when the persistence file is corrupted', () => {
    withTempStore((path) => {
      writeFileSync(path, '{not-json', { mode: 0o600 })

      expect(() => new FileIdentityTransactionStore(path).consume('state-that-does-not-matter')).toThrow(
        /identity transaction store/i,
      )
      expect(readFileSync(path, 'utf8')).toBe('{not-json')
    })
  })

  it('creates the parent directory before taking the first lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'academy-identity-nested-'))
    const path = join(dir, 'new', 'transactions.json')
    try {
      expect(() => beginIdentityAuthorization(new FileIdentityTransactionStore(path), client, '/dashboard')).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
