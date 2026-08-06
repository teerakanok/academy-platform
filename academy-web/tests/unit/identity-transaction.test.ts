import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { IdentityAdapter } from '@/lib/identity/adapter'
import { FakeIdentityAdapter } from '@/lib/identity/fake-adapter'
import {
  beginIdentityAuthorization,
  completeIdentityCallback,
  IdentityTransactionError,
  InMemoryIdentityTransactionStore,
  parseIdentityCallback,
  type LocalIdentityClient,
} from '@/lib/identity/transaction'

const LOCAL_ISSUER = 'https://identity.local.invalid'
const client: LocalIdentityClient = {
  clientId: 'academy-web-local',
  redirectUri: 'http://localhost:3000/auth/callback',
  serviceId: 'academy',
  audience: 'academy-api-local',
}
const LOCAL_FAKE_CLIENT_ASSERTION = 'local-fake-header.local-fake-payload.local-fake-signature'
const localFakeClientAssertionProvider = { createClientAssertion: async () => LOCAL_FAKE_CLIENT_ASSERTION }

function verifier(): string {
  return randomBytes(48).toString('base64url')
}

describe('local identity transaction boundary', () => {
  it('keeps state, PKCE verifier, and nonce on the server until one callback exchange', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = beginIdentityAuthorization(store, client, '/dashboard')
    const code = adapter.issueCodeForTest(started.request, {
      subject: 'learner-1',
      verifiedEmail: 'learner@example.test',
    })

    const completed = await completeIdentityCallback({
      adapter,
      store,
      client,
      callback: parseIdentityCallback(new URL(`https://academy.local/auth/callback?code=${code}&state=${started.state}`)),
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
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'unknown_state' } satisfies Partial<IdentityTransactionError>)
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
    const started = beginIdentityAuthorization(store, client, '/courses')
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
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'audience_mismatch' } satisfies Partial<IdentityTransactionError>)
  })

  it('expires a transaction before any exchange is attempted', () => {
    let now = 100
    const store = new InMemoryIdentityTransactionStore({ now: () => now, ttlMs: 1_000 })
    const started = beginIdentityAuthorization(store, client, '/dashboard')
    now += 1_001

    expect(() => store.consume(started.state)).toThrow(/หมดอายุ/)
  })

  it('treats the exact expiry millisecond as expired', () => {
    let now = 100
    const store = new InMemoryIdentityTransactionStore({ now: () => now, ttlMs: 1_000 })
    const started = beginIdentityAuthorization(store, client, '/dashboard')
    now += 1_000

    expect(() => store.consume(started.state)).toThrow(/หมดอายุ/)
  })

  it('uses S256 PKCE and never creates a verifier from browser input', () => {
    const store = new InMemoryIdentityTransactionStore()
    const started = beginIdentityAuthorization(store, client, '/dashboard', () => verifier())

    expect(started.request.codeChallengeMethod).toBe('S256')
    expect(started.request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(started.request.codeChallenge).not.toBe(started.codeVerifier)
    expect(started.request.codeChallenge).toBe(
      createHash('sha256').update(started.codeVerifier).digest('base64url'),
    )
  })

  it('does not broaden the Identity Control local callback rule to a numeric loopback host', () => {
    const store = new InMemoryIdentityTransactionStore()
    expect(() =>
      beginIdentityAuthorization(store, { ...client, redirectUri: 'http://127.0.0.1:3000/auth/callback' }, '/dashboard'),
    ).toThrow(/loopback HTTP/)
  })

  it('does not retain an arbitrary return URL in the server transaction', () => {
    const store = new InMemoryIdentityTransactionStore()
    expect(() => beginIdentityAuthorization(store, client, 'https://evil.example')).toThrow(/return path/)
  })

  it('rejects a zero activation revision because the canonical exchange contract starts at 1', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = beginIdentityAuthorization(store, client, '/dashboard')
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
        clientAssertionProvider: localFakeClientAssertionProvider,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })

  it('does not exchange a code without server-held client authentication material', async () => {
    const adapter = new FakeIdentityAdapter(LOCAL_ISSUER, client.audience)
    const store = new InMemoryIdentityTransactionStore()
    const started = beginIdentityAuthorization(store, client, '/dashboard')
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
        clientAssertionProvider: { createClientAssertion: async () => '' },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_result' } satisfies Partial<IdentityTransactionError>)
  })
})
