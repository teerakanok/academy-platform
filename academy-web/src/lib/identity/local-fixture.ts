import {
  HOST_ACADEMY_SESSION_COOKIE,
  LEGACY_ACADEMY_SESSION_COOKIE,
  parseSessionCookieForNames,
} from '../auth/session-cookie'

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
  return parseSessionCookieForNames(
    cookieHeader,
    process.env.NODE_ENV === 'production'
      ? [HOST_ACADEMY_SESSION_COOKIE]
      : [HOST_ACADEMY_SESSION_COOKIE, LEGACY_ACADEMY_SESSION_COOKIE],
  ) !== null
}
