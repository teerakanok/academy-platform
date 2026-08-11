import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FileIdentityTransactionStore,
  InMemoryIdentityTransactionStore,
  beginIdentityAuthorization,
  IdentityTransactionError,
  IdentityTransactionStoreError,
  type LocalIdentityAuthorizationRegistration,
  type LocalIdentityClient,
  type PendingIdentityTransactionInput,
} from '@/lib/identity/transaction'

const client: LocalIdentityClient = {
  clientId: 'academy-web-local',
  redirectUri: 'http://localhost:3000/auth/callback',
  serviceId: 'academy',
  audience: 'academy-api-local',
  expectedIssuer: 'https://identity.local.invalid',
  clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
}
const registration = {
  client,
  redirectUris: [client.redirectUri],
} as const satisfies LocalIdentityAuthorizationRegistration

function transactionFixture(): {
  browserBinding: string
  input: PendingIdentityTransactionInput
} {
  const browserBinding = randomBytes(32).toString('base64url')
  return {
    browserBinding,
    input: {
      state: randomBytes(32).toString('base64url'),
      codeVerifier: randomBytes(48).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      browserBindingDigest: createHash('sha256').update(browserBinding).digest('base64url'),
      client: { ...client },
      returnPath: '/dashboard',
    },
  }
}

function noncanonicalDigestAlias(canonical: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const index = alphabet.indexOf(canonical.at(-1)!)
  const alias = `${canonical.slice(0, -1)}${alphabet[index + 1]}`
  if (Buffer.from(alias, 'base64url').toString('hex') !== Buffer.from(canonical, 'base64url').toString('hex')) {
    throw new Error('test fixture did not produce an equivalent digest alias')
  }
  return alias
}

