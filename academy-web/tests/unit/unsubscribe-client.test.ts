import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitUnsubscribeRequest } from '@/lib/unsubscribe-client'

const TOKEN = '4b0f42d8-5cce-4c7b-9662-865e2289c144'

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

describe('unsubscribe client response boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts the exact success response and preserves the request contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{"ok":true}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/leads/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
    })
  })

  it('accepts JSON whitespace around the sole success member', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(' \r\n { \t "ok" : true } \n ')))

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(true)
  })

  it('rejects a UTF-8 BOM before an otherwise exact success envelope', async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"ok":true}')])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it.each([
    ['an explicit failure', () => jsonResponse('{"ok":false}')],
    ['a string success flag', () => jsonResponse('{"ok":"true"}')],
    ['an extra field', () => jsonResponse('{"ok":true,"error":"unexpected"}')],
    ['null', () => jsonResponse('null')],
    ['an array', () => jsonResponse('[{"ok":true}]')],
    ['malformed JSON', () => jsonResponse('<html>not json</html>')],
    ['an empty response', () => new Response(null, { status: 204, headers: { 'content-type': 'application/json' } })],
  ])('fails closed for HTTP success carrying %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it.each([
    ['last duplicate true', '{"ok":false,"ok":true}'],
    ['last duplicate false', '{"ok":true,"ok":false}'],
  ])('rejects %s rather than accepting JSON parser key collapse', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it('rejects an oversized success envelope before accepting its value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(`${' '.repeat(1_024)}{"ok":true}`)))

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it('rejects an exact body served with a non-JSON media type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'text/plain' } }),
      ),
    )

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it('fails closed when HTTP status rejects an otherwise exact body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse('{"ok":true}', 502)),
    )

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })

  it('fails closed when the request cannot be completed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(submitUnsubscribeRequest(TOKEN)).resolves.toBe(false)
  })
})
