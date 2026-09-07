function localAccountCenterFormActionOrigin(): string | null {
  if (
    process.env.NODE_ENV === 'production'
    || process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE !== '1'
  ) return null

  const value = process.env.ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && url.origin === value
      ? value
      : null
  } catch {
    return null
  }
}

export function academyContentSecurityPolicy(scriptSources: string[]): string {
  const localAccountCenterOrigin = localAccountCenterFormActionOrigin()
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `form-action 'self'${localAccountCenterOrigin ? ` ${localAccountCenterOrigin}` : ''}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; ')
}
