import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  legacyDirectOtpFixtureEnabled,
  legacyDirectOtpFixtureAllowedForRequest,
} from '@/lib/auth/legacy-direct-otp'
import { POST as startLegacyOtp } from '@/app/(site)/api/auth/otp/route'

afterEach(() => vi.unstubAllEnvs())

function configureLocalFixture() {
  vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '1')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-public-fixture-key')
}

describe('legacy direct OTP is test-only', () => {
  it('requires an explicit fixture switch and loopback Supabase origin', () => {
    configureLocalFixture()
    expect(legacyDirectOtpFixtureEnabled()).toBe(true)

    vi.stubEnv('ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE', '')
    expect(legacyDirectOtpFixtureEnabled()).toBe(false)

    configureLocalFixture()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.cyberskills.co.th')
    expect(legacyDirectOtpFixtureEnabled()).toBe(false)
  })

  it('refuses the fixture on a non-loopback Academy request even if its env is copied there', () => {
    configureLocalFixture()
    expect(legacyDirectOtpFixtureAllowedForRequest(new Request('http://127.0.0.1:3000/api/auth/otp'))).toBe(true)
    expect(legacyDirectOtpFixtureAllowedForRequest(new Request('https://academy.cyberskills.co.th/api/auth/otp'))).toBe(false)
  })

  it('returns unavailable before reading a direct OTP request outside the local fixture', async () => {
    configureLocalFixture()
    const response = await startLegacyOtp(
      new Request('https://academy.cyberskills.co.th/api/auth/otp', {
        method: 'POST',
        headers: { origin: 'https://academy.cyberskills.co.th', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'learner@example.test' }),
      }),
    )
    expect(response.status).toBe(503)
  })
})
