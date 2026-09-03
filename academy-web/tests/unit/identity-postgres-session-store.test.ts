import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  AcademyPostgresIdentitySessionStore,
  IdentityPostgresSessionStoreFailure,
} from '@/lib/identity/postgres-session-store'

const CREATED_AT = '2030-01-02T03:04:05.000Z'
const EXPIRES_AT = '2030-01-03T03:04:05.000Z'

const claims = {
  issuer: 'https://accounts.example.test/auth/v1',
  subject: 'academy-learner-1',
  verifiedEmail: 'learner@example.test',
  activation: { status: 'active' as const, revision: 7 },
}

function session(id = 'A'.repeat(43), overrides: Record<string, unknown> = {}) {
  return {
    id,
    claims: {
      issuer: claims.issuer,
      subjectKey: encodeSubjectKey(claims.subject),
      verifiedEmail: claims.verifiedEmail,
      activation: { ...claims.activation },
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      ...overrides,
    },
  }
}

function encodeSubjectKey(subject: string): string {
  let key = ''
  for (let index = 0; index < subject.length; index += 1) {
    key += subject.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return key
}

function client(results: Array<{ data: unknown; error: unknown }> | { data: unknown; error: unknown }) {
  const queue = Array.isArray(results) ? [...results] : [results]
  return { rpc: vi.fn().mockImplementation(() => Promise.resolve(queue.shift())) }
}

function createdClient(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn().mockImplementation((_name: string, parameters: Record<string, unknown>) => Promise.resolve({
      data: {
        status: 'created',
        session: session(parameters.p_session_id as string, {
          issuer: parameters.p_issuer,
          subjectKey: parameters.p_subject_key,
          verifiedEmail: parameters.p_verified_email,
          activation: {
            status: parameters.p_activation_status,
            revision: parameters.p_activation_revision,
          },
          ...overrides,
        }),
      },
      error: null,
    })),
  }
}

async function fixedFailure(run: () => Promise<unknown>) {
  try {
    await run()
    throw new Error('expected durable session failure')
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityPostgresSessionStoreFailure)
    expect(error).toMatchObject({
      name: 'IdentityPostgresSessionStoreFailure',
      message: 'Identity durable session operation failed',
    })
    expect(Object.keys(error as object)).toEqual([])
    expect(JSON.stringify(error)).toBe('{}')
    expect(String(error)).not.toMatch(/credential|secret|database|TOP_SECRET/i)
    expect((error as Error).stack).not.toMatch(/credential=TOP_SECRET/)
  }
}

