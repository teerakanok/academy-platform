import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AcademyIdentityRuntimeBrowserFlow,
  AcademyIdentityRuntimeBrowserFlowResult,
} from '@/lib/identity/runtime-browser-flow'

const routeMocks = vi.hoisted(() => {
  class IdentityAdapterUnavailableError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'IdentityAdapterUnavailableError'
    }
  }

  const startMock = vi.fn<AcademyIdentityRuntimeBrowserFlow['start']>()
  const completeMock = vi.fn<AcademyIdentityRuntimeBrowserFlow['complete']>()
  const browserFlow: AcademyIdentityRuntimeBrowserFlow = {
    start: startMock,
    complete: completeMock,
  }

  return {
    browserFlow,
    startMock,
    completeMock,
    getIdentityRuntimeBrowserFlow: vi.fn<() => AcademyIdentityRuntimeBrowserFlow | null>(),
    identityControlLocalFixtureAllowedForRequest: vi.fn<(request: Request) => boolean>(),
    IdentityAdapterUnavailableError,
  }
})

vi.mock('@/lib/identity/local-fixture', () => ({
  identityControlLocalFixtureAllowedForRequest:
    routeMocks.identityControlLocalFixtureAllowedForRequest,
}))

vi.mock('@/lib/identity/registry', () => ({
  IdentityAdapterUnavailableError: routeMocks.IdentityAdapterUnavailableError,
  getIdentityRuntimeBrowserFlow: routeMocks.getIdentityRuntimeBrowserFlow,
}))

const { POST: startRoute } = await import('@/app/(site)/api/auth/identity/start/route')
const { GET: callbackRoute } = await import('@/app/(site)/auth/callback/route')

const academyOrigin = 'https://academy.tests.example'
const identityAuthorizationUrl = 'https://identity.tests.example/authorize?response_type=code&state=state_1234567890'
const sessionCookie =
  'academy_session=opaque_session_value_123456; Path=/; HttpOnly; SameSite=Lax'
const browserBindingExpiryCookie =
  'academy_identity_binding=; Path=/auth/callback; Max-Age=0; HttpOnly; SameSite=Lax'

beforeEach(() => {
  routeMocks.identityControlLocalFixtureAllowedForRequest.mockReturnValue(false)
  routeMocks.getIdentityRuntimeBrowserFlow.mockReturnValue(routeMocks.browserFlow)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('Identity runtime browser-flow routes', () => {
  it('redirects an enabled start request using the exact request, flow status, target, and cookies', async () => {
    const request = new Request(`${academyOrigin}/api/auth/identity/start`, { method: 'POST' })
    const result: AcademyIdentityRuntimeBrowserFlowResult = {
      kind: 'redirect',
      status: 303,
      location: identityAuthorizationUrl,
      cookies: [sessionCookie, browserBindingExpiryCookie],
    }
    routeMocks.startMock.mockResolvedValueOnce(result)

    const response = await startRoute(request)

    expect(routeMocks.startMock).toHaveBeenCalledTimes(1)
    expect(routeMocks.startMock.mock.calls[0][0]).toBe(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(identityAuthorizationUrl)
    expect(response.headers.getSetCookie()).toEqual([sessionCookie, browserBindingExpiryCookie])
  })

  it('returns the enabled start error result without redirecting', async () => {
    const request = new Request(`${academyOrigin}/api/auth/identity/start`, { method: 'POST' })
    routeMocks.startMock.mockResolvedValueOnce({
      kind: 'error',
      status: 403,
      error: 'route_start_denied',
      cookies: [],
    })

    const response = await startRoute(request)

    expect(routeMocks.startMock).toHaveBeenCalledTimes(1)
    expect(routeMocks.startMock.mock.calls[0][0]).toBe(request)
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'route_start_denied' })
  })

  it('completes an enabled callback with the exact request and resolves its return location', async () => {
    const request = new Request(`${academyOrigin}/auth/callback?code=opaque_code_123456&state=state_1234567890`)
    routeMocks.completeMock.mockResolvedValueOnce({
      kind: 'redirect',
      status: 303,
      location: '/dashboard?return=%2Fcourses',
      cookies: [sessionCookie, browserBindingExpiryCookie],
    })

    const response = await callbackRoute(request)

    expect(routeMocks.completeMock).toHaveBeenCalledTimes(1)
    expect(routeMocks.completeMock.mock.calls[0][0]).toBe(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${academyOrigin}/dashboard?return=%2Fcourses`)
    expect(response.headers.getSetCookie()).toEqual([sessionCookie, browserBindingExpiryCookie])
  })

  it('returns an enabled callback error result with cookies and without redirecting', async () => {
    const request = new Request(`${academyOrigin}/auth/callback?code=opaque_code_654321&state=state_0987654321`)
    routeMocks.completeMock.mockResolvedValueOnce({
      kind: 'error',
      status: 400,
      error: 'route_callback_invalid',
      cookies: [browserBindingExpiryCookie, sessionCookie],
    })

    const response = await callbackRoute(request)

    expect(routeMocks.completeMock).toHaveBeenCalledTimes(1)
    expect(routeMocks.completeMock.mock.calls[0][0]).toBe(request)
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'route_callback_invalid' })
    expect(response.headers.getSetCookie()).toEqual([browserBindingExpiryCookie, sessionCookie])
  })
})
