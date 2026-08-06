/**
 * The previous Academy-to-GoTrue OTP path survives only as a local E2E fixture.
 *
 * Real account creation and sign-in belong to Identity Control. Requiring both
 * an explicit test flag and loopback origins means copying public Supabase
 * values into a deployment cannot silently reactivate this superseded path.
 */
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function loopbackUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return isLoopback(new URL(value).hostname)
  } catch {
    return false
  }
}

export function legacyDirectOtpFixtureEnabled(): boolean {
  return (
    process.env.ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE === '1' &&
    loopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())
  )
}

export function legacyDirectOtpFixtureAllowedForHost(host: string): boolean {
  try {
    return legacyDirectOtpFixtureEnabled() && isLoopback(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}

export function legacyDirectOtpFixtureAllowedForRequest(request: Pick<Request, 'url'>): boolean {
  return legacyDirectOtpFixtureAllowedForHost(new URL(request.url).host)
}
