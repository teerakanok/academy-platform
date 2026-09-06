import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

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
const { POST: leadsRoute } = await import('@/app/(site)/api/leads/route')
const { GET: callbackRoute } = await import('@/app/(site)/auth/callback/route')
const { enforceEdgeRateLimit } = await import('@/lib/edge-rate-limit-enforcement')

const RATE_LIMIT_SECRET = 'identity-admission-test-secret-32-bytes'
const ORIGIN = 'https://academy.cyberskills.co.th'
const START_URL = `${ORIGIN}/api/auth/identity/start`
const LOCAL_ORIGIN = 'http://localhost:3000'
const LOCAL_START_URL = `${LOCAL_ORIGIN}/api/auth/identity/start`

let rpcCalls: string[] = []

type BudgetFixture = {
  counters: Map<string, number>
  failScope?: 'target' | 'global'
}

function isResponse(value: Request | Response): value is Response {
  return value instanceof Response
}

function budgetNamespace({ counters, failScope }: BudgetFixture) {
  return {
    getByName(name: string) {
      return {
        async check(rule: { limit: number, windowMs: number, operation: string }) {
          const scope = name.startsWith('v1:global:')
            ? 'global'
            : name.startsWith('v1:target:')
              ? 'target'
              : 'actor'
          if (scope === failScope) throw new Error('durable check failed')
          const current = counters.get(name) ?? 0
          const next = current + 1
          counters.set(name, next)
          return {
            allowed: next <= rule.limit,
            retryAfterSeconds: next > rule.limit ? 60 : 0,
          }
        },
      }
    },
  }
}

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
  it('does not use the in-memory limiter as a production marker fallback', async () => {
    const response = await leadsRoute(new NextRequest(`${ORIGIN}/api/leads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
      },
      body: JSON.stringify({ email: 'person@example.com' }),
    }))

    expect(response.status).toBe(503)
  })

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
    const namespace = budgetNamespace({ counters: new Map() })
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
    expect(rpcCalls).toEqual([])
  })

  it('aggregates IPv6 actors and durable route targets across source addresses', async () => {
    const counters = new Map<string, number>()
    const environment = {
      EDGE_RATE_LIMITER: budgetNamespace({ counters }),
      RATE_LIMIT_KEY_SECRET: RATE_LIMIT_SECRET,
    }

    const post = (ip: string, email: string) => enforceEdgeRateLimit(new Request(`${ORIGIN}/api/auth/otp`, {
      method: 'POST',
      headers: {
        'cf-connecting-ip': ip,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email }),
    }), environment)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const decision = await post(`2001:db8:aaaa:bbbb::${attempt + 1}`, `learner-${attempt}@example.com`)
      expect(decision).not.toBeInstanceOf(Response)
    }
    const same64 = await post('2001:db8:aaaa:bbbb::10', 'person@example.com')
    expect(same64).toBeInstanceOf(Response)
    expect(isResponse(same64) && same64.status).toBe(429)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const decision = await post(`198.51.100.${attempt + 1}`, 'person@example.com')
      expect(decision).not.toBeInstanceOf(Response)
    }
    const sameTarget = await post('198.51.100.20', 'PERSON@EXAMPLE.COM')
    expect(sameTarget).toBeInstanceOf(Response)
    expect(isResponse(sameTarget) && sameTarget.status).toBe(429)
    expect([...counters.keys()].join(' ')).not.toContain('person@example.com')
  })

  it('keeps a bounded global route ceiling above legitimate shared bursts', async () => {
    const counters = new Map<string, number>()
    const environment = {
      EDGE_RATE_LIMITER: budgetNamespace({ counters }),
      RATE_LIMIT_KEY_SECRET: RATE_LIMIT_SECRET,
    }
    const otp = (ip: string, email: string) => enforceEdgeRateLimit(new Request(`${ORIGIN}/api/auth/otp`, {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }), environment)

    for (let learner = 0; learner < 30; learner += 1) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const decision = await otp(`198.51.100.${learner + 1}`, `learner-${learner}-${attempt}@example.com`)
        expect(decision).not.toBeInstanceOf(Response)
      }
    }
    const overflow = await otp('198.51.100.31', 'overflow@example.com')
    expect(overflow).toBeInstanceOf(Response)
    expect(isResponse(overflow) && overflow.status).toBe(429)
    expect(counters.size).toBe(333)
  })

  it('fails closed when a later durable budget scope is unavailable', async () => {
    const decision = await enforceEdgeRateLimit(new Request(`${ORIGIN}/api/auth/otp`, {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '198.51.100.10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'person@example.com' }),
    }), {
      EDGE_RATE_LIMITER: budgetNamespace({ counters: new Map(), failScope: 'global' }),
      RATE_LIMIT_KEY_SECRET: RATE_LIMIT_SECRET,
    })

    expect(isResponse(decision) && decision.status).toBe(503)
  })

  it('rejects protected route variants and preserves a bounded request stream', async () => {
    const counters = new Map<string, number>()
    const environment = {
      EDGE_RATE_LIMITER: budgetNamespace({ counters }),
      RATE_LIMIT_KEY_SECRET: RATE_LIMIT_SECRET,
    }
    const invalid = await enforceEdgeRateLimit(new Request(`${ORIGIN}/auth%2Fcallback`), environment)
    expect(isResponse(invalid) && invalid.status).toBe(404)

    const source = JSON.stringify({ email: 'person@example.com' })
    const request = new Request(`${ORIGIN}/api/auth/otp`, {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '198.51.100.10',
        'content-type': 'application/json',
      },
      body: source,
    })
    const admitted = await enforceEdgeRateLimit(request, environment)
    expect(admitted).not.toBeInstanceOf(Response)
    expect(await admitted.text()).toBe(source)
  })
})
