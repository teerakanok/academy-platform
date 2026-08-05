import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SignInPage from '@/app/sign-in/page'

vi.mock('@/components/auth/SignInForm', () => ({
  SignInForm: () => 'enabled-sign-in-form',
}))

afterEach(() => vi.unstubAllEnvs())

async function renderSignInPage() {
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

  it('shows the agreement with the usable sign-in form', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://academy.example.test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')

    const page = await renderSignInPage()

    expect(page).toContain('enabled-sign-in-form')
    expect(page).toContain('By continuing you agree to how we handle your data.')
  })
})
