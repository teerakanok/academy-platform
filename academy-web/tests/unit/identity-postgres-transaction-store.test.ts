import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  AcademyPostgresIdentityTransactionStore,
  IdentityPostgresTransactionStoreFailure,
} from '@/lib/identity/postgres-transaction-store'
import {
  IdentityTransactionError,
  IdentityTransactionStoreError,
  type LocalIdentityClient,
  type PendingIdentityTransactionInput,
} from '@/lib/identity/transaction'

const EXPIRES_AT = '2030-01-02T03:04:05.000Z'
const client: LocalIdentityClient = {
  clientId: 'academy-web-local',
  redirectUri: 'http://localhost:3000/auth/callback',
  serviceId: 'academy',
  audience: 'academy-api-local',
  expectedIssuer: 'https://identity.local.invalid',
  clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
}

function fixture(): { browserBinding: string; input: PendingIdentityTransactionInput } {
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

function rpcClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) }
}

function consumed(input: PendingIdentityTransactionInput) {
  return {
    status: 'consumed',
    transaction: {
      ...input,
      client: { ...input.client },
      expiresAt: EXPIRES_AT,
    },
  }
}

async function captureFixedFailure(run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
    throw new Error('expected postgres transaction store failure')
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityPostgresTransactionStoreFailure)
    expect(error).toMatchObject({
      name: 'IdentityPostgresTransactionStoreFailure',
      message: 'Identity durable transaction operation failed',
    })
    expect(Object.keys(error as object)).toEqual([])
    expect(JSON.stringify(error)).toBe('{}')
    expect(String(error)).not.toMatch(/credential|secret|database|TOP_SECRET/i)
    expect((error as Error).stack).not.toMatch(/credential=TOP_SECRET/)
  }
}

