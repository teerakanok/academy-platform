import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createAcademyIdentityProductionAuthorizationPort,
  createAcademyIdentityProductionRuntimeBrowserFlow,
  projectAcademyIdentityProductionRuntimeConfig,
} from '@/lib/identity/production-runtime'

const RESULT_ISSUER = 'https://accounts.cyberskills.co.th/v1/code/results'
const PRIVATE_JWK = await (async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', (keyPair as CryptoKeyPair).privateKey)
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })
})()
const RESULT_KEY_SET_DOCUMENT = JSON.stringify({
  issuer: RESULT_ISSUER,
  revision: 1,
  keys: [{
    keyId: 'identity-result-production-test',
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

function enabledEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    IDENTITY_RUNTIME_ENABLED: 'true',
    IDENTITY_RUNTIME_WIRED: 'true',
    IDENTITY_RELEASE_APPROVAL: 'true',
    IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '1000',
    IDENTITY_CLIENT_ASSERTION_KEY_ID: 'academy-production-test',
    IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: PRIVATE_JWK,
    IDENTITY_RESULT_KEY_SET_DOCUMENT: RESULT_KEY_SET_DOCUMENT,
    ...overrides,
  }
}

function dependencies() {
  const rpc = vi.fn(async () => ({ data: { status: 'created', expiresAt: '2030-01-02T03:04:05.000Z' }, error: null }))
  return {
    academyDb: vi.fn(() => ({ rpc })),
    fetch: vi.fn(),
    createSigner: vi.fn(),
    importKeySet: vi.fn(),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Academy production Identity Control composition', () => {
  it.each([
    ['disabled', { IDENTITY_RUNTIME_ENABLED: 'false' }],
    ['partial', { IDENTITY_RESULT_KEY_SET_DOCUMENT: undefined }],
    ['noncanonical timeout', { IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '01000' }],
    ['duplicate public-key document member', {
      IDENTITY_RESULT_KEY_SET_DOCUMENT: RESULT_KEY_SET_DOCUMENT.replace('"issuer"', '"issuer":"https://attacker.invalid","issuer"'),
    }],
    ['surplus public-key document member', {
      IDENTITY_RESULT_KEY_SET_DOCUMENT: RESULT_KEY_SET_DOCUMENT.replace('"revision":1', '"revision":1,"surplus":true'),
    }],
    ['noncanonical public-key coordinate', {
      IDENTITY_RESULT_KEY_SET_DOCUMENT: RESULT_KEY_SET_DOCUMENT.replace('vsH-Muazqvy-BMIqlGTEZdM3RvQnpPXgHcuYgb3_N-4', 'vsH-Muazqvy-BMIqlGTEZdM3RvQnpPXgHcuYgb3_N-5'),
    }],
    ['malformed private JWK', { IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: '{' }],
  ])('%s configuration is rejected before any database, network, or crypto capability', (_label, overrides) => {
    const deps = dependencies()

    expect(projectAcademyIdentityProductionRuntimeConfig(enabledEnvironment(overrides))).toBeNull()
    expect(createAcademyIdentityProductionRuntimeBrowserFlow({
      environment: enabledEnvironment(overrides),
      dependencies: deps,
    })).toBeNull()
    expect(deps.academyDb).not.toHaveBeenCalled()
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.createSigner).not.toHaveBeenCalled()
    expect(deps.importKeySet).not.toHaveBeenCalled()
  })

  it('binds all runtime capabilities to one admitted Academy-only configuration and emits the exact authorization URL', async () => {
    const deps = dependencies()
    const flow = createAcademyIdentityProductionRuntimeBrowserFlow({
      environment: enabledEnvironment(),
      dependencies: deps,
    })

    expect(flow).not.toBeNull()
    expect(deps.academyDb).toHaveBeenCalledTimes(1)
    const request = new Request('https://academy.cyberskills.co.th/api/auth/identity/start', {
      method: 'POST',
      headers: {
        origin: 'https://academy.cyberskills.co.th',
        host: 'academy.cyberskills.co.th',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    })
    const result = await flow!.start(request)

    expect(result).toMatchObject({ kind: 'redirect', status: 303 })
    if (result.kind !== 'redirect') throw new Error('expected production redirect')
    const url = new URL(result.location)
    expect(url.origin).toBe('https://accounts.cyberskills.co.th')
    expect(url.pathname).toBe('/sign-in')
    expect(url.username).toBe('')
    expect(url.password).toBe('')
    expect(url.hash).toBe('')
    expect([...url.searchParams.keys()].sort()).toEqual([
      'client_id', 'code_challenge', 'code_challenge_method', 'nonce', 'redirect_uri', 'service_id', 'state',
    ])
    for (const key of url.searchParams.keys()) expect(url.searchParams.getAll(key)).toHaveLength(1)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'academy-web',
      redirect_uri: 'https://academy.cyberskills.co.th/auth/callback',
      code_challenge_method: 'S256',
      service_id: 'academy',
    })
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.createSigner).not.toHaveBeenCalled()
    expect(deps.importKeySet).not.toHaveBeenCalled()
  })

  it('rejects malformed, surplus, or mismatched authorization requests without reflecting their values', () => {
    const port = createAcademyIdentityProductionAuthorizationPort()
    const valid = {
      clientId: 'academy-web',
      redirectUri: 'https://academy.cyberskills.co.th/auth/callback',
      stateRef: 'state_1234567890abcdef',
      nonce: 'nonce_1234567890abcdef',
      codeChallenge: 'A'.repeat(43),
      codeChallengeMethod: 'S256' as const,
      serviceId: 'academy',
    }
    const accepted = port.startAuthorization(valid)
    const url = new URL(accepted.authorizeUrl)
    expect([...url.searchParams.keys()]).toEqual([
      'client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method', 'service_id',
    ])

    for (const candidate of [
      { ...valid, clientId: 'other-client' },
      { ...valid, redirectUri: 'https://attacker.example/callback' },
      { ...valid, serviceId: 'other-service' },
      { ...valid, codeChallengeMethod: 'plain' },
      { ...valid, surplus: 'credential=TOP_SECRET' },
    ]) {
      let captured: unknown
      try {
        port.startAuthorization(candidate as never)
      } catch (error) {
        captured = error
      }
      expect(captured).toBeInstanceOf(Error)
      expect(String(captured)).not.toContain('TOP_SECRET')
    }
  })

  it('does not disclose private JWK text from rejected configuration', () => {
    const marker = 'TOP_SECRET_PRIVATE_JWK'
    const value = projectAcademyIdentityProductionRuntimeConfig(enabledEnvironment({
      IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: marker,
    }))

    expect(value).toBeNull()
    expect(JSON.stringify(value)).not.toContain(marker)
  })
})
