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
const SESSION_ID = 'S'.repeat(43)
const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000'
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

function exchangeResult(input: PendingIdentityTransactionInput) {
  return {
    issuer: input.client.expectedIssuer,
    subject: 'principal-subject',
    verifiedEmail: 'learner@example.com',
    audience: input.client.audience,
    serviceId: input.client.serviceId,
    nonce: input.nonce,
    activation: { status: 'active' as const, revision: 7 },
  }
}

function claimed(input: PendingIdentityTransactionInput, result: unknown = null) {
  return {
    status: 'claimed',
    sessionId: SESSION_ID,
    exchangeResult: result,
    transaction: consumed(input).transaction,
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

  it('claims without consuming, then releases or finalizes only the exact local claim', async () => {
    const { browserBinding, input } = fixture()
    const exchanged = exchangeResult(input)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: claimed(input), error: null })
      .mockResolvedValueOnce({ data: { status: 'checkpointed' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'released' }, error: null })
      .mockResolvedValueOnce({ data: claimed(input, exchanged), error: null })
      .mockResolvedValueOnce({ data: { status: 'completed' }, error: null })
    const store = new AcademyPostgresIdentityTransactionStore({ rpc })

    const first = await store.claim(input.state, browserBinding)
    expect(first.status).toBe('claimed')
    if (first.status !== 'claimed') throw new Error('expected active claim')
    expect(first.claimToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.sessionId).toBe(SESSION_ID)
    expect(first.exchangeResult).toBeNull()
    expect(first.transaction).toMatchObject({ state: input.state })
    expect(rpc.mock.calls[0]?.[0]).toBe('claim_identity_authorization_transaction')
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_state: input.state,
      p_browser_binding_digest: input.browserBindingDigest,
      p_claim_digest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      p_session_id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      p_lease_seconds: 30,
    })

    await store.checkpoint(first, exchanged)
    expect(rpc.mock.calls[1]?.[0]).toBe('checkpoint_identity_authorization_exchange')
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_state: input.state,
      p_claim_digest: rpc.mock.calls[0]?.[1].p_claim_digest,
      p_issuer: exchanged.issuer,
      p_subject: exchanged.subject,
      p_verified_email: exchanged.verifiedEmail,
      p_activation_status: 'active',
      p_activation_revision: 7,
    })

    await store.release(first, 'client_assertion')
    expect(rpc.mock.calls[2]?.[0]).toBe('release_identity_authorization_transaction_claim')
    expect(rpc.mock.calls[2]?.[1]).toMatchObject({
      p_state: input.state,
      p_claim_digest: rpc.mock.calls[0]?.[1].p_claim_digest,
      p_failure_stage: 'client_assertion',
    })

    const second = await store.claim(input.state, browserBinding)
    expect(second.status).toBe('claimed')
    if (second.status !== 'claimed') throw new Error('expected resumed claim')
    expect(second.exchangeResult).toEqual(exchanged)
    await store.finalize(second, {
      accountId: ACCOUNT_ID,
      sessionId: SESSION_ID,
      returnPath: input.returnPath,
    })
    expect(rpc.mock.calls[4]?.[0]).toBe('finalize_identity_authorization_transaction')
    expect(rpc.mock.calls[4]?.[1]).toMatchObject({
      p_state: input.state,
      p_claim_digest: rpc.mock.calls[3]?.[1].p_claim_digest,
      p_account_id: ACCOUNT_ID,
      p_session_id: SESSION_ID,
      p_subject_key: expect.stringMatching(/^[a-f0-9]+$/),
    })
  })

  it('returns an exact completed receipt without exposing a new claim token', async () => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(rpcClient({
      data: {
        status: 'completed',
        receipt: { accountId: ACCOUNT_ID, sessionId: SESSION_ID, returnPath: '/dashboard' },
      },
      error: null,
    }))

    await expect(store.claim(input.state, browserBinding)).resolves.toEqual({
      status: 'completed',
      receipt: { accountId: ACCOUNT_ID, sessionId: SESSION_ID, returnPath: '/dashboard' },
    })
  })

  it('retries only the idempotent verified-result checkpoint after response loss', async () => {
    const { browserBinding, input } = fixture()
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: claimed(input), error: null })
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ data: { status: 'checkpointed' }, error: null })
    const store = new AcademyPostgresIdentityTransactionStore({ rpc })
    const claim = await store.claim(input.state, browserBinding)
    if (claim.status !== 'claimed') throw new Error('expected active claim')

    await expect(store.checkpoint(claim, exchangeResult(input))).resolves.toBeUndefined()
    expect(rpc.mock.calls.slice(1).map(([name]) => name)).toEqual([
      'checkpoint_identity_authorization_exchange',
      'checkpoint_identity_authorization_exchange',
    ])
    expect(rpc.mock.calls[1]?.[1]).toEqual(rpc.mock.calls[2]?.[1])
  })

  it.each([
    ['unknown', 'unknown_state'],
    ['expired', 'expired_state'],
    ['browser_mismatch', 'browser_mismatch'],
    ['in_progress', 'claim_in_progress'],
    ['exhausted', 'claim_exhausted'],
  ] as const)('maps claim status %s to fixed reason %s', async (status, reason) => {
    const { browserBinding, input } = fixture()
    const store = new AcademyPostgresIdentityTransactionStore(
      rpcClient({ data: { status }, error: null }),
    )

    await expect(store.claim(input.state, browserBinding)).rejects.toMatchObject({ reason })
  })

  it('rejects malformed claim settlement and fixed-stage drift before mutation', async () => {
    const { input } = fixture()
    const rpc = vi.fn()
    const store = new AcademyPostgresIdentityTransactionStore({ rpc })
    const malformed = { status: 'claimed', claimToken: 'short', sessionId: SESSION_ID,
      exchangeResult: null, transaction: { ...input, expiresAt: Date.parse(EXPIRES_AT) } }

    await expect(store.release(malformed as never, 'code_exchange'))
      .rejects.toBeInstanceOf(IdentityPostgresTransactionStoreFailure)
    await expect(store.finalize(malformed as never, {
      accountId: ACCOUNT_ID, sessionId: SESSION_ID, returnPath: '/dashboard',
    }))
      .rejects.toBeInstanceOf(IdentityPostgresTransactionStoreFailure)
    await expect(store.release({
      status: 'claimed',
      claimToken: 'c'.repeat(43),
      sessionId: SESSION_ID,
      exchangeResult: null,
      transaction: { ...input, expiresAt: Date.parse(EXPIRES_AT) },
    }, 'other' as never)).rejects.toBeInstanceOf(IdentityPostgresTransactionStoreFailure)
    expect(rpc).not.toHaveBeenCalled()
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

  it('keeps completion retry state behind bounded runtime-only state-machine RPCs', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0028_identity_authorization_completion_lease.sql'),
      'utf8',
    )

    expect(migration).toMatch(/attempt_count between 0 and 3/i)
    expect(migration).toMatch(/p_lease_seconds not between 1 and 60/i)
    expect(migration).toMatch(/for update/i)
    expect(migration).toMatch(/claim_digest ~ '\^\[A-Za-z0-9_-\]\{43\}\$'/i)
    expect(migration).toMatch(/last_failure_stage is null or last_failure_stage in/i)
    expect(migration).toMatch(/create or replace function academy\.claim_identity_authorization_transaction/i)
    expect(migration).toMatch(/create or replace function academy\.checkpoint_identity_authorization_exchange/i)
    expect(migration).toMatch(/create or replace function academy\.release_identity_authorization_transaction_claim/i)
    expect(migration).toMatch(/create or replace function academy\.finalize_identity_authorization_transaction/i)
    expect(migration.match(/security definer/gi)).toHaveLength(5)
    expect(migration.match(/grant execute on function academy\.(?:claim_identity_authorization_transaction|checkpoint_identity_authorization_exchange|release_identity_authorization_transaction_claim|finalize_identity_authorization_transaction)/g))
      .toHaveLength(4)
    expect(migration).toMatch(/result_issuer is null[\s\S]*result_activation_revision is null/i)
    expect(migration).toMatch(/completed_account_id is not null[\s\S]*claim_digest is null/i)
    expect(migration).toMatch(/status', 'completed'[\s\S]*sessionId/i)
    expect(migration).toMatch(/attempt_count <> 0[\s\S]*status', 'unknown'[\s\S]*delete from academy\.identity_authorization_transaction/i)
    expect(migration).not.toMatch(/grant (?:select|insert|update|delete)[\s\S]*identity_authorization_transaction/i)
  })
})
