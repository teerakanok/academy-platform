import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { headers, signInForm } = vi.hoisted(() => ({
  headers: vi.fn(),
  signInForm: vi.fn(() => 'enabled-sign-in-form'),
}))

vi.mock('next/headers', () => ({ headers }))

import SignInPage from '@/app/(site)/sign-in/page'

vi.mock('@/components/auth/SignInForm', () => ({
  SignInForm: signInForm,
}))

afterEach(() => vi.unstubAllEnvs())

beforeEach(() => {
  signInForm.mockClear()
})

async function renderSignInPage(host = 'localhost:3000') {
  headers.mockResolvedValue(new Headers({ host }))
  return renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }))
}

function stubProductionIdentityControl(overrides: Record<string, string | undefined> = {}) {
  const values = {
    IDENTITY_ADAPTER: 'identity-control',
    IDENTITY_RUNTIME_ENABLED: 'true',
    IDENTITY_RUNTIME_WIRED: 'true',
    IDENTITY_RELEASE_APPROVAL: 'true',
    IDENTITY_CODE_EXCHANGE_TIMEOUT_MS: '1000',
    IDENTITY_CLIENT_ASSERTION_KEY_ID: 'academy-sign-in-test',
    IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK: PRIVATE_JWK,
    IDENTITY_RESULT_KEY_SET_DOCUMENT: RESULT_KEY_SET_DOCUMENT,
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

const PRIVATE_JWK = await (async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', (keyPair as CryptoKeyPair).privateKey)
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })
})()

const RESULT_KEY_SET_DOCUMENT = JSON.stringify({
  issuer: 'https://accounts.cyberskills.co.th/v1/code/results',
  revision: 1,
  keys: [{
    keyId: 'identity-result-sign-in-test',
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

describe('closed sign-in state', () => {
  it('does not show an agreement to continue when accounts cannot be used', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

    const page = await renderSignInPage()

    expect(page).toContain('Accounts are not open yet')
    expect(page).not.toContain('By continuing you agree to how we handle your data.')
  })

  it('does not reopen direct Academy OTP when production-looking public values are present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.cyberskills.co.th')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')

    const page = await renderSignInPage()

    expect(page).toContain('Accounts are not open yet')
    expect(page).not.toContain('enabled-sign-in-form')
  })

  it('shows the agreement with the usable sign-in form', async () => {
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')

    const page = await renderSignInPage()

    expect(page).toContain('enabled-sign-in-form')
    expect(page).toContain('By continuing you agree to how we handle your data.')
    expect(signInForm).toHaveBeenCalledWith(
      expect.objectContaining({ identityControl: false }),
      expect.anything(),
    )
  })

  it('opens the Identity Control mode with fully admitted production configuration', async () => {
    stubProductionIdentityControl()

    const page = await renderSignInPage('academy.cyberskills.co.th')

    expect(page).toContain('enabled-sign-in-form')
    expect(page).not.toContain('Accounts are not open yet')
    expect(signInForm).toHaveBeenCalledWith(
      expect.objectContaining({ identityControl: true }),
      expect.anything(),
    )
  })

  it('keeps incomplete production configuration closed', async () => {
    stubProductionIdentityControl({ IDENTITY_RUNTIME_WIRED: undefined })

    const page = await renderSignInPage('academy.cyberskills.co.th')

    expect(page).toContain('Accounts are not open yet')
    expect(signInForm).not.toHaveBeenCalled()
  })

  it('keeps production fake adapters closed even with complete runtime values', async () => {
    stubProductionIdentityControl({ IDENTITY_ADAPTER: 'fake', NODE_ENV: 'production' })

    const page = await renderSignInPage('academy.cyberskills.co.th')

    expect(page).toContain('Accounts are not open yet')
    expect(signInForm).not.toHaveBeenCalled()
  })

  it('keeps the local Identity Control fixture behavior unchanged', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE', '1')
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN', 'http://localhost:3000')

    const page = await renderSignInPage()

    expect(page).toContain('enabled-sign-in-form')
    expect(signInForm).toHaveBeenCalledWith(
      expect.objectContaining({ identityControl: true }),
      expect.anything(),
    )
  })

  it('does not show the legacy OTP form on a public Academy host even with a copied local fixture config', async () => {
    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-public-fixture-key')

    const page = await renderSignInPage('academy.cyberskills.co.th')

    expect(page).toContain('Accounts are not open yet')
    expect(page).not.toContain('enabled-sign-in-form')
  })
})