describe('AcademyPostgresIdentityTransactionStore', () => {
  it('creates one exact durable transaction through the database-clock RPC', async () => {
    const { input } = fixture()
    const clientValue = rpcClient({ data: { status: 'created', expiresAt: EXPIRES_AT }, error: null })
    const store = new AcademyPostgresIdentityTransactionStore(clientValue, { ttlSeconds: 300 })

    const result = await store.create(input)

    expect(clientValue.rpc).toHaveBeenCalledOnce()
    expect(clientValue.rpc).toHaveBeenCalledWith('create_identity_authorization_transaction', {
      p_state: input.state,
      p_code_verifier: input.codeVerifier,
      p_nonce: input.nonce,
      p_browser_binding_digest: input.browserBindingDigest,
      p_client_id: input.client.clientId,
      p_redirect_uri: input.client.redirectUri,
      p_service_id: input.client.serviceId,
      p_audience: input.client.audience,
      p_expected_issuer: input.client.expectedIssuer,
      p_client_assertion_audience: input.client.clientAssertionAudience,
      p_return_path: input.returnPath,
      p_ttl_seconds: 300,
    })
    expect(result).toEqual({
      ...input,
      client: input.client,
      expiresAt: Date.parse(EXPIRES_AT),
    })
    expect(result).not.toBe(input)
    expect(result.client).not.toBe(input.client)
  })

  it('hashes the raw browser binding locally and returns a fresh consumed projection', async () => {
    const { browserBinding, input } = fixture()
    const clientValue = rpcClient({ data: consumed(input), error: null })
    const store = new AcademyPostgresIdentityTransactionStore(clientValue)

    const result = await store.consume(input.state, browserBinding)

    expect(clientValue.rpc).toHaveBeenCalledWith('consume_identity_authorization_transaction', {
      p_state: input.state,
      p_browser_binding_digest: input.browserBindingDigest,
    })
    expect(result).toEqual({
      ...input,
      client: input.client,
      expiresAt: Date.parse(EXPIRES_AT),
    })
    expect(result.client).not.toBe(input.client)
  })

  it.each([
    ['unknown', 'unknown_state'],
    ['expired', 'expired_state'],
    ['browser_mismatch', 'browser_mismatch'],
  ] as const)('maps %s without leaking database detail', async (status, reason) => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(rpcClient({ data: { status }, error: null }))

    await expect(store.consume(input.state, browserBinding)).rejects.toMatchObject({
      name: 'IdentityTransactionError',
      reason,
    } satisfies Partial<IdentityTransactionError>)
  })

  it('rejects duplicate live state with the existing fixed store classification', async () => {
    const { input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(rpcClient({ data: { status: 'duplicate' }, error: null }))

    await expect(store.create(input)).rejects.toBeInstanceOf(IdentityTransactionStoreError)
  })

  it('rejects inexact input and invalid browser binding before RPC access', async () => {
    const { input } = fixture()
    const clientValue = rpcClient({ data: { status: 'created', expiresAt: EXPIRES_AT }, error: null })
    const store = new AcademyPostgresIdentityTransactionStore(clientValue)

    await expect(store.create({ ...input, browserBinding: 'RAW_SECRET' } as never))
      .rejects.toBeInstanceOf(IdentityTransactionStoreError)
    await expect(store.consume(input.state, 'not a canonical binding'))
      .rejects.toMatchObject({ reason: 'browser_mismatch' })
    expect(clientValue.rpc).not.toHaveBeenCalled()
  })

  it('captures the RPC method once with its receiver and snapshots each response descriptor once', async () => {
    const { input } = fixture()
    let methodReads = 0
    const receiver = {
      marker: 'durable-store-rpc',
      calls: 0,
      async invoke(this: { marker: string; calls: number }) {
        expect(this.marker).toBe('durable-store-rpc')
        this.calls += 1
        return { data: { status: 'created', expiresAt: EXPIRES_AT }, error: null }
      },
    }
    const clientValue = new Proxy(receiver, {
      get(target, property, proxyReceiver) {
        if (property === 'rpc') {
          methodReads += 1
          if (methodReads > 1) throw new Error('credential=TOP_SECRET')
          return target.invoke
        }
        return Reflect.get(target, property, proxyReceiver)
      },
    }) as unknown as { rpc: typeof receiver.invoke }
    const store = new AcademyPostgresIdentityTransactionStore(clientValue)

    await expect(store.create(input)).resolves.toMatchObject({ state: input.state })
    await expect(store.create({ ...input, state: randomBytes(32).toString('base64url') }))
      .resolves.toBeDefined()
    expect(methodReads).toBe(1)
    expect(receiver.calls).toBe(2)
  })

  it('reads RPC envelope and result descriptors once without ordinary property access', async () => {
    const { input } = fixture()
    const envelopeDescriptorReads = new Map<PropertyKey, number>()
    const resultDescriptorReads = new Map<PropertyKey, number>()
    let resultOwnKeysReads = 0
    const result = new Proxy({ status: 'created', expiresAt: EXPIRES_AT }, {
      get() {
        throw new Error('credential=TOP_SECRET')
      },
      ownKeys(target) {
        resultOwnKeysReads += 1
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, property) {
        resultDescriptorReads.set(property, (resultDescriptorReads.get(property) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    const envelope = new Proxy({ data: result, error: null }, {
      get(_target, property) {
        if (property === 'then') return undefined
        throw new Error('credential=TOP_SECRET')
      },
      getOwnPropertyDescriptor(target, property) {
        envelopeDescriptorReads.set(property, (envelopeDescriptorReads.get(property) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    const store = new AcademyPostgresIdentityTransactionStore({ rpc: vi.fn().mockResolvedValue(envelope) })

    await expect(store.create(input)).resolves.toMatchObject({ state: input.state })
    expect(resultOwnKeysReads).toBe(1)
    expect(Object.fromEntries(envelopeDescriptorReads)).toEqual({ data: 1, error: 1 })
    expect(Object.fromEntries(resultDescriptorReads)).toEqual({ status: 1, expiresAt: 1 })
  })

  it('collapses RPC throw, rejection, error, and malformed responses to one fixed failure', async () => {
    const { browserBinding, input } = fixture()
    const clients = [
      { rpc: vi.fn(() => { throw new Error('credential=TOP_SECRET') }) },
      { rpc: vi.fn(() => Promise.reject(new Error('credential=TOP_SECRET'))) },
      rpcClient({ data: null, error: { message: 'database credential=TOP_SECRET' } }),
      rpcClient({ data: { status: 'created', expiresAt: 'not-a-date credential=TOP_SECRET' }, error: null }),
      rpcClient({ data: { status: 'created', expiresAt: EXPIRES_AT, secret: 'TOP_SECRET' }, error: null }),
      rpcClient({ data: { status: 'consumed', transaction: { ...input, secret: 'TOP_SECRET' } }, error: null }),
    ]

    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[0]!).create(input))
    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[1]!).create(input))
    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[2]!).create(input))
    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[3]!).create(input))
    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[4]!).create(input))
    await captureFixedFailure(() => new AcademyPostgresIdentityTransactionStore(clients[5]!).consume(input.state, browserBinding))
  })

  it('rejects invalid construction and TTL without reading a second capability', () => {
    expect(() => new AcademyPostgresIdentityTransactionStore({ rpc: 'invalid' } as never))
      .toThrow(IdentityPostgresTransactionStoreFailure)
    expect(() => new AcademyPostgresIdentityTransactionStore(rpcClient({ data: null, error: null }), { ttlSeconds: 0 }))
      .toThrow(IdentityPostgresTransactionStoreFailure)
    expect(() => new AcademyPostgresIdentityTransactionStore(rpcClient({ data: null, error: null }), { ttlSeconds: 601 }))
      .toThrow(IdentityPostgresTransactionStoreFailure)
  })

  it('keeps durable table mutation behind two exact runtime-only RPCs', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0025_identity_authorization_transaction.sql'),
      'utf8',
    )

    expect(migration).toMatch(/create table if not exists academy\.identity_authorization_transaction/i)
    expect(migration).toMatch(/primary key \(state\)/i)
    expect(migration).toMatch(/create or replace function academy\.create_identity_authorization_transaction/i)
    expect(migration).toMatch(/create or replace function academy\.consume_identity_authorization_transaction/i)
    expect(migration).toMatch(/for update/i)
    expect(migration).toMatch(/clock_timestamp\(\)/i)
    expect(migration.match(/security definer/gi)).toHaveLength(2)
    expect(migration).toMatch(/limit 100[\s\S]*for update skip locked/i)
    expect(migration).toMatch(/enable row level security/i)
    expect(migration).toMatch(/delete from academy\.identity_authorization_transaction/i)
    expect(migration).toMatch(/revoke all on table academy\.identity_authorization_transaction[\s\S]*academy_runtime/i)
    expect(migration).not.toMatch(/grant (?:select|insert|update|delete)[\s\S]*identity_authorization_transaction/i)
    expect(migration.match(/grant execute on function academy\.(?:create|consume)_identity_authorization_transaction/g))
      .toHaveLength(2)
  })
})