describe('AcademyPostgresIdentitySessionStore', () => {
  it('creates an opaque high-entropy session with exact runtime-completion claims', async () => {
    const db = createdClient()
    const store = new AcademyPostgresIdentitySessionStore(db, { ttlSeconds: 86_400 })

    const created = await store.create(claims)

    expect(created.id).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(created.claims).toEqual({
      ...claims,
      createdAt: Date.parse(CREATED_AT),
      expiresAt: Date.parse(EXPIRES_AT),
    })
    expect(Reflect.ownKeys(created.claims)).toEqual([
      'issuer', 'subject', 'verifiedEmail', 'activation', 'createdAt', 'expiresAt',
    ])
    expect(db.rpc).toHaveBeenCalledWith('create_identity_session', expect.objectContaining({
      p_session_id: created.id,
      p_issuer: claims.issuer,
      p_subject_key: encodeSubjectKey(claims.subject),
      p_verified_email: claims.verifiedEmail,
      p_activation_status: 'active',
      p_activation_revision: 7,
      p_ttl_seconds: 86_400,
    }))
    expect(JSON.stringify(db.rpc.mock.calls)).not.toMatch(/course|entitlement|service_role/i)
  })

  it('rejects a database principal or activation mismatch', async () => {
    const store = new AcademyPostgresIdentitySessionStore(createdClient({
      subjectKey: encodeSubjectKey('different'),
    }))
    await fixedFailure(() => store.create(claims))
  })

  it.each([
    ['uppercase issuer', { ...claims, issuer: 'https://ACCOUNTS.example.test/auth/v1' }],
    ['non-contract issuer', { ...claims, issuer: 'https://identity-control.example.test/' }],
    ['overbound UTF-16 subject', { ...claims, subject: 'a'.repeat(513) }],
    ['unpaired high surrogate', { ...claims, subject: 'before\ud800after' }],
    ['unpaired low surrogate', { ...claims, subject: 'before\udc00after' }],
    ['NUL subject', { ...claims, subject: 'before\0after' }],
  ])('enforces lifecycle principal parity before raw RPC: %s', async (_name, input) => {
    const db = createdClient()
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(db).create(input))
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it.each([
    'https://accounts.example.test/',
    'https://accounts.example.test/auth/v1',
    'https://accounts.example.test/auth/v1/',
    'https://supabase.cyberskills.co.th/auth/v1',
  ])('accepts exact lifecycle issuer vector %s', async (issuer) => {
    const input = { ...claims, issuer }
    await expect(new AcademyPostgresIdentitySessionStore(createdClient()).create(input))
      .resolves.toMatchObject({ claims: { issuer } })
  })

  it.each([
    'ก'.repeat(512),
    '😀'.repeat(256),
    '\ud800\udc00',
  ])('round-trips valid lifecycle UTF-16 subject boundary', async (subject) => {
    const input = { ...claims, subject }
    const db = createdClient()
    await expect(new AcademyPostgresIdentitySessionStore(db).create(input))
      .resolves.toMatchObject({ claims: { subject } })
    expect(db.rpc).toHaveBeenCalledWith('create_identity_session', expect.objectContaining({
      p_subject_key: encodeSubjectKey(subject),
    }))
  })

  it.each([2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'round-trips activation revision %s without integer narrowing',
    async (revision) => {
      const input = { ...claims, activation: { ...claims.activation, revision } }
      const db = {
        rpc: vi.fn().mockImplementation((_name: string, parameters: Record<string, unknown>) => Promise.resolve({
          data: {
            status: 'created',
            session: session(parameters.p_session_id as string, {
              activation: { ...claims.activation, revision },
            }),
          },
          error: null,
        })),
      }
      await expect(new AcademyPostgresIdentitySessionStore(db).create(input))
        .resolves.toMatchObject({ claims: { activation: { revision } } })
      expect(db.rpc).toHaveBeenCalledWith('create_identity_session', expect.objectContaining({
        p_activation_revision: revision,
      }))
    },
  )

  it('rejects a revision above MAX_SAFE before RPC', async () => {
    const db = createdClient()
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(db).create({
      ...claims,
      activation: { ...claims.activation, revision: Number.MAX_SAFE_INTEGER + 1 },
    }))
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('reads exact claims and treats unknown or expired sessions as absent', async () => {
    const db = client([
      { data: { status: 'active', session: session() }, error: null },
      { data: { status: 'expired' }, error: null },
      { data: { status: 'unknown' }, error: null },
    ])
    const store = new AcademyPostgresIdentitySessionStore(db)
    await expect(store.get('A'.repeat(43))).resolves.toEqual({
      ...claims, createdAt: Date.parse(CREATED_AT), expiresAt: Date.parse(EXPIRES_AT),
    })
    await expect(store.get('B'.repeat(43))).resolves.toBeNull()
    await expect(store.get('C'.repeat(43))).resolves.toBeNull()
  })

  it('revokes idempotently and invalid opaque IDs never reach the database', async () => {
    const db = client([
      { data: { status: 'revoked' }, error: null },
      { data: { status: 'absent' }, error: null },
    ])
    const store = new AcademyPostgresIdentitySessionStore(db)
    await store.revoke('A'.repeat(43))
    await store.revoke('A'.repeat(43))
    await expect(store.get('not-a-session')).resolves.toBeNull()
    await expect(store.revoke('not-a-session')).resolves.toBeUndefined()
    expect(db.rpc).toHaveBeenCalledTimes(2)
  })

  it('retries one generated-ID collision with a distinct ID then stops bounded', async () => {
    let collision = true
    const db = {
      rpc: vi.fn().mockImplementation((_name: string, parameters: Record<string, unknown>) => {
        if (collision) {
          collision = false
          return Promise.resolve({ data: { status: 'duplicate' }, error: null })
        }
        return Promise.resolve({
          data: { status: 'created', session: session(parameters.p_session_id as string) },
          error: null,
        })
      }),
    }
    const store = new AcademyPostgresIdentitySessionStore(db)
    const created = await store.create(claims)
    const ids = db.rpc.mock.calls.map(([, parameters]) => parameters.p_session_id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(created.id).toBe(ids[1])

    const duplicates = client([
      { data: { status: 'duplicate' }, error: null },
      { data: { status: 'duplicate' }, error: null },
    ])
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(duplicates).create(claims))
    expect(duplicates.rpc).toHaveBeenCalledTimes(2)
  })

  it('reuses only an exact stable session after a committed-create response is lost', async () => {
    const stableId = 'I'.repeat(43)
    const exact = client([
      { data: { status: 'duplicate' }, error: null },
      { data: { status: 'active', session: session(stableId) }, error: null },
    ])
    await expect(new AcademyPostgresIdentitySessionStore(exact).create(claims, stableId))
      .resolves.toMatchObject({ id: stableId, claims })
    expect(exact.rpc).toHaveBeenNthCalledWith(1, 'create_identity_session', expect.objectContaining({
      p_session_id: stableId,
    }))
    expect(exact.rpc).toHaveBeenNthCalledWith(2, 'read_identity_session', {
      p_session_id: stableId,
    })

    const mismatch = client([
      { data: { status: 'duplicate' }, error: null },
      {
        data: {
          status: 'active',
          session: session(stableId, { subjectKey: encodeSubjectKey('other-principal') }),
        },
        error: null,
      },
    ])
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(mismatch).create(claims, stableId))
  })

  it('rejects surplus input and response before authority can widen', async () => {
    const inputClient = client({ data: { status: 'created', session: session() }, error: null })
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(inputClient).create({
      ...claims,
      courseEntitlements: ['all'],
    } as never))
    expect(inputClient.rpc).not.toHaveBeenCalled()

    const outputClient = client({
      data: { status: 'active', session: { ...session(), courseEntitlements: ['all'] } },
      error: null,
    })
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore(outputClient).get('A'.repeat(43)))
  })

  it('captures the RPC method once with its receiver and contains hostile proxies', async () => {
    let reads = 0
    const receiver = {
      marker: 'session-rpc',
      async invoke(this: { marker: string }, _name: string, parameters: Record<string, unknown>) {
        expect(this.marker).toBe('session-rpc')
        return {
          data: { status: 'created', session: session(parameters.p_session_id as string) },
          error: null,
        }
      },
    }
    const proxy = new Proxy(receiver, {
      get(target, property, proxyReceiver) {
        if (property === 'rpc') {
          reads += 1
          if (reads > 1) throw new Error('credential=TOP_SECRET')
          return target.invoke
        }
        return Reflect.get(target, property, proxyReceiver)
      },
    }) as unknown as { rpc: typeof receiver.invoke }
    await new AcademyPostgresIdentitySessionStore(proxy).create(claims)
    expect(reads).toBe(1)

    const hostile = new Proxy({ data: null, error: null }, {
      get(_target, property) {
        if (property === 'then') return undefined
        throw new Error('credential=TOP_SECRET')
      },
    })
    await fixedFailure(() => new AcademyPostgresIdentitySessionStore({
      rpc: vi.fn().mockResolvedValue(hostile),
    }).create(claims))
  })

  it('collapses DB throw, rejection, error, malformed time, and surplus into one fixed error', async () => {
    const stores = [
      new AcademyPostgresIdentitySessionStore({ rpc() { throw new Error('credential=TOP_SECRET') } }),
      new AcademyPostgresIdentitySessionStore({ rpc: () => Promise.reject(new Error('credential=TOP_SECRET')) }),
      new AcademyPostgresIdentitySessionStore(client({ data: null, error: { secret: 'TOP_SECRET' } })),
      new AcademyPostgresIdentitySessionStore({
        rpc: vi.fn().mockImplementation((_name, parameters) => Promise.resolve({
          data: {
            status: 'created',
            session: session(parameters.p_session_id as string, { expiresAt: CREATED_AT }),
          },
          error: null,
        })),
      }),
      new AcademyPostgresIdentitySessionStore(client({ data: { status: 'revoked', extra: true }, error: null })),
    ]
    await fixedFailure(() => stores[0]!.create(claims))
    await fixedFailure(() => stores[1]!.create(claims))
    await fixedFailure(() => stores[2]!.create(claims))
    await fixedFailure(() => stores[3]!.create(claims))
    await fixedFailure(() => stores[4]!.revoke('A'.repeat(43)))
  })

  it('keeps storage behind three exact runtime RPCs with no direct/service-role table access', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0027_identity_session_store.sql'),
      'utf8',
    )
    expect(migration).toMatch(/create table if not exists academy\.identity_session/i)
    expect(migration).toMatch(/primary key \(id\)/i)
    expect(migration).toMatch(/subject_key text not null/i)
    expect(migration).not.toMatch(/\n\s*subject text not null/i)
    expect(migration).toMatch(/academy\.identity_lifecycle_issuer_is_canonical\(issuer\)/i)
    expect(migration).toMatch(/academy\.identity_lifecycle_subject_key_is_valid\(subject_key\)/i)
    expect(migration).toMatch(/p_subject_key text/i)
    expect(migration).toMatch(/p_activation_revision bigint/i)
    expect(migration).toMatch(/activation_revision bigint not null/i)
    expect(migration).toMatch(/activation_revision between 1 and 9007199254740991/i)
    expect(migration).not.toMatch(/p_activation_revision integer/i)
    expect(migration.match(/security definer/gi)).toHaveLength(3)
    expect(migration).toMatch(/for update/i)
    expect(migration).toMatch(/clock_timestamp\(\)/i)
    expect(migration).toMatch(/enable row level security/i)
    expect(migration).toMatch(/revoke all on table academy\.identity_session[\s\S]*service_role[\s\S]*academy_runtime/i)
    expect(migration).not.toMatch(/grant (?:select|insert|update|delete)[\s\S]*identity_session/i)
    expect(migration.match(/grant execute on function academy\.(?:create|read|revoke)_identity_session/g))
      .toHaveLength(3)
    expect(migration).not.toMatch(/course|entitlement/i)
  })
})

