import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
  AcademyIdentityRuntimeBrowserFlowUnavailableError,
  createAcademyIdentityRuntimeBrowserFlow,
} from '@/lib/identity/runtime-browser-flow'
import { InMemoryIdentityTransactionStore } from '@/lib/identity/transaction'

const CLIENT = {
  clientId: 'academy-web',
  redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
  serviceId: 'academy',
  audience: 'https://academy.cyberskills.co.th',
  expectedIssuer: 'https://accounts.cyberskills.co.th/auth/v1',
  clientAssertionAudience: 'https://accounts.cyberskills.co.th/v1/code/exchange',
}
const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000'
const SESSION_ID = 's'.repeat(43)

describe('Academy Identity runtime browser flow', () => {
  it('publishes a conformance receipt with an empty untracked manifest', () => {
    const report = JSON.parse(readFileSync(new URL(
      '../../../reports/conformance/identity-control/academy-identity-control-conformance.json',
      import.meta.url,
    ), 'utf8')) as {
      localWorkingTreeReceipt?: {
        untrackedEntryCount?: unknown
        untrackedStateSha256?: unknown
        untrackedFileSha256?: unknown
      }
    }

    expect(report.localWorkingTreeReceipt?.untrackedEntryCount).toBe(0)
    expect(report.localWorkingTreeReceipt?.untrackedStateSha256).toBe(
      '64d07385b423b51c63e41b4e86bebe20ac3264d361739346c7d4dc5503186928',
    )
    expect(report.localWorkingTreeReceipt?.untrackedFileSha256).toEqual([])
  })

  it('rejects an unregistered redirect before writing a transaction or calling authorization', async () => {
    const fixture = createFixture({
      registration: {
        client: CLIENT,
        redirectUris: ['https://academy.cyberskills.co.th/auth/other'],
      },
    })

    const result = await fixture.flow.start(startRequest())

    expect(result).toMatchObject({ kind: 'error', status: 503 })
    expect(fixture.calls).toEqual([])
  })

  it.each([
    ['foreign Origin', { origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' }],
    ['cross-site Fetch Metadata', { 'sec-fetch-site': 'cross-site' }],
  ])('rejects %s before parsing the form or writing state', async (_label, headers) => {
    const fixture = createFixture()
    const request = startRequest(headers)
    const formData = vi.fn(() => {
      throw new Error('body parser must not run')
    })
    Object.defineProperty(request, 'formData', { value: formData })

    const result = await fixture.flow.start(request)

    expect(result).toMatchObject({ kind: 'error', status: 403 })
    expect(formData).not.toHaveBeenCalled()
    expect(fixture.calls).toEqual([])
  })

  it('admits only a user-initiated same-origin document navigation GET with one next query member', async () => {
    const validHeaders = {
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-user': '?1',
    }
    const rejectedRequests = [
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard'),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start', { method: 'POST', headers: validHeaders }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard&extra=x', { headers: validHeaders }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fone&next=%2Ftwo', { headers: validHeaders }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?return=%2Fdashboard', { headers: validHeaders }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard', {
        headers: { ...validHeaders, 'sec-fetch-site': 'cross-site' },
      }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard', {
        headers: { ...validHeaders, 'sec-fetch-user': '' },
      }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard', {
        headers: { ...validHeaders, 'sec-purpose': 'prefetch' },
      }),
      new Request('https://academy.cyberskills.co.th/api/auth/identity/start?next=%2Fdashboard', {
        headers: { ...validHeaders, purpose: 'prefetch' },
      }),
    ]

    for (const request of rejectedRequests) {
      const fixture = createFixture()
      const result = await fixture.flow.startNavigation(request)
      expect([400, 403]).toContain(result.status)
      expect(result.kind).toBe('error')
      expect(fixture.calls).toEqual([])
    }
  })

  it('uses the same durable authorization and cookie semantics as POST', async () => {
    const fixture = createFixture()
    const post = await fixture.flow.start(startRequest())
    const navigation = await fixture.flow.startNavigation(navigationRequest())

    expect(post.kind).toBe('redirect')
    expect(navigation.kind).toBe('redirect')
    if (post.kind !== 'redirect' || navigation.kind !== 'redirect') throw new Error('expected redirects')

    const postUrl = new URL(post.location)
    const navigationUrl = new URL(navigation.location)
    expect(navigationUrl.origin).toBe(postUrl.origin)
    expect(navigationUrl.pathname).toBe(postUrl.pathname)
    expect([...navigationUrl.searchParams.keys()]).toEqual([...postUrl.searchParams.keys()])
    for (const key of ['state', 'nonce', 'code_challenge']) {
      expect(navigationUrl.searchParams.get(key)).toMatch(/^[A-Za-z0-9_-]{16,160}$/)
    }

    const navigationCookie = navigation.cookies[0]!
    const navigationCookieParts = navigationCookie.split('; ')
    expect(navigationCookieParts.slice(1)).toEqual(post.cookies[0]!.split('; ').slice(1))
    expect(navigationCookieParts[0]!.split('=')[1]).toMatch(/^[A-Za-z0-9_-]{16,160}$/)
    expect(fixture.calls).toEqual(['create', 'authorize', 'create', 'authorize'])
  })

  it('applies the existing POST safe-next policy to navigation input', async () => {
    const fixture = createFixture()
    const result = await fixture.flow.startNavigation(
      navigationRequest('next=https%3A%2F%2Fattacker.example%2F'),
    )

    expect(result).toMatchObject({ kind: 'redirect', status: 303 })
    expect(new URL(result.kind === 'redirect' ? result.location : '').searchParams.get('redirect_uri'))
      .toBe(CLIENT.redirectUri)
    expect(fixture.calls).toEqual(['create', 'authorize'])
  })

  it('rejects a swapped browser binding without exchange or session and preserves the real browser transaction', async () => {
    const fixture = createFixture()
    const started = await start(fixture)
    const wrong = await fixture.flow.complete(callbackRequest(started, 'wrong_binding_1234567890'))

    expect(wrong).toMatchObject({ kind: 'error', status: 503 })
    expect(fixture.calls).toEqual(['create', 'authorize', 'consume'])

    const completed = await fixture.flow.complete(callbackRequest(started, started.binding))
    expect(completed).toMatchObject({ kind: 'redirect', location: '/dashboard' })
    expect(fixture.calls).toEqual([
      'create', 'authorize', 'consume', 'consume', 'assertion', 'exchange', 'verify', 'activation', 'session',
    ])
  })

  it('snapshots callback URL and cookie header once and replays no exchange or session', async () => {
    const fixture = createFixture()
    const started = await start(fixture)
    let urlReads = 0
    let cookieReads = 0
    const request = callbackRequest(started, started.binding)
    const stableUrl = request.url
    Object.defineProperty(request, 'url', {
      get() {
        urlReads += 1
        return stableUrl
      },
    })
    Object.defineProperty(request, 'headers', {
      value: {
        get(name: string) {
          if (name.toLowerCase() !== 'cookie') return null
          cookieReads += 1
          return `${started.cookieName}=${started.binding}`
        },
      },
    })

    const completed = await fixture.flow.complete(request)
    expect(completed).toMatchObject({ kind: 'redirect', location: '/dashboard' })
    expect(urlReads).toBe(1)
    expect(cookieReads).toBe(1)

    const beforeReplay = fixture.calls.slice()
    const replay = await fixture.flow.complete(callbackRequest(started, started.binding))
    expect(replay).toMatchObject({ kind: 'error', status: 503 })
    expect(fixture.calls).toEqual([...beforeReplay, 'consume'])
  })

  it.each(['activation', 'session'] as const)(
    'keeps a callback consumed after %s failure and permits only a fresh authorization recovery',
    async (failure) => {
      const fixture = createFixture({ failures: { [failure]: 1 } })
      const first = await start(fixture)

      expect(await fixture.flow.complete(callbackRequest(first, first.binding))).toMatchObject({
        kind: 'error',
        status: 503,
      })
      const beforeReplay = fixture.calls.slice()
      expect(await fixture.flow.complete(callbackRequest(first, first.binding))).toMatchObject({
        kind: 'error',
        status: 503,
      })
      expect(fixture.calls).toEqual([...beforeReplay, 'consume'])

      const fresh = await start(fixture)
      expect(await fixture.flow.complete(callbackRequest(fresh, fresh.binding))).toMatchObject({
        kind: 'redirect',
        location: '/dashboard',
      })
    },
  )

  it('rejects disabled admission before reading downstream capabilities', () => {
    let capabilityReads = 0
    const unavailable = new Proxy({}, {
      get() {
        capabilityReads += 1
        throw new Error('must not read')
      },
    })

    expect(() => createAcademyIdentityRuntimeBrowserFlow({
      admission: { enabled: false, runtimeWired: false, releaseApproval: false },
      transactionStore: unavailable,
      authorizationPort: unavailable,
      registration: unavailable,
      codeExchangePort: unavailable,
      codeExchangeResultVerifier: unavailable,
      profileActivationStore: unavailable,
      sessionStore: unavailable,
      client: unavailable,
      clientAssertionProvider: unavailable,
    })).toThrow(AcademyIdentityRuntimeBrowserFlowUnavailableError)
    expect(capabilityReads).toBe(0)
  })
})

