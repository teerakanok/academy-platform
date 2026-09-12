import { afterEach, describe, expect, it, vi } from 'vitest'
import { signOutCurrentBrowser, signOutIdentityBrowser } from '@/lib/auth/sign-out-client'
import { projectSignOutResponseWithSso } from '@/lib/auth/account-response-client'
import { academyContentSecurityPolicy } from '@/lib/content-security-policy'

const url = 'https://accounts.cyberskills.co.th/v1/sessions/signout'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
})
const local = (revocation = 'confirmed') => json({ ok: true, scope: 'local', revocation, ssoSignoutUrl: url })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('current browser sign-out transport', () => {
  it('waits for verified SSO completion after local revocation before resolving navigation', async () => {
    let finish!: (response: Response) => void
    const sso = new Promise<Response>((resolve) => { finish = resolve })
    const fetcher = vi.fn().mockResolvedValueOnce(local()).mockReturnValueOnce(sso)
    vi.stubGlobal('fetch', fetcher)
    let completed = false
    const result = signOutCurrentBrowser().then((path) => { completed = true; return path })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(completed).toBe(false)
    expect(fetcher.mock.calls[0][0]).toBe('/api/auth/sign-out')
    expect(fetcher.mock.calls[1]).toEqual([url, expect.objectContaining({
      method: 'POST', credentials: 'include', mode: 'cors', redirect: 'error',
      headers: { 'content-type': 'application/json' }, body: '{}',
      cache: 'no-store', signal: expect.any(AbortSignal),
    })])
    finish(json({ signedOut: true }))
    await expect(result).resolves.toBe('/')
  })

  it.each(['confirmed', 'not-confirmed'])('reports SSO failure without claiming %s local revocation', async (revocation) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(local(revocation)).mockRejectedValueOnce(new TypeError('CORS denied')))
    await expect(signOutCurrentBrowser()).resolves.toBe(revocation === 'confirmed'
      ? '/sign-in?notice=sso-unconfirmed' : '/sign-in?notice=sign-out-unconfirmed')
  })

  it('never starts SSO if local sign-out response is unverified', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ok: false }, 503))
    vi.stubGlobal('fetch', fetcher)
    await expect(signOutCurrentBrowser()).rejects.toThrow('sign-out failed')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('bounds an unresponsive SSO connection', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const result = signOutIdentityBrowser(url)
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(result).resolves.toBe(false)
  })

  it('bounds local response headers and retains error/retry without starting SSO', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetcher)
    const result = signOutCurrentBrowser()
    const rejection = expect(result).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
    expect(fetcher).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses one deadline across local headers and response body', async () => {
    vi.useFakeTimers()
    const body = new ReadableStream<Uint8Array>({ type: 'bytes', pull() {} })
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response(body, { headers: { 'content-type': 'application/json' } })), 4_000)
    }))
    vi.stubGlobal('fetch', fetcher)
    const result = signOutCurrentBrowser()
    const rejection = expect(result).rejects.toThrow('sign-out failed')
    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
    expect(fetcher).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    '{"signedOut":false}', '{"signedOut":true,"extra":true}',
    '{"signedOut":true,"signedOut":true}', '[{"signedOut":true}]', 'null',
    JSON.stringify({ signedOut: true, padding: 'x'.repeat(1024) }),
  ])('rejects malformed or unbounded confirmation %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })))
    await expect(signOutIdentityBrowser(url)).resolves.toBe(false)
  })

  it.each([403, 500, 503])('rejects HTTP %s even with success-shaped JSON', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ signedOut: true }, status)))
    await expect(signOutIdentityBrowser(url)).resolves.toBe(false)
  })

  it.each([
    'https://evil.test/out', `${url}?redirect=1`, `${url}/`,
    'https://accounts.cyberskills.co.th.evil.test/v1/sessions/signout',
    'https://user:pass@accounts.cyberskills.co.th/v1/sessions/signout',
  ])('rejects a different endpoint before credentialed fetch: %s', async (endpoint) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(projectSignOutResponseWithSso({ ok: true, scope: 'local', revocation: 'confirmed', ssoSignoutUrl: endpoint })).toBeNull()
    await expect(signOutIdentityBrowser(endpoint)).resolves.toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('allows only self and the exact account center in the page connection policy', () => {
    expect(academyContentSecurityPolicy(["'self'", "'nonce-test'", "'strict-dynamic'"])
      .split('; ').find((directive) => directive.startsWith('connect-src')))
      .toBe("connect-src 'self' https://accounts.cyberskills.co.th")
  })
})
