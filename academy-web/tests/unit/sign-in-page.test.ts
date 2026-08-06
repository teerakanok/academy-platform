import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { headers } = vi.hoisted(() => ({ headers: vi.fn() }))

vi.mock('next/headers', () => ({ headers }))

import SignInPage from '@/app/sign-in/page'

vi.mock('@/components/auth/SignInForm', () => ({
  SignInForm: () => 'enabled-sign-in-form',
}))

afterEach(() => vi.unstubAllEnvs())

async function renderSignInPage(host = 'localhost:3000') {
  headers.mockResolvedValue(new Headers({ host }))
  return renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }))
}

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