function createFixture(overrides: {
  registration?: { client: typeof CLIENT; redirectUris: string[] }
  failures?: Partial<Record<'activation' | 'session', number>>
} = {}) {
  const calls: string[] = []
  const store = new InMemoryIdentityTransactionStore({ now: () => 1_000 })
  let activationFailures = overrides.failures?.activation ?? 0
  let sessionFailures = overrides.failures?.session ?? 0
  const transactionStore = {
    create(input: Parameters<typeof store.create>[0]) {
      calls.push('create')
      return store.create(input)
    },
    consume(state: string, binding: string) {
      calls.push('consume')
      return store.consume(state, binding)
    },
  }
  const flow = createAcademyIdentityRuntimeBrowserFlow({
    admission: { enabled: true, runtimeWired: true, releaseApproval: true },
    transactionStore,
    authorizationPort: {
      async startAuthorization(request: {
        clientId: string
        redirectUri: string
        stateRef: string
        nonce: string
        codeChallenge: string
        codeChallengeMethod: 'S256'
        serviceId: string
      }) {
        calls.push('authorize')
        const url = new URL('/sign-in', 'https://accounts.cyberskills.co.th')
        url.searchParams.set('client_id', request.clientId)
        url.searchParams.set('redirect_uri', request.redirectUri)
        url.searchParams.set('state', request.stateRef)
        url.searchParams.set('nonce', request.nonce)
        url.searchParams.set('code_challenge', request.codeChallenge)
        url.searchParams.set('code_challenge_method', request.codeChallengeMethod)
        url.searchParams.set('service_id', request.serviceId)
        return { authorizeUrl: url.toString() }
      },
    },
    registration: overrides.registration ?? { client: CLIENT, redirectUris: [CLIENT.redirectUri] },
    codeExchangePort: {
      async exchangeCode() {
        calls.push('exchange')
        return { signedResult: 'fixture.signed.result' }
      },
    },
    codeExchangeResultVerifier: {
      async verify(_value: unknown, binding: {
        expectedAudience: string
        expectedClientId: string
        expectedNonce: string
        expectedPrincipalIssuer: string
        expectedServiceId: string
      }) {
        calls.push('verify')
        expect(binding).toEqual({
          expectedAudience: CLIENT.audience,
          expectedClientId: CLIENT.clientId,
          expectedNonce: fixtureNonce,
          expectedPrincipalIssuer: CLIENT.expectedIssuer,
          expectedServiceId: CLIENT.serviceId,
        })
        return {
          issuer: CLIENT.expectedIssuer,
          subject: 'founder-subject',
          verifiedEmail: 'Founder@cyberskills.co.th',
          audience: CLIENT.audience,
          serviceId: CLIENT.serviceId,
          nonce: fixtureNonce,
          activation: { status: 'active', revision: 1 },
        }
      },
    },
    profileActivationStore: {
      async commit(input: {
        issuer: string
        subject: string
        verifiedEmail: string
        activation: { status: 'active'; revision: number }
      }) {
        calls.push('activation')
        if (activationFailures > 0) {
          activationFailures -= 1
          throw new Error('activation fixture')
        }
        return { accountId: ACCOUNT_ID, ...input }
      },
    },
    sessionStore: {
      create(input: {
        issuer: string
        subject: string
        verifiedEmail: string
        activation: { status: 'active'; revision: number }
      }) {
        calls.push('session')
        if (sessionFailures > 0) {
          sessionFailures -= 1
          throw new Error('session fixture')
        }
        return {
          id: SESSION_ID,
          claims: { ...input, createdAt: 2_000, expiresAt: 3_000 },
        }
      },
    },
    client: CLIENT,
    clientAssertionProvider: {
      async createClientAssertion() {
        calls.push('assertion')
        return `${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(16)}`
      },
    },
  })
  let fixtureNonce = ''
  return { calls, flow, setNonce: (nonce: string) => { fixtureNonce = nonce } }
}

