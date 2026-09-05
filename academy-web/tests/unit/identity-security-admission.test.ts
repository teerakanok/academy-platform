import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EDGE_RATE_LIMIT_MARKER_HEADER,
  hasEdgeRateLimitMarker,
  withEdgeRateLimitMarker,
} from '@/lib/edge-rate-limit-policy'

const database = vi.hoisted(() => ({ academyDb: vi.fn() }))

vi.mock('@/lib/db/server', () => ({ academyDb: database.academyDb }))

const { GET: startNavigationRoute, POST: startRoute } = await import(
  '@/app/(site)/api/auth/identity/start/route'
)
const { GET: callbackRoute } = await import('@/app/(site)/auth/callback/route')
const { enforceEdgeRateLimit } = await import('@/lib/edge-rate-limit-enforcement')

const RATE_LIMIT_SECRET = 'identity-admission-test-secret-32-bytes'
const ORIGIN = 'https://academy.cyberskills.co.th'
const START_URL = `${ORIGIN}/api/auth/identity/start`
const LOCAL_ORIGIN = 'http://localhost:3000'
const LOCAL_START_URL = `${LOCAL_ORIGIN}/api/auth/identity/start`

let rpcCalls: string[] = []

beforeEach(() => {
  vi.stubEnv('RATE_LIMIT_KEY_SECRET', RATE_LIMIT_SECRET)
  rpcCalls = []
  database.academyDb.mockReturnValue({
    rpc: vi.fn(async (name: string) => {
      rpcCalls.push(name)
      if (name === 'create_identity_authorization_transaction') {
        return { data: { status: 'created', expiresAt: '2030-01-01T00:00:00Z' }, error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    }),
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Identity unauthenticated admission', () => {
  it('rejects missing or forged edge markers before start or callback work', async () => {
    const missing = await startRoute(new Request(START_URL, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        host: 'academy.cyberskills.co.th',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    }))
    const forgedMarker = await withEdgeRateLimitMarker(new Request(START_URL, { method: 'POST' }), {
      secret: 'wrong-secret-at-least-32-bytes-long',
    })
    const forged = await startRoute(new Request(START_URL, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        host: 'academy.cyberskills.co.th',
        'content-type': 'application/x-www-form-urlencoded',
        [EDGE_RATE_LIMIT_MARKER_HEADER]: forgedMarker.headers.get(EDGE_RATE_LIMIT_MARKER_HEADER) ?? '',
      },
      body: new URLSearchParams({ next: '/dashboard' }),
    }))
    const missingNavigation = await startNavigationRoute(new Request(
      `${START_URL}?next=%2Fdashboard`,
      {
        headers: {
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
        },
      },
    ))
    const forgedCallbackMarker = await withEdgeRateLimitMarker(new Request(
      `${ORIGIN}/auth/callback?code=${'c'.repeat(24)}&state=${'s'.repeat(24)}`,
    ), {
      secret: 'wrong-secret-at-least-32-bytes-long',
    })
    const forgedCallback = await callbackRoute(new Request(
      `${ORIGIN}/auth/callback?code=${'c'.repeat(24)}&state=${'s'.repeat(24)}`,
      { headers: { [EDGE_RATE_LIMIT_MARKER_HEADER]: forgedCallbackMarker.headers.get(EDGE_RATE_LIMIT_MARKER_HEADER) ?? '' } },
    ))

    expect(missing.status).toBe(503)
    expect(forged.status).toBe(503)
    expect(missingNavigation.status).toBe(503)
    expect(forgedCallback.status).toBe(503)
    expect(rpcCalls).toEqual([])
  })

  it('rejects missing callback markers before any exchange work', async () => {
    const response = await callbackRoute(new Request(
      `${ORIGIN}/auth/callback?code=${'c'.repeat(24)}&state=${'s'.repeat(24)}`,
    ))

    expect(response.status).toBe(503)
    expect(rpcCalls).toEqual([])
  })

  it('bounds the POST form before a transaction is created', async () => {
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE', '1')
    vi.stubEnv('ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN', LOCAL_ORIGIN)
    const marked = await withEdgeRateLimitMarker(new Request(LOCAL_START_URL, { method: 'POST' }), {
      secret: RATE_LIMIT_SECRET,
    })
    const marker = marked.headers.get('x-cyberskills-edge-rate-limit')
    expect(marker).toBeTruthy()

    const multipart = await startRoute(new Request(LOCAL_START_URL, {
      method: 'POST',
      headers: {
        origin: LOCAL_ORIGIN,
        host: 'localhost:3000',
        'content-type': 'multipart/form-data; boundary=x',
        'x-cyberskills-edge-rate-limit': marker!,
      },
      body: '--x\r\nContent-Disposition: form-data; name="next"\r\n\r\n/dashboard\r\n--x--\r\n',
    }))
    let streamReads = 0
    const oversized = await startRoute(new Request(LOCAL_START_URL, {
      method: 'POST',
      headers: {
        origin: LOCAL_ORIGIN,
        host: 'localhost:3000',
        'content-type': 'application/x-www-form-urlencoded',
        'x-cyberskills-edge-rate-limit': marker!,
      },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          streamReads += 1
          controller.enqueue(new TextEncoder().encode(streamReads === 1 ? 'next=' : 'x'.repeat(64)))
        },
      }),
      // undici requires duplex for stream bodies.
      // @ts-expect-error -- RequestInit's DOM type omits the runtime-only option.
      duplex: 'half',
    }))

    expect(multipart.status).toBe(415)
    expect(oversized.status).toBe(413)
    expect(streamReads).toBeLessThan(100)
    expect(rpcCalls).toEqual([])
  })

  it('returns 429 before OpenNext when an actor exhausts its method-aware budget', async () => {
    let checks = 0
    const namespace = {
      getByName: () => ({
        async check() {
          checks += 1
          return {
            allowed: checks <= 10,
            retryAfterSeconds: checks <= 10 ? 0 : 60,
          }
        },
      }),
    }
    const environment = {
      EDGE_RATE_LIMITER: namespace,
      RATE_LIMIT_KEY_SECRET: RATE_LIMIT_SECRET,
    }
    let admitted = 0

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const request = new Request(START_URL, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '198.51.100.10',
          origin: ORIGIN,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ next: '/' }),
      })
      const decision = await enforceEdgeRateLimit(request, environment)
      if (decision instanceof Response) {
        expect(attempt).toBe(10)
        expect(decision.status).toBe(429)
        expect(decision.headers.get('retry-after')).toBe('60')
        break
      }
      admitted += 1
      expect(await hasEdgeRateLimitMarker(decision, { secret: RATE_LIMIT_SECRET })).toBe(true)
    }

    expect(admitted).toBe(10)
    expect(checks).toBe(11)
    expect(rpcCalls).toEqual([])
  })
})
