import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { IdentityAdapter } from '@/lib/identity/adapter'
import { FakeIdentityAdapter } from '@/lib/identity/fake-adapter'
import {
  beginIdentityAuthorization,
  completeIdentityCallback,
  IdentityTransactionError,
  IdentityTransactionStoreError,
  InMemoryIdentityTransactionStore,
  parseIdentityCallback,
  type IdentityTransactionStore,
  type LocalIdentityAuthorizationRegistration,
  type LocalIdentityClient,
} from '@/lib/identity/transaction'

const LOCAL_ISSUER = 'https://identity.local.invalid'
const client: LocalIdentityClient = {
  clientId: 'academy-web-local',
  redirectUri: 'http://localhost:3000/auth/callback',
  serviceId: 'academy',
  audience: 'academy-api-local',
  expectedIssuer: LOCAL_ISSUER,
  clientAssertionAudience: 'https://accounts.local.invalid/v1/code/exchange',
}
const registration = {
  client,
  redirectUris: [client.redirectUri],
} as const satisfies LocalIdentityAuthorizationRegistration
const LOCAL_FAKE_CLIENT_ASSERTION = 'local-fake-header.local-fake-payload.local-fake-signature'
const localFakeClientAssertionProvider = { createClientAssertion: async () => LOCAL_FAKE_CLIENT_ASSERTION }

function verifier(): string {
  return randomBytes(48).toString('base64url')
}