async function start(fixture: ReturnType<typeof createFixture>) {
  const result = await fixture.flow.start(startRequest())
  expect(result.kind).toBe('redirect')
  if (result.kind !== 'redirect') throw new Error('expected redirect')
  const authorizeUrl = new URL(result.location)
  const state = authorizeUrl.searchParams.get('state')
  const nonce = authorizeUrl.searchParams.get('nonce')
  expect(state).toBeTruthy()
  expect(nonce).toBeTruthy()
  fixture.setNonce(nonce as string)
  const cookie = result.cookies[0]
  const pair = cookie.split(';', 1)[0]
  const separator = pair.indexOf('=')
  return {
    state: state as string,
    cookieName: pair.slice(0, separator),
    binding: pair.slice(separator + 1),
  }
}

function startRequest(headers: Record<string, string> = {
  origin: 'https://academy.cyberskills.co.th',
  'sec-fetch-site': 'same-origin',
}): Request {
  return new Request('https://academy.cyberskills.co.th/api/auth/identity/start', {
    method: 'POST',
    headers: {
      host: 'academy.cyberskills.co.th',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams({ next: '/dashboard' }),
  })
}

function navigationRequest(query = 'next=%2Fdashboard'): Request {
  return new Request(`https://academy.cyberskills.co.th/api/auth/identity/start?${query}`, {
    method: 'GET',
    headers: {
      host: 'academy.cyberskills.co.th',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-user': '?1',
    },
  })
}

function callbackRequest(
  started: { state: string; cookieName: string },
  binding: string,
): Request {
  return new Request(
    `https://academy.cyberskills.co.th/auth/callback?code=code_1234567890abcdef&state=${started.state}`,
    { headers: { cookie: `${started.cookieName}=${binding}` } },
  )
}
