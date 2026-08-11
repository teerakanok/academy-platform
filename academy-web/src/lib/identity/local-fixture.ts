const SESSION_ID = /^[A-Za-z0-9_-]{32,160}$/

export interface IdentityControlLocalFixtureEnvironment {
  NODE_ENV?: string
  ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE?: string
  ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN?: string
}

export function canonicalLocalIdentityOrigin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null
  try {
    const url = new URL(value)
    return url.origin === value
      && url.protocol === 'http:'
      && url.hostname === 'localhost'
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      ? value
      : null
  } catch {
    return null
  }
}

export function identityControlLocalFixtureEnabled(
  environment: IdentityControlLocalFixtureEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== 'production'
    && environment.ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE === '1'
    && canonicalLocalIdentityOrigin(environment.ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN) !== null
}

export function identityControlLocalFixtureAllowedForRequest(
  request: Pick<Request, 'url'>,
  environment: IdentityControlLocalFixtureEnvironment = process.env,
): boolean {
  if (!identityControlLocalFixtureEnabled(environment)) return false
  return new URL(request.url).origin === environment.ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN
}

export function identityControlLocalFixtureAllowedForHost(
  host: string,
  environment: IdentityControlLocalFixtureEnvironment = process.env,
): boolean {
  if (!identityControlLocalFixtureEnabled(environment)) return false
  try {
    return new URL(`http://${host}`).origin === environment.ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN
  } catch {
    return false
  }
}

export function hasSyntacticallyValidLocalAcademySession(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  let count = 0
  let valid = false
  for (const part of cookieHeader.split(';')) {
    const pair = part.trim()
    const separator = pair.indexOf('=')
    if ((separator === -1 ? pair : pair.slice(0, separator)).trim() !== 'academy_session') continue
    count += 1
    valid = separator !== -1 && SESSION_ID.test(pair.slice(separator + 1).trim())
  }
  return count === 1 && valid
}