async function withTempStore(test: (path: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'academy-identity-transaction-'))
  try {
    await test(join(dir, 'transactions.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('local durable identity transaction store', () => {
  it('survives a store instance restart and consumes state only once', async () => {
    await withTempStore(async (path) => {
      const started = await beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')
      expect(existsSync(`${path}.lock`)).toBe(false)
      const restarted = new FileIdentityTransactionStore(path)

      expect(() => restarted.consume(started.state, randomBytes(32).toString('base64url'))).toThrowError(
        expect.objectContaining({ reason: 'browser_mismatch' } satisfies Partial<IdentityTransactionError>),
      )

      expect(new FileIdentityTransactionStore(path).consume(started.state, started.browserBinding)).toMatchObject({
        state: started.state,
        codeVerifier: started.codeVerifier,
        nonce: started.request.nonce,
        browserBindingDigest: createHash('sha256').update(started.browserBinding).digest('base64url'),
        returnPath: '/dashboard',
      })
      expect(existsSync(`${path}.lock`)).toBe(false)
      expect(() => restarted.consume(started.state, started.browserBinding)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )
    })
  })

  it('deletes an expired state durably before returning the expiry error', async () => {
    await withTempStore(async (path) => {
      let now = 10_000
      const store = new FileIdentityTransactionStore(path, { now: () => now, ttlMs: 1_000 })
      const started = await beginIdentityAuthorization(store, registration, '/dashboard')
      now += 1_000

      expect(() => store.consume(started.state, started.browserBinding)).toThrowError(
        expect.objectContaining({ reason: 'expired_state' } satisfies Partial<IdentityTransactionError>),
      )
      expect(() => new FileIdentityTransactionStore(path).consume(started.state, started.browserBinding)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )
    })
  })

  it('fails closed when the persistence file is corrupted', async () => {
    await withTempStore((path) => {
      writeFileSync(path, '{not-json', { mode: 0o600 })

      expect(() => new FileIdentityTransactionStore(path).consume('state-that-does-not-matter', randomBytes(32).toString('base64url'))).toThrow(
        /identity transaction store/i,
      )
      expect(readFileSync(path, 'utf8')).toBe('{not-json')
    })
  })

  it('persists only a digest of the browser binding in the versioned transaction file', async () => {
    await withTempStore(async (path) => {
      const started = await beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')
      const persistedText = readFileSync(path, 'utf8')
      const persisted = JSON.parse(persistedText) as {
        version: unknown
        transactions: Array<Record<string, unknown>>
      }

      expect(persisted.version).toBe(2)
      expect(persisted.transactions).toHaveLength(1)
      expect(persisted.transactions[0]?.browserBindingDigest).toBe(
        createHash('sha256').update(started.browserBinding).digest('base64url'),
      )
      expect(persistedText).not.toContain(started.browserBinding)
      expect(persisted.transactions[0]).not.toHaveProperty('browserBinding')
    })
  })

  it('rejects surplus transaction data before memory or file mutation', async () => {
    await withTempStore((path) => {
      const marker = 'RAW_BROWSER_BINDING_MUST_NOT_PERSIST'
      const { browserBinding, input } = transactionFixture()
      const badInputs = [
        Object.assign({ ...input, client: { ...input.client } }, { browserBinding: marker }),
        { ...input, client: Object.assign({ ...input.client }, { clientSecret: marker }) },
        Object.assign({ ...input, client: { ...input.client } }, { toJSON: () => ({ browserBinding: marker }) }),
      ]
      const memory = new InMemoryIdentityTransactionStore()
      const file = new FileIdentityTransactionStore(path)

      for (const badInput of badInputs) {
        expect(() => memory.create(badInput)).toThrow(IdentityTransactionStoreError)
        expect(() => file.create(badInput)).toThrow(IdentityTransactionStoreError)
      }

      expect(existsSync(path)).toBe(false)
      expect(() => memory.create(input)).not.toThrow()
      expect(memory.consume(input.state, browserBinding)).not.toHaveProperty('browserBinding')
      expect(() => file.create(input)).not.toThrow()
      expect(readFileSync(path, 'utf8')).not.toContain(marker)
    })
  })

  it('rejects accessor and hostile Proxy input without invoking hidden behavior or mutating storage', async () => {
    await withTempStore((path) => {
      const marker = 'credential=TOP_SECRET_TRANSACTION_PROXY'
      const { input } = transactionFixture()
      let getterCalls = 0
      const accessorInput = { ...input, client: { ...input.client } }
      Object.defineProperty(accessorInput, 'browserBindingDigest', {
        enumerable: true,
        get() {
          getterCalls += 1
          return input.browserBindingDigest
        },
      })
      const proxyInput = new Proxy({ ...input, client: { ...input.client } }, {
        ownKeys() {
          throw new Error(marker)
        },
      })

      for (const candidate of [accessorInput, proxyInput]) {
        for (const store of [new InMemoryIdentityTransactionStore(), new FileIdentityTransactionStore(path)]) {
          let captured: unknown
          try {
            store.create(candidate)
          } catch (error) {
            captured = error
          }
          expect(captured).toBeInstanceOf(IdentityTransactionStoreError)
          expect(String(captured)).not.toContain(marker)
        }
      }

      expect(getterCalls).toBe(0)
      expect(existsSync(path)).toBe(false)
    })
  })

  it('rejects a noncanonical base64url alias for the same digest bytes', async () => {
    await withTempStore((path) => {
      const { input } = transactionFixture()
      const alias = noncanonicalDigestAlias(input.browserBindingDigest)
      expect(alias).not.toBe(input.browserBindingDigest)

      for (const store of [new InMemoryIdentityTransactionStore(), new FileIdentityTransactionStore(path)]) {
        expect(() => store.create({ ...input, browserBindingDigest: alias })).toThrow(IdentityTransactionStoreError)
      }
      expect(existsSync(path)).toBe(false)
    })
  })

  it('rejects duplicate live state in memory and across file-store instances', async () => {
    await withTempStore((path) => {
      const { browserBinding, input } = transactionFixture()
      const memory = new InMemoryIdentityTransactionStore()
      memory.create(input)
      expect(() => memory.create(input)).toThrow(IdentityTransactionStoreError)
      expect(memory.consume(input.state, browserBinding)).toMatchObject({ state: input.state })
      expect(() => memory.consume(input.state, browserBinding)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )

      new FileIdentityTransactionStore(path).create(input)
      expect(() => new FileIdentityTransactionStore(path).create(input)).toThrow(IdentityTransactionStoreError)
      expect(new FileIdentityTransactionStore(path).consume(input.state, browserBinding)).toMatchObject({ state: input.state })
      expect(() => new FileIdentityTransactionStore(path).consume(input.state, browserBinding)).toThrowError(
        expect.objectContaining({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>),
      )
    })
  })

  it('rejects a duplicate-state persisted file without consuming or rewriting it', async () => {
    await withTempStore(async (path) => {
      const started = await beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')
      const persisted = JSON.parse(readFileSync(path, 'utf8')) as {
        transactions: Array<Record<string, unknown>>
      }
      persisted.transactions.push(structuredClone(persisted.transactions[0]!))
      const duplicateText = JSON.stringify(persisted)
      writeFileSync(path, duplicateText, { mode: 0o600 })

      expect(() => new FileIdentityTransactionStore(path).consume(started.state, started.browserBinding)).toThrow(
        IdentityTransactionStoreError,
      )
      expect(readFileSync(path, 'utf8')).toBe(duplicateText)
    })
  })

  it('fails closed without rewriting a legacy version-one transaction file', async () => {
    await withTempStore(async (path) => {
      const started = await beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')
      const legacyText = readFileSync(path, 'utf8').replace('"version":2', '"version":1')
      writeFileSync(path, legacyText, { mode: 0o600 })

      expect(() => new FileIdentityTransactionStore(path).consume(started.state, started.browserBinding)).toThrow(
        /identity transaction store/i,
      )
      expect(readFileSync(path, 'utf8')).toBe(legacyText)
    })
  })

  it('fails closed without rewriting a malformed browser-binding digest', async () => {
    await withTempStore(async (path) => {
      const started = await beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')
      const persisted = JSON.parse(readFileSync(path, 'utf8')) as {
        transactions: Array<Record<string, unknown>>
      }
      persisted.transactions[0]!.browserBindingDigest = 'malformed'
      const malformedText = JSON.stringify(persisted)
      writeFileSync(path, malformedText, { mode: 0o600 })

      expect(() => new FileIdentityTransactionStore(path).consume(started.state, started.browserBinding)).toThrow(
        /identity transaction store/i,
      )
      expect(readFileSync(path, 'utf8')).toBe(malformedText)
    })
  })

  it('creates the parent directory before taking the first lock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'academy-identity-nested-'))
    const path = join(dir, 'new', 'transactions.json')
    try {
      await expect(beginIdentityAuthorization(new FileIdentityTransactionStore(path), registration, '/dashboard')).resolves.toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
