import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as startAuthorization } from '@/app/(site)/api/auth/identity/start/route'
import { GET as completeCallback } from '@/app/(site)/auth/callback/route'
import { GET as readAccount } from '@/app/(site)/api/auth/me/route'
import { POST as signOut } from '@/app/(site)/api/auth/sign-out/route'
import { GET as readProgress } from '@/app/(site)/api/progress/route'
import { createIdentityLocalRuntime, createLocalAcademySession } from '@/lib/identity/local-runtime'

const originalEnvironment = { ...process.env }
const originalFetch = globalThis.fetch

function byteJsonResponse(value: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let sent = false
  const ByteReadableStream = ReadableStream as unknown as {
    new (source: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  const body = new ByteReadableStream({
    type: 'bytes',
    pull(controller) {
      if (sent) {
        controller.close()
        return
      }
      sent = true
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
    },
  })
}

function cookiePair(setCookie: string, name: string): string {
  const match = new RegExp(`(?:^|, )(${name}[^=]*=[^;]*)`).exec(setCookie)
  if (!match?.[1]) throw new Error(`missing ${name} cookie`)
  return match[1]
}

describe('Academy local Identity Control browser flow', () => {
  let stateDirectory: string

  beforeEach(() => {
    stateDirectory = mkdtempSync(join(tmpdir(), 'academy-local-identity-'))
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE: '1',
      ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN: 'http://localhost:3000',
      ACADEMY_IDENTITY_CONTROL_LOCAL_ACCOUNT_CENTER_ORIGIN: 'http://localhost:5173',
      ACADEMY_IDENTITY_CONTROL_LOCAL_API_ORIGIN: 'http://localhost:8788',
      ACADEMY_IDENTITY_CONTROL_LOCAL_STATE_DIRECTORY: stateDirectory,
    }
  })

  afterEach(() => {
    process.env = { ...originalEnvironment }
    globalThis.fetch = originalFetch
    rmSync(stateDirectory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('completes sign-in through Account Center and creates an Academy session with zero entitlement', async () => {
    const started = await startAuthorization(new Request('http://localhost:3000/api/auth/identity/start', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    }))
    expect(started.status).toBe(303)
    const accountCenterUrl = new URL(started.headers.get('location')!)
    expect(accountCenterUrl.origin + accountCenterUrl.pathname).toBe('http://localhost:5173/sign-in')
    expect([...accountCenterUrl.searchParams.keys()].sort()).toEqual([
      'client_id',
      'code_challenge',
      'code_challenge_method',
      'nonce',
      'redirect_uri',
      'service_id',
      'state',
    ])
    expect(accountCenterUrl.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback')
    const bindingCookie = cookiePair(started.headers.get('set-cookie')!, 'academy_identity_binding_')
    expect(started.headers.get('set-cookie')).toContain('HttpOnly')
    expect(started.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect(started.headers.get('set-cookie')).not.toContain('Secure')

    const state = accountCenterUrl.searchParams.get('state')!
    const nonce = accountCenterUrl.searchParams.get('nonce')!
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe('http://localhost:8788/v1/code/exchange')
      expect(init?.method).toBe('POST')
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(request.clientId).toBe('academy-web-local')
      expect(request.redirectUri).toBe('http://localhost:3000/auth/callback')
      expect(request.clientAssertion).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      return byteJsonResponse({
        issuer: 'synthetic-local-issuer',
        subject: 'synthetic-local-subject',
        verifiedEmail: 'learner@example.com',
        audience: 'academy-api-local',
        serviceId: 'academy',
        nonce,
        activation: { status: 'active', revision: 1 },
      })
    }) as typeof fetch

    const callback = await completeCallback(new Request(
      `http://localhost:3000/auth/callback?code=code_reference_123456789&state=${state}`,
      { headers: { cookie: bindingCookie, host: 'localhost:3000' } },
    ))
    expect(callback.status).toBe(303)
    expect(callback.headers.get('location')).toBe('http://localhost:3000/dashboard')
    const sessionCookie = cookiePair(callback.headers.get('set-cookie')!, 'academy_session')
    expect(callback.headers.get('set-cookie')).toContain('Max-Age=86400')
    expect(callback.headers.get('set-cookie')).toContain(`${bindingCookie.split('=')[0]}=;`)
    expect(JSON.parse(readFileSync(join(stateDirectory, 'sessions.json'), 'utf8'))).toMatchObject({ version: 1 })

    const me = await readAccount(new Request('http://localhost:3000/api/auth/me', {
      headers: { cookie: sessionCookie, host: 'localhost:3000' },
    }))
    await expect(me.json()).resolves.toEqual({ signedIn: true, email: 'learner@example.com' })

    const progress = await readProgress(new Request('http://localhost:3000/api/progress', {
      headers: { cookie: sessionCookie, host: 'localhost:3000' },
    }))
    expect(progress.status).toBe(200)
    await expect(progress.json()).resolves.toEqual({
      ok: true,
      accessibleCourseSlugs: [],
      courses: [],
      records: {},
    })

    const signedOut = await signOut(new Request('http://localhost:3000/api/auth/sign-out', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    }))
    expect(signedOut.status).toBe(200)
    await expect(signedOut.json()).resolves.toEqual({ ok: true, scope: 'local', revocation: 'confirmed' })
    expect(signedOut.headers.get('set-cookie')).toContain('academy_session=;')

    const afterSignOut = await readAccount(new Request('http://localhost:3000/api/auth/me', {
      headers: { cookie: sessionCookie, host: 'localhost:3000' },
    }))
    await expect(afterSignOut.json()).resolves.toEqual({ signedIn: false })
  })

  it('refuses local runtime on a non-loopback request before creating state', async () => {
    const response = await startAuthorization(new Request('https://academy.example/api/auth/identity/start', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'academy.example',
        origin: 'https://academy.example',
        'sec-fetch-site': 'same-origin',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    }))
    expect(response.status).toBe(404)
  })

  it('keeps a suspended local identity signed in but denies Academy course access', async () => {
    const request = new Request('http://localhost:3000/api/progress', {
      headers: { host: 'localhost:3000' },
    })
    const runtime = createIdentityLocalRuntime(request)
    const sessionCookie = createLocalAcademySession(runtime, {
      issuer: 'synthetic-local-issuer',
      subject: 'synthetic-local-subject',
      verifiedEmail: 'learner@example.com',
      audience: 'academy-api-local',
      serviceId: 'academy',
      nonce: 'synthetic-nonce',
      activation: { status: 'suspended', revision: 2 },
    })

    const response = await readProgress(new Request('http://localhost:3000/api/progress', {
      headers: { cookie: sessionCookie.split(';', 1)[0], host: 'localhost:3000' },
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'บัญชีนี้ยังใช้ Academy ไม่ได้' })
  })
})
