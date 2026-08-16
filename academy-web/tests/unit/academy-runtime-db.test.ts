import { createHmac, timingSafeEqual } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { academyDataApiFetch, createAcademyDb, isSafeAcademyDataApiUrl } from '@/lib/db/server'
import {
  ACADEMY_RUNTIME_AUDIENCE,
  ACADEMY_RUNTIME_ROLE,
  ACADEMY_RUNTIME_TOKEN_TTL_SECONDS,
  issueAcademyRuntimeToken,
} from '@/lib/db/runtime-token'

const SECRET = 'academy-runtime-test-secret-at-least-32-bytes'

function decode(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signature: Buffer; signed: string } {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) throw new Error('expected compact JWT')
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    signature: Buffer.from(signature, 'base64url'),
    signed: `${header}.${payload}`,
  }
}

describe('Academy runtime data credential', () => {
  it('issues a short-lived HS256 token scoped to the dedicated Academy runtime role', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z')
    const token = await issueAcademyRuntimeToken(SECRET, now)
    const decoded = decode(token)
    const expectedSignature = createHmac('sha256', SECRET).update(decoded.signed).digest()

    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decoded.payload).toEqual({
      aud: ACADEMY_RUNTIME_AUDIENCE,
      exp: Math.floor(now.getTime() / 1000) + ACADEMY_RUNTIME_TOKEN_TTL_SECONDS,
      iat: Math.floor(now.getTime() / 1000),
      role: ACADEMY_RUNTIME_ROLE,
    })
    expect(timingSafeEqual(decoded.signature, expectedSignature)).toBe(true)
  })

  it('rejects a weak signing secret before issuing any credential', async () => {
    await expect(issueAcademyRuntimeToken('too-short')).rejects.toThrow(/32 bytes/i)
  })

  it.each([
    'http://127.0.0.1.evil.example',
    'http://127.0.0.1@evil.example',
    'http://localhost:50600',
    'https://academy-data.test/unexpected-path',
  ])('rejects an unsafe dedicated API URL: %s', (url) => {
    expect(() => createAcademyDb({ url, signingSecret: SECRET })).toThrow(/ACADEMY_DATA_API_URL/i)
  })

  it.each([
    ['http loopback origin', 'http://127.0.0.1:50600', true],
    ['https bare origin', 'https://academy-data.example.test', true],
    ['arbitrary http host', 'http://203.0.113.9:50600', false],
    ['loopback DNS alias', 'http://localhost:50600', false],
    ['credentialed origin', 'https://user@academy-data.example.test', false],
    ['non-origin path', 'https://academy-data.example.test/rest/v1', false],
    ['not a URL', 'not-a-url', false],
    ['empty', '', false],
  ])('dedicated API URL safety predicate accepts only app-client origins: %s', (_label, url, expected) => {
    expect(isSafeAcademyDataApiUrl(url)).toBe(expected)
  })

  it('rewrites a Request without losing its method, headers, or body', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('ok'),
    )
    const request = new Request('https://academy-data.test/rest/v1/rpc/example', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-contract': 'preserved' },
      body: '{"value":true}',
    })

    await academyDataApiFetch(fetch)(request)

    const [forwarded] = fetch.mock.calls[0]!
    expect(forwarded).toBeInstanceOf(Request)
    const rewritten = forwarded as Request
    expect(rewritten.url).toBe('https://academy-data.test/rpc/example')
    expect(rewritten.method).toBe('POST')
    expect(rewritten.headers.get('x-contract')).toBe('preserved')
    await expect(rewritten.text()).resolves.toBe('{"value":true}')
  })

  it('sends the runtime token to the dedicated Academy API rather than a Supabase service key', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('[]', { headers: { 'content-type': 'application/json' } }),
    )
    const db = createAcademyDb({
      url: 'https://academy-data.test',
      signingSecret: SECRET,
      fetch,
      now: () => new Date('2026-08-05T00:00:00.000Z'),
    })

    await db.from('users').select('id')

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(url).toBe('https://academy-data.test/users?select=id')
    expect(headers.get('accept-profile')).toBe('academy')
    expect(headers.get('authorization')).toBe(`Bearer ${await issueAcademyRuntimeToken(SECRET, new Date('2026-08-05T00:00:00.000Z'))}`)
    expect(headers.get('apikey')).not.toContain('service_role')
  })
})
