import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  AcademyIdentityProfileActivationStore,
  IdentityProfileActivationStoreFailure,
} from '@/lib/identity/profile-activation-store'

const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function activationInput() {
  return {
    issuer: 'https://accounts.example.test/auth/v1',
    subject: 'academy-learner-1',
    verifiedEmail: 'learner@example.test',
    activation: {
      status: 'active' as const,
      revision: 7,
    },
  }
}

function rpcClient(result: { data: unknown; error: unknown } = { data: ACCOUNT_ID, error: null }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

async function captureFailure(run: () => Promise<unknown>) {
  try {
    await run()
    throw new Error('expected profile activation store failure')
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityProfileActivationStoreFailure)
    expect(error).toMatchObject({
      name: 'IdentityProfileActivationStoreFailure',
      message: 'Identity profile activation commit failed',
    })
    expect(Object.keys(error as object)).toEqual([])
    expect(JSON.stringify(error)).toBe('{}')
    expect(String(error)).not.toMatch(/credential|secret|database|TOP_SECRET/i)
    expect((error as Error).stack).not.toMatch(/credential=TOP_SECRET/)
  }
}

describe('AcademyIdentityProfileActivationStore', () => {
  it('commits only the canonical profile and activation projection through one RPC', async () => {
    const client = rpcClient()
    const store = new AcademyIdentityProfileActivationStore(client)
    const input = activationInput()

    const result = await store.commit(input)

    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('commit_identity_profile_activation', {
      p_issuer: input.issuer,
      p_subject: input.subject,
      p_verified_email: input.verifiedEmail,
      p_status: input.activation.status,
      p_revision: input.activation.revision,
    })
    expect(result).toEqual({
      accountId: ACCOUNT_ID,
      issuer: input.issuer,
      subject: input.subject,
      verifiedEmail: input.verifiedEmail,
      activation: {
        status: 'active',
        revision: 7,
      },
    })
    expect(result).not.toBe(input)
    expect(result.activation).not.toBe(input.activation)
    expect(Reflect.ownKeys(result)).toEqual([
      'accountId',
      'issuer',
      'subject',
      'verifiedEmail',
      'activation',
    ])
  })

  it('captures the RPC method once and preserves its original receiver', async () => {
    const receiver = {
      marker: 'original-rpc-client',
      calls: 0,
      async invoke(this: { marker: string; calls: number }) {
        expect(this.marker).toBe('original-rpc-client')
        this.calls += 1
        return { data: ACCOUNT_ID, error: null }
      },
    }
    let reads = 0
    const client = new Proxy(receiver, {
      get(target, property, proxyReceiver) {
        if (property === 'rpc') {
          reads += 1
          if (reads > 1) throw new Error('credential=TOP_SECRET')
          return target.invoke
        }
        return Reflect.get(target, property, proxyReceiver)
      },
    }) as unknown as { rpc: typeof receiver.invoke }

    const store = new AcademyIdentityProfileActivationStore(client)
    await expect(store.commit(activationInput())).resolves.toMatchObject({ accountId: ACCOUNT_ID })
    await expect(store.commit(activationInput())).resolves.toMatchObject({ accountId: ACCOUNT_ID })

    expect(reads).toBe(1)
    expect(receiver.calls).toBe(2)
  })

  it('snapshots exact data descriptors without ordinary property reads', async () => {
    const client = rpcClient()
    const store = new AcademyIdentityProfileActivationStore(client)
    const plain = activationInput()
    const activation = new Proxy(plain.activation, {
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })
    const input = new Proxy({ ...plain, activation }, {
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })

    await expect(store.commit(input)).resolves.toMatchObject({ accountId: ACCOUNT_ID })
    expect(client.rpc).toHaveBeenCalledOnce()
  })

  it('reads each RPC response field once inside the fixed failure boundary', async () => {
    const reads = new Map<PropertyKey, number>()
    const response = new Proxy({ data: ACCOUNT_ID, error: null }, {
      get(target, property, receiver) {
        const count = (reads.get(property) ?? 0) + 1
        reads.set(property, count)
        if (count > 1) throw new Error('credential=TOP_SECRET')
        return Reflect.get(target, property, receiver)
      },
    })
    const store = new AcademyIdentityProfileActivationStore({
      rpc: vi.fn().mockResolvedValue(response),
    })

    await expect(store.commit(activationInput())).resolves.toMatchObject({ accountId: ACCOUNT_ID })
    expect(reads.get('error')).toBe(1)
    expect(reads.get('data')).toBe(1)
  })

  it('normalizes the verified email before the durable boundary', async () => {
    const client = rpcClient()
    const store = new AcademyIdentityProfileActivationStore(client)

    const result = await store.commit({
      ...activationInput(),
      verifiedEmail: '  Learner@Example.Test  ',
    })

    expect(result.verifiedEmail).toBe('learner@example.test')
    expect(client.rpc).toHaveBeenCalledWith(
      'commit_identity_profile_activation',
      expect.objectContaining({ p_verified_email: 'learner@example.test' }),
    )
  })

  it.each([
    ['null', null],
    ['array', []],
    ['surplus field', { ...activationInput(), courseEntitlement: 'all-courses' }],
    ['symbol field', Object.assign(activationInput(), { [Symbol('raw')]: 'secret' })],
    ['empty issuer', { ...activationInput(), issuer: '' }],
    ['blank issuer', { ...activationInput(), issuer: '   ' }],
    ['empty subject', { ...activationInput(), subject: '' }],
    ['blank subject', { ...activationInput(), subject: '\t' }],
    ['invalid email', { ...activationInput(), verifiedEmail: 'not-an-email' }],
    ['unknown status', { ...activationInput(), activation: { status: 'enabled', revision: 7 } }],
    ['zero revision', { ...activationInput(), activation: { status: 'active', revision: 0 } }],
    ['unsafe revision', { ...activationInput(), activation: { status: 'active', revision: Number.MAX_VALUE } }],
  ])('rejects %s before the RPC boundary', async (_name, value) => {
    const client = rpcClient()
    const store = new AcademyIdentityProfileActivationStore(client)

    await captureFailure(() => store.commit(value))

    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rejects accessors, non-enumerable fields, and non-plain nested activation before mutation', async () => {
    const cases: unknown[] = []
    const accessor = activationInput()
    Object.defineProperty(accessor, 'subject', {
      enumerable: true,
      get() {
        throw new Error('credential=TOP_SECRET')
      },
    })
    cases.push(accessor)

    const nonEnumerable = activationInput()
    Object.defineProperty(nonEnumerable, 'subject', {
      value: nonEnumerable.subject,
      enumerable: false,
    })
    cases.push(nonEnumerable)

    cases.push({ ...activationInput(), activation: Object.assign(Object.create(null), activationInput().activation) })

    for (const value of cases) {
      const client = rpcClient()
      const store = new AcademyIdentityProfileActivationStore(client)
      await captureFailure(() => store.commit(value))
      expect(client.rpc).not.toHaveBeenCalled()
    }
  })

  it('returns one fixed failure for RPC throw, rejection, error, or malformed account ID', async () => {
    const clients = [
      { rpc: vi.fn(() => { throw new Error('credential=TOP_SECRET') }) },
      { rpc: vi.fn(() => Promise.reject(new Error('credential=TOP_SECRET'))) },
      rpcClient({ data: null, error: { message: 'database secret=TOP_SECRET' } }),
      rpcClient({ data: ACCOUNT_ID, error: false }),
      rpcClient({ data: 'NOT-A-UUID credential=TOP_SECRET', error: null }),
    ]

    for (const client of clients) {
      const store = new AcademyIdentityProfileActivationStore(client)
      await captureFailure(() => store.commit(activationInput()))
    }
  })

  it('rejects an invalid RPC capability with the same fixed construction failure', () => {
    expect(() => new AcademyIdentityProfileActivationStore({ rpc: 'not-a-function' } as never))
      .toThrow(IdentityProfileActivationStoreFailure)
    try {
      new AcademyIdentityProfileActivationStore(new Proxy({} as never, {
        get() {
          throw new Error('credential=TOP_SECRET')
        },
      }))
    } catch (error) {
      expect(error).toMatchObject({
        name: 'IdentityProfileActivationStoreFailure',
        message: 'Identity profile activation commit failed',
      })
      expect(String(error)).not.toContain('TOP_SECRET')
    }
  })

  it('keeps the SQL boundary atomic, least-capability, and unavailable to browser roles', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/0024_identity_profile_activation.sql'),
      'utf8',
    )
    const body = migration.match(/create or replace function academy\.commit_identity_profile_activation[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1]

    expect(body).toBeTruthy()
    expect(body).toMatch(/insert into academy\.users/i)
    expect(body).toMatch(/on conflict \(issuer, subject\)/i)
    expect(body).toMatch(/academy\.sync_service_activation/i)
    expect(body).not.toMatch(/course_entitlement|staff_role|set_staff_role|grant_course/i)
    expect(migration).toMatch(/security invoker/i)
    expect(migration).toMatch(/revoke all on function academy\.commit_identity_profile_activation[\s\S]*from public, anon, authenticated, service_role/i)
    expect(migration).toMatch(/grant execute on function academy\.commit_identity_profile_activation[\s\S]*to academy_runtime/i)
  })
})
