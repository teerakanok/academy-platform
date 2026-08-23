import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readExactOkJsonResponse } from '@/lib/http/exact-ok-response'
import { normalizeWaitlistEmail, submitWaitlistRequest } from '@/lib/waitlist-client'

const REQUEST = {
  email: 'learner@example.com',
  consent: true as const,
  utmSource: 'newsletter',
  utmMedium: 'email',
  utmCampaign: 'academy-launch',
  referrer: 'https://cyberskills.co.th/academy',
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function boundaryEmail(length: number): string {
  const domain = `${'a'.repeat(63)}.exampl`
  return `${'a'.repeat(length - domain.length - 1)}@${domain}`
}

function byteStream(source: UnderlyingByteSource): ReadableStream<Uint8Array> {
  const ByteReadableStream = ReadableStream as unknown as {
    new (underlyingSource: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  return new ByteReadableStream(source)
}

function trackedResponse(
  body: string,
  { contentType = 'application/json', status = 400 }: { contentType?: string; status?: number } = {},
) {
  const bytes = new TextEncoder().encode(body)
  const activity = { cancels: 0, pulls: 0 }
  let sent = false
  const stream = byteStream({
    type: 'bytes',
    pull(controller) {
      activity.pulls += 1
      if (sent || bytes.byteLength === 0) {
        controller.close()
        return
      }
      sent = true
      controller.enqueue(bytes)
      controller.close()
    },
    cancel() {
      activity.cancels += 1
    },
  })

  return {
    activity,
    response: new Response(stream, {
      status,
      headers: { 'content-type': contentType },
    }),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shared exact-ok response reader', () => {
  it('uses max-plus-one BYOB reads and cancels an oversized single-chunk source', async () => {
    const activity = { cancels: 0, defaultReads: 0, largestByobRequest: 0 }
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        const request = controller.byobRequest
        if (!request?.view) {
          activity.defaultReads += 1
          controller.enqueue(new Uint8Array(1_000_000))
          return
        }

        activity.largestByobRequest = Math.max(activity.largestByobRequest, request.view.byteLength)
        new Uint8Array(request.view.buffer, request.view.byteOffset, request.view.byteLength).fill(0x20)
        request.respond(request.view.byteLength)
      },
      cancel() {
        activity.cancels += 1
      },
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await expect(readExactOkJsonResponse(response)).resolves.toEqual({ status: 'invalid-envelope' })
    expect(activity).toEqual({ cancels: 1, defaultReads: 0, largestByobRequest: 129 })
  })

  it('times out and cancels a stalled response body', async () => {
    vi.useFakeTimers()
    let streamController: ReadableByteStreamController | undefined
    let cancelled = false
    const stream = byteStream({
      type: 'bytes',
      start(controller) {
        streamController = controller
      },
      pull() {},
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const validation = readExactOkJsonResponse(response, { timeoutMs: 50 })
    const outcome = Promise.race([
      validation,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])

    await vi.advanceTimersByTimeAsync(75)
    const result = await outcome
    if (result === 'stalled') streamController?.error(new Error('test cleanup'))

    expect(result).toEqual({ status: 'read-error' })
    expect(cancelled).toBe(true)
    vi.useRealTimers()
  })

  it('honors an external abort signal and cancels a stalled response body', async () => {
    let streamController: ReadableByteStreamController | undefined
    let cancelled = false
    const stream = byteStream({
      type: 'bytes',
      start(controller) {
        streamController = controller
      },
      pull() {},
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const abortController = new AbortController()

    const validation = readExactOkJsonResponse(response, {
      signal: abortController.signal,
      timeoutMs: 1_000,
    })
    abortController.abort()
    const result = await Promise.race([
      validation,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 50)),
    ])
    if (result === 'stalled') streamController?.error(new Error('test cleanup'))

    expect(result).toEqual({ status: 'read-error' })
    expect(cancelled).toBe(true)
  })

  it('fails closed for a response stream error', async () => {
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        controller.error(new Error('read failed'))
      },
    })
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await expect(readExactOkJsonResponse(response)).resolves.toEqual({ status: 'read-error' })
  })

  it('fails closed for invalid UTF-8 bytes', async () => {
    const response = new Response(new Uint8Array([0xc3, 0x28]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await expect(readExactOkJsonResponse(response)).resolves.toEqual({ status: 'invalid-envelope' })
  })
})

describe('waitlist client response boundary', () => {
  it('normalizes a valid email while rejecting empty and malformed values', () => {
    expect(normalizeWaitlistEmail('  learner@example.com \n')).toBe('learner@example.com')
    expect(normalizeWaitlistEmail(boundaryEmail(320))).toBe(boundaryEmail(320))
    expect(normalizeWaitlistEmail(boundaryEmail(321))).toBeNull()
    expect(normalizeWaitlistEmail('')).toBeNull()
    expect(normalizeWaitlistEmail('not-an-email')).toBeNull()
    expect(normalizeWaitlistEmail('learner@example')).toBeNull()
    expect(normalizeWaitlistEmail('learner @example.com')).toBeNull()
  })

  it('accepts the exact success response and preserves the request contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{"ok":true}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'success' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(REQUEST),
    })
  })

  it('rejects an overlong email without dispatching a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitWaitlistRequest({ ...REQUEST, email: boundaryEmail(321) })).resolves.toEqual({
      status: 'rejected',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts JSON whitespace around the sole success member', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(' \r\n { \t "ok" : true } \n ')))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'success' })
  })

  it.each([
    ['an explicit failure', '{"ok":false}'],
    ['a missing flag', '{}'],
    ['a string success flag', '{"ok":"true"}'],
    ['a numeric success flag', '{"ok":1}'],
    ['an extra field', '{"ok":true,"error":"unexpected"}'],
    ['null', 'null'],
    ['an array', '[{"ok":true}]'],
    ['malformed JSON', '<html>not json</html>'],
    ['an empty body', ''],
  ])('fails closed for HTTP success carrying %s', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it.each([
    ['last duplicate true', '{"ok":false,"ok":true}'],
    ['last duplicate false', '{"ok":true,"ok":false}'],
  ])('rejects %s instead of trusting JSON key collapse', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it('rejects a UTF-8 BOM before an otherwise exact success envelope', async () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"ok":true}')])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it('rejects an exact body served with a non-JSON media type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'text/plain' } }),
      ),
    )

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it('rejects an oversized success envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(`${' '.repeat(1_024)}{"ok":true}`)))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it('rejects a non-success HTTP status even with an exact success body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('{"ok":true}', 502)))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
  })

  it.each([
    ['wrong media type', 'sensitive upstream detail', 'text/plain'],
    ['duplicate keys', '{"error":"first","error":"last"}', 'application/json'],
    ['extra fields', '{"error":"invalid","trace":"private"}', 'application/json'],
    ['oversized body', 'x'.repeat(200_000), 'application/json'],
    ['sensitive server text', '{"error":"DATABASE_URL=do-not-render"}', 'application/json'],
    ['empty body', '', 'application/json'],
    ['overlong error', JSON.stringify({ error: 'x'.repeat(10_000) }), 'application/json'],
  ])('does not read or expose a non-success response carrying %s', async (_label, body, contentType) => {
    const { activity, response } = trackedResponse(body, { contentType })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
    expect(activity).toEqual({ cancels: 1, pulls: 0 })
  })

  it('fails closed when cancellation of a non-success response body errors', async () => {
    let pulls = 0
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        pulls += 1
        controller.error(new Error('must not read'))
      },
      cancel() {
        throw new Error('cancel failed')
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, { status: 500, headers: { 'content-type': 'application/json' } }),
      ),
    )

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'rejected' })
    expect(pulls).toBe(0)
  })

  it('returns a distinct network failure without throwing into the form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'network-error' })
  })

  it('classifies a resolved-response body stream failure as a network failure', async () => {
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        controller.error(new Error('read failed'))
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )

    await expect(submitWaitlistRequest(REQUEST)).resolves.toEqual({ status: 'network-error' })
  })
})

describe('waitlist form consumer wiring', () => {
  it('delegates the request and response decision to the validated helper', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/WaitlistForm.tsx'), 'utf8')

    expect(source).toMatch(/import \{[^}]*submitWaitlistRequest[^}]*\} from '@\/lib\/waitlist-client'/)
    expect(source).toContain('await submitWaitlistRequest({')
    expect(source).not.toContain("fetch('/api/leads'")
    expect(source).not.toContain('response.json()')
    expect(source).not.toContain('result.error')
  })
})
