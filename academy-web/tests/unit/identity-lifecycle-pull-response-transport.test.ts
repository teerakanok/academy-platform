import { describe, expect, it, vi } from 'vitest'

import {
  createIdentityLifecyclePullResponseTransport,
  IDENTITY_LIFECYCLE_FETCH_INIT,
} from '@/lib/identity/lifecycle-pull-response-transport'

const REQUEST = {
  consumerId: 'academy-web',
  clientAssertion: 'a'.repeat(64),
  cursor: { sequence: '1' },
  limit: 50,
}

function response(headers: Record<string, string> = { 'cache-control': 'no-store' }) {
  return new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('Academy Identity lifecycle response transport', () => {
  it('uses the exact bounded POST request boundary', async () => {
    const expected = response()
    const fetch = vi.fn().mockResolvedValue(expected)
    const transport = createIdentityLifecyclePullResponseTransport({
      endpoint: 'https://identity.example.test/v1/lifecycle/events/pull',
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    await expect(transport.execute(REQUEST)).resolves.toBe(expected)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://identity.example.test/v1/lifecycle/events/pull')
    expect(init.method).toBe(IDENTITY_LIFECYCLE_FETCH_INIT.method)
    expect(init.headers).toEqual(IDENTITY_LIFECYCLE_FETCH_INIT.headers)
    expect(init.cache).toBe('no-store')
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('manual')
    expect(JSON.parse(init.body as string)).toEqual(REQUEST)
  })

  it.each([
    ['redirect', new Response(null, { status: 301, headers: { 'cache-control': 'no-store' } })],
    ['server error', new Response('{}', { status: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })],
    ['cacheable response', response({})],
  ])('refuses a %s before strict JSON parsing', async (_label, value) => {
    const fetch = vi.fn().mockResolvedValue(value)
    const transport = createIdentityLifecyclePullResponseTransport({
      endpoint: 'https://identity.example.test/v1/lifecycle/events/pull',
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })

    await expect(transport.execute(REQUEST)).rejects.toBeInstanceOf(Error)
  })

  it('rejects an insecure or malformed endpoint without network use', () => {
    const fetch = vi.fn()
    expect(() => createIdentityLifecyclePullResponseTransport({
      endpoint: 'https://identity.example.test/v1/lifecycle/events/pull?issuer=other',
      timeoutMs: 1_000,
      fetchPort: { fetch },
    })).toThrow(Error)
    expect(fetch).not.toHaveBeenCalled()
  })
})