describe('supabase-js response envelope', () => {
  it('accepts the real PostgrestResponse shape (data, error, count, status, statusText)', async () => {
    const calls: Array<{ functionName: string }> = []
    const stored = new Map<string, unknown>()
    const rpcClient = {
      rpc(functionName: string, parameters: Record<string, unknown>) {
        calls.push({ functionName })
        const now = new Date('2026-09-03T23:20:41.674Z')
        const later = new Date('2026-09-04T23:20:41.674Z')
        if (functionName === 'create_identity_session') {
          // jsonb key order as PostgreSQL emits it (shorter keys first), not TS declaration order
          stored.set(parameters.p_session_id as string, {
            id: parameters.p_session_id,
            claims: {
              issuer: parameters.p_issuer,
              createdAt: now.toISOString(),
              expiresAt: later.toISOString(),
              activation: { status: parameters.p_activation_status, revision: parameters.p_activation_revision },
              subjectKey: parameters.p_subject_key,
              verifiedEmail: parameters.p_verified_email,
            },
          })
        }
        const session = stored.get(parameters.p_session_id as string)
        const data = functionName === 'revoke_identity_session'
          ? { status: 'revoked' }
          : { status: functionName === 'create_identity_session' ? 'created' : 'active', session }
        return Promise.resolve({ data, error: null, count: null, status: 200, statusText: 'OK' })
      },
    }
    const store = new AcademyPostgresIdentitySessionStore(rpcClient)
    const stableId = 'A'.repeat(43)
    const receipt = await store.create(claims, stableId)
    expect(receipt.id).toBe(stableId)
    expect(receipt.claims.subject).toBe(claims.subject)
    await expect(store.get(stableId)).resolves.toMatchObject({ verifiedEmail: claims.verifiedEmail })
    await expect(store.revoke(stableId)).resolves.toBeUndefined()
    expect(calls.map((call) => call.functionName)).toEqual([
      'create_identity_session', 'read_identity_session', 'revoke_identity_session',
    ])
  })
})
