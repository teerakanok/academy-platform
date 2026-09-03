import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({ academyDb: vi.fn() }))

vi.mock('@/lib/db/server', () => ({ academyDb: database.academyDb }))

const { GET: startNavigationRoute, POST: startRoute } = await import('@/app/(site)/api/auth/identity/start/route')
const { GET: callbackRoute } = await import('@/app/(site)/auth/callback/route')

const RESULT_KEY_SET_DOCUMENT = JSON.stringify({
  issuer: 'https://accounts.cyberskills.co.th/v1/code/results',
  revision: 1,
  keys: [{
    keyId: 'identity-result-route-test',
    algorithm: 'ES256',
    publicJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'vsH-Muazqvy-BMIqlGTEZdM3RvQnpPXgHcuYgb3_N-4',
      y: 'BM50ND93TPNJH8-v3shQpGMEh9KB4t_5kT4nel_XXwk',
    },
    state: 'active',
  }],
  retiredKeyFingerprints: [],
  retiredKeyIds: [],
})

let transaction: Record<string, unknown> | undefined
let rpcCalls: string[] = []

beforeEach(async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  const canonicalPrivateJwk = JSON.stringify({
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
    d: privateJwk.d,
  })
  vi.stubEnv('IDENTITY_ADAPTER', 'identity-control')
  vi.stubEnv('IDENTITY_RUNTIME_ENABLED', 'true')
  vi.stubEnv('IDENTITY_RUNTIME_WIRED', 'true')
  vi.stubEnv('IDENTITY_RELEASE_APPROVAL', 'true')
  vi.stubEnv('IDENTITY_CODE_EXCHANGE_TIMEOUT_MS', '1000')
  vi.stubEnv('IDENTITY_CLIENT_ASSERTION_KEY_ID', 'academy-route-test')
  vi.stubEnv('IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK', canonicalPrivateJwk)
  vi.stubEnv('IDENTITY_RESULT_KEY_SET_DOCUMENT', RESULT_KEY_SET_DOCUMENT)
  transaction = undefined
  rpcCalls = []
  database.academyDb.mockReturnValue({
    rpc: vi.fn(async (name: string, parameters: Record<string, string>) => {
      rpcCalls.push(name)
      if (name === 'create_identity_authorization_transaction') {
        transaction = {
          state: parameters.p_state,
          codeVerifier: parameters.p_code_verifier,
          nonce: parameters.p_nonce,
          browserBindingDigest: parameters.p_browser_binding_digest,
          client: {
            clientId: parameters.p_client_id,
            redirectUri: parameters.p_redirect_uri,
            serviceId: parameters.p_service_id,
            audience: parameters.p_audience,
            expectedIssuer: parameters.p_expected_issuer,
            clientAssertionAudience: parameters.p_client_assertion_audience,
          },
          returnPath: parameters.p_return_path,
          expiresAt: '2030-01-02T03:04:05.000Z',
        }
        return { data: { status: 'created', expiresAt: '2030-01-02T03:04:05.000Z' }, error: null }
      }
      if (name === 'claim_identity_authorization_transaction') {
        return {
          data: {
            status: 'claimed',
            sessionId: 's'.repeat(43),
            exchangeResult: null,
            transaction,
          },
          error: null,
        }
      }
      if (name === 'release_identity_authorization_transaction_claim') {
        return { data: { status: 'released' }, error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    }),
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
    status: 503,
    headers: { 'cache-control': 'no-store' },
  })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('production Identity routes use the real registry composition', () => {
  it('starts through the registry and routes a callback into the same server-only composition', async () => {
    const started = await startRoute(new Request('https://academy.cyberskills.co.th/api/auth/identity/start', {
      method: 'POST',
      headers: {
        origin: 'https://academy.cyberskills.co.th',
        host: 'academy.cyberskills.co.th',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    }))

    expect(started.status).toBe(303)
    const authorizationUrl = new URL(started.headers.get('location') ?? '')
    expect(authorizationUrl.origin).toBe('https://accounts.cyberskills.co.th')
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toMatch(/^[A-Za-z0-9_-]{16,160}$/)
    const cookie = started.headers.getSetCookie()[0]!
    const cookiePair = cookie.split(';', 1)[0]!

    const callback = await callbackRoute(new Request(
      `https://academy.cyberskills.co.th/auth/callback?code=${'c'.repeat(24)}&state=${state}`,
      { headers: { cookie: cookiePair } },
    ))

    expect(callback.status).toBe(503)
    await expect(callback.json()).resolves.toEqual({
      ok: false,
      error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้',
    })
    expect(callback.headers.getSetCookie()).toEqual([])
    expect(rpcCalls).toEqual([
      'create_identity_authorization_transaction',
      'claim_identity_authorization_transaction',
      'release_identity_authorization_transaction_claim',
    ])
    expect(database.academyDb).toHaveBeenCalledTimes(2)
  })

  it('starts an admitted navigation with the production transaction and cookie contract', async () => {
    const navigation = await startNavigationRoute(new Request(
      'https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard',
      {
        headers: {
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'sec-fetch-user': '?1',
        },
      },
    ))

    expect(navigation.status).toBe(303)
    expect(navigation.headers.get('cache-control')).toBe('no-store')
    const authorizationUrl = new URL(navigation.headers.get('location') ?? '')
    expect(authorizationUrl.origin).toBe('https://accounts.cyberskills.co.th')
    expect(authorizationUrl.pathname).toBe('/sign-in')
    expect([...authorizationUrl.searchParams.keys()]).toEqual([
      'client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method', 'service_id',
    ])
    expect(transaction).toMatchObject({
      state: expect.stringMatching(/^[A-Za-z0-9_-]{16,160}$/),
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{64}$/),
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{16,160}$/),
      browserBindingDigest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      returnPath: '/dashboard',
    })
    const cookie = navigation.headers.getSetCookie()
    expect(cookie).toHaveLength(1)
    expect(cookie[0]!.split('; ').slice(1)).toEqual([
      'Path=/auth/callback', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=300',
    ])
    expect(database.academyDb).toHaveBeenCalledTimes(1)
  })
})