describe('local identity transaction boundary', () => {
  it('waits for the durable transaction create before exposing a browser handoff', async () => {
    let releaseCreate: (() => void) | undefined
    const create = vi.fn((input: Parameters<IdentityTransactionStore['create']>[0]) => new Promise((resolve) => {
      releaseCreate = () => resolve({ ...input, expiresAt: Date.now() + 60_000 })
    }))
    const store = {
      create,
      consume: vi.fn(),
    } as unknown as IdentityTransactionStore

    const startedPromise = Promise.resolve(beginIdentityAuthorization(store, registration, '/dashboard'))
    let settled = false
    void startedPromise.then(() => { settled = true })
    await Promise.resolve()

    expect(create).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    expect(releaseCreate).toBeTypeOf('function')
    releaseCreate?.()
    await expect(startedPromise).resolves.toMatchObject({
      request: {
        clientId: client.clientId,
        redirectUri: client.redirectUri,
      },
    })
  })

  it('keeps state, PKCE verifier, and nonce on the server until one callback exchange', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-1',
      verifiedEmail: 'learner@example.test',
    })

    const completed = await completeIdentityCallback({
      adapter,
      store,
      client,
      callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
      browserBinding: started.browserBinding,
      clientAssertionProvider: localFakeClientAssertionProvider,
    })

    expect(completed.returnPath).toBe('/dashboard')
    expect(completed.exchange).toMatchObject({
      issuer: LOCAL_ISSUER,
      subject: 'learner-1',
      verifiedEmail: 'learner@example.test',
      audience: 'academy-api-local',
      serviceId: 'academy',
      nonce: started.request.nonce,
    })

    await expect(
      completeIdentityCallback({
        adapter,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>)
  })

  it('binds the callback to the initiating browser without consuming state on mismatch', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-browser-binding',
      verifiedEmail: 'browser-binding@example.test',
    })
    const createClientAssertion = vi.fn(async () => LOCAL_FAKE_CLIENT_ASSERTION)
    const exchangeCode = vi.fn((input: Parameters<IdentityAdapter['exchangeCode']>[0]) => adapter.exchangeCode(input))
    const callback = parseIdentityCallback(
      new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`),
    )
    const boundAdapter: IdentityAdapter = {
      name: adapter.name,
      productionSafe: adapter.productionSafe,
      startAuthorization: (request) => adapter.startAuthorization(request),
      exchangeCode,
    }

    for (const browserBinding of ['too-short', randomBytes(32).toString('base64url')]) {
      await expect(completeIdentityCallback({
        adapter: boundAdapter,
        store,
        client,
        callback,
        browserBinding,
        clientAssertionProvider: { createClientAssertion },
      })).rejects.toMatchObject({ reason: 'browser_mismatch' } satisfies Partial<IdentityTransactionError>)
    }

    expect(createClientAssertion).not.toHaveBeenCalled()
    expect(exchangeCode).not.toHaveBeenCalled()
    await expect(completeIdentityCallback({
      adapter: boundAdapter,
      store,
      client,
      callback,
      browserBinding: started.browserBinding,
      clientAssertionProvider: { createClientAssertion },
    })).resolves.toMatchObject({ returnPath: '/dashboard' })
    expect(createClientAssertion).toHaveBeenCalledOnce()
    expect(exchangeCode).toHaveBeenCalledOnce()
  })

  it('keeps the browser binding out of the authorization request', async () => {
    const started = await beginIdentityAuthorization(new InMemoryIdentityTransactionStore(), registration, '/dashboard')

    expect(started.browserBinding).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(started.request).not.toHaveProperty('browserBinding')
    expect(JSON.stringify(started.request)).not.toContain(started.browserBinding)
  })

  it('rejects surplus, accessor, and hostile Proxy client metadata before creating a transaction', async () => {
    const create = vi.fn<IdentityTransactionStore['create']>((input) => ({ ...input, expiresAt: Date.now() + 60_000 }))
    const store: IdentityTransactionStore = {
      create,
      consume: () => { throw new Error('consume must not run') },
    }
    const secretMarker = 'credential=TOP_SECRET_BROWSER_BINDING'
    const getterCalls = { count: 0 }
    const accessorClient = { ...client }
    Object.defineProperty(accessorClient, 'clientId', {
      enumerable: true,
      get() {
        getterCalls.count += 1
        return client.clientId
      },
    })
    const hostileClient = new Proxy({ ...client }, {
      ownKeys() {
        throw new Error(secretMarker)
      },
    })

    for (const candidate of [
      Object.assign({ ...client }, { clientSecret: secretMarker }),
      Object.assign({ ...client }, { toJSON: () => ({ clientId: client.clientId }) }),
      accessorClient,
      hostileClient,
    ]) {
      let captured: unknown
      try {
        await beginIdentityAuthorization(store, {
          client: candidate,
          redirectUris: [client.redirectUri],
        } as unknown as LocalIdentityAuthorizationRegistration, '/dashboard')
      } catch (error) {
        captured = error
      }
      expect(captured).toBeInstanceOf(IdentityTransactionStoreError)
      expect(String(captured)).not.toContain(secretMarker)
    }

    expect(getterCalls.count).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('requires the selected callback to exactly match one canonical registered redirect before mutation', async () => {
    const create = vi.fn<IdentityTransactionStore['create']>((input) => ({ ...input, expiresAt: Date.now() + 60_000 }))
    const store: IdentityTransactionStore = {
      create,
      consume: () => { throw new Error('consume must not run') },
    }
    const productionClient: LocalIdentityClient = {
      ...client,
      redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
    }
    const newVerifier = vi.fn(verifier)
    const start = (candidate: unknown) => beginIdentityAuthorization(
      store,
      candidate as Parameters<typeof beginIdentityAuthorization>[1],
      '/dashboard',
      newVerifier,
    )

    await expect(start({
      client: productionClient,
      redirectUris: [productionClient.redirectUri],
    })).resolves.toBeDefined()
    expect(create).toHaveBeenCalledOnce()
    expect(newVerifier).toHaveBeenCalledOnce()

    for (const candidate of [
      {
        client: { ...productionClient, redirectUri: `${productionClient.redirectUri}/` },
        redirectUris: [productionClient.redirectUri],
      },
      {
        client: { ...productionClient, redirectUri: `${productionClient.redirectUri}?` },
        redirectUris: [`${productionClient.redirectUri}?`],
      },
      {
        client: { ...productionClient, redirectUri: `${productionClient.redirectUri}#` },
        redirectUris: [`${productionClient.redirectUri}#`],
      },
      {
        client: { ...productionClient, redirectUri: 'https://academy.cyberskills.co.th.evil.example/auth/callback' },
        redirectUris: [productionClient.redirectUri],
      },
      {
        client: productionClient,
        redirectUris: [productionClient.redirectUri, productionClient.redirectUri],
      },
    ]) {
      create.mockClear()
      newVerifier.mockClear()
      await expect(start(candidate)).rejects.toBeInstanceOf(IdentityTransactionStoreError)
      expect(create).not.toHaveBeenCalled()
      expect(newVerifier).not.toHaveBeenCalled()
    }
  })

  it('bounds and snapshots registered redirects before attacker-controlled enumeration or getters', async () => {
    const create = vi.fn<IdentityTransactionStore['create']>((input) => ({ ...input, expiresAt: Date.now() + 60_000 }))
    const store: IdentityTransactionStore = {
      create,
      consume: () => { throw new Error('consume must not run') },
    }
    const productionClient: LocalIdentityClient = {
      ...client,
      redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
    }
    const newVerifier = vi.fn(verifier)
    let ownKeysCalls = 0
    let getterCalls = 0
    const overbound = new Proxy(new Array<string>(17), {
      ownKeys(target) {
        ownKeysCalls += 1
        return Reflect.ownKeys(target)
      },
    })
    const accessor = [productionClient.redirectUri]
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get() {
        getterCalls += 1
        return productionClient.redirectUri
      },
    })
    const symbolEntry = [productionClient.redirectUri] as Array<string> & { [key: symbol]: string }
    symbolEntry[Symbol('foreign')] = 'credential=TOP_SECRET_REDIRECT'
    const sparse = new Array<string>(1)
    const marker = 'credential=TOP_SECRET_REDIRECT_PROXY'
    const hostile = new Proxy([productionClient.redirectUri], {
      ownKeys() {
        throw new Error(marker)
      },
    })

    for (const redirectUris of [overbound, accessor, symbolEntry, sparse, hostile]) {
      let captured: unknown
      try {
        await beginIdentityAuthorization(store, { client: productionClient, redirectUris }, '/dashboard', newVerifier)
      } catch (error) {
        captured = error
      }
      expect(captured).toBeInstanceOf(IdentityTransactionStoreError)
      expect(String(captured)).not.toContain(marker)
      expect(create).not.toHaveBeenCalled()
      expect(newVerifier).not.toHaveBeenCalled()
    }

    expect(ownKeysCalls).toBe(0)
    expect(getterCalls).toBe(0)
  })

  it('rejects every callback parameter except exactly one code and one opaque state', () => {
    expect(() => parseIdentityCallback(new URL('https://academy.local/auth/callback?code=a&state=b&email=person@example.test'))).toThrow(
      /callback/i,
    )
    expect(() => parseIdentityCallback(new URL('https://academy.local/auth/callback?code=a&code=b&state=c'))).toThrow(/callback/i)
    expect(() => parseIdentityCallback(new URL('https://academy.local/auth/callback?code=a&state=b&next=%2Fdashboard'))).toThrow(
      /callback/i,
    )
  })

  it('rejects an exchange result whose audience, service, or nonce differs from the local transaction', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/courses')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-2',
      verifiedEmail: 'learner2@example.test',
    })
    const wrongAudience: IdentityAdapter = {
      name: adapter.name,
      productionSafe: adapter.productionSafe,
      startAuthorization: (request) => adapter.startAuthorization(request),
      exchangeCode: async (input) => ({ ...(await adapter.exchangeCode(input)), audience: 'another-service' }),
    }

    await expect(
      completeIdentityCallback({
        adapter: wrongAudience,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'audience_mismatch' } satisfies Partial<IdentityTransactionError>)
  })

  it('returns a fresh verified projection instead of the adapter result object', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/courses')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-projection',
      verifiedEmail: 'projection@example.test',
    })
    let rawResult: Awaited<ReturnType<IdentityAdapter['exchangeCode']>> | undefined
    const capturingAdapter: IdentityAdapter = {
      name: adapter.name,
      productionSafe: adapter.productionSafe,
      startAuthorization: (request) => adapter.startAuthorization(request),
      exchangeCode: async (input) => {
        rawResult = await adapter.exchangeCode(input)
        return rawResult
      },
    }

    const completed = await completeIdentityCallback({
      adapter: capturingAdapter,
      store,
      client,
      callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
      browserBinding: started.browserBinding,
      clientAssertionProvider: localFakeClientAssertionProvider,
    })

    expect(completed.exchange).not.toBe(rawResult)
    expect(completed.exchange.activation).not.toBe(rawResult?.activation)
    if (!rawResult) throw new Error('expected the adapter result to be captured')
    rawResult.subject = 'mutated-after-callback'
    rawResult.activation.revision = 99
    expect(completed.exchange.subject).toBe('learner-projection')
    expect(completed.exchange.activation.revision).toBe(1)
  })

  it('rejects an exchange result from a different issuer', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/courses')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-wrong-issuer',
      verifiedEmail: 'wrong-issuer@example.test',
    })
    const wrongIssuer: IdentityAdapter = {
      name: adapter.name,
      productionSafe: adapter.productionSafe,
      startAuthorization: (request) => adapter.startAuthorization(request),
      exchangeCode: async (input) => ({
        ...(await adapter.exchangeCode(input)),
        issuer: 'https://foreign-issuer.example/auth/v1',
      }),
    }

    await expect(
      completeIdentityCallback({
        adapter: wrongIssuer,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })

  it('rejects surplus adapter fields before returning the callback result', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/courses')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-surplus',
      verifiedEmail: 'surplus@example.test',
    })
    const surplusAdapter: IdentityAdapter = {
      name: adapter.name,
      productionSafe: adapter.productionSafe,
      startAuthorization: (request) => adapter.startAuthorization(request),
      exchangeCode: async (input) => Object.assign(await adapter.exchangeCode(input), {
        entitlement: 'admin',
      }),
    }

    await expect(
      completeIdentityCallback({
        adapter: surplusAdapter,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })

  it('expires a transaction before any exchange is attempted', async () => {
    let now = 100
    const store = new InMemoryIdentityTransactionStore({ now: () => now, ttlMs: 1_000 })
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    now += 1_001

    expect(() => store.consume(started.state, started.browserBinding)).toThrow(/หมดอายุ/)
  })

  it('treats the exact expiry millisecond as expired', async () => {
    let now = 100
    const store = new InMemoryIdentityTransactionStore({ now: () => now, ttlMs: 1_000 })
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    now += 1_000

    expect(() => store.consume(started.state, started.browserBinding)).toThrow(/หมดอายุ/)
  })

  it('uses S256 PKCE and never creates a verifier from browser input', async () => {
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard', () => verifier())

    expect(started.request.codeChallengeMethod).toBe('S256')
    expect(started.request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(started.request.codeChallenge).not.toBe(started.codeVerifier)
    expect(started.request.codeChallenge).toBe(
      createHash('sha256').update(started.codeVerifier).digest('base64url'),
    )
  })

  it('does not broaden the Identity Control local callback rule to a numeric loopback host', async () => {
    const store = new InMemoryIdentityTransactionStore()
    await expect(
      beginIdentityAuthorization(store, {
        client: { ...client, redirectUri: 'http://127.0.0.1:3000/auth/callback' },
        redirectUris: [client.redirectUri],
      }, '/dashboard'),
    ).rejects.toThrow(/loopback HTTP/)
  })

  it('does not retain an arbitrary return URL in the server transaction', async () => {
    const store = new InMemoryIdentityTransactionStore()
    await expect(beginIdentityAuthorization(store, registration, 'https://evil.example')).rejects.toThrow(/return path/)
  })

  it('rejects a zero activation revision because the canonical exchange contract starts at 1', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    const code = adapter.issueCodeForTest(
      started.request,
      { subject: 'learner-revision', verifiedEmail: 'revision@example.test' },
      { status: 'active', revision: 0 },
    )

    await expect(
      completeIdentityCallback({
        adapter,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })

  it('does not exchange a code without server-held client authentication material', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-authn',
      verifiedEmail: 'authn@example.test',
    })

    await expect(
      completeIdentityCallback({
        adapter,
        store,
        client,
        callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
        browserBinding: started.browserBinding,
        clientAssertionProvider: { createClientAssertion: async () => '' },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })

  it('gives the signer the registered code-exchange audience', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = await beginIdentityAuthorization(store, registration, '/dashboard')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-audience',
      verifiedEmail: 'audience@example.test',
    })
    const audiences: string[] = []

    await completeIdentityCallback({
      adapter,
      store,
      client,
      callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
      browserBinding: started.browserBinding,
      clientAssertionProvider: {
        createClientAssertion: async ({ audience }: { audience: string }) => {
          audiences.push(audience)
          return LOCAL_FAKE_CLIENT_ASSERTION
        },
      },
    })

    expect(audiences).toEqual([client.clientAssertionAudience])
  })
})
