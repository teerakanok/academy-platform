import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCourseSkillMap } from '@/lib/course/skill-map-client'

const COVERAGE = [
  { id: 'shell', label: 'Shell skills', value: 50, notStarted: false },
  { id: 'network', label: 'Network skills', value: 0, notStarted: true },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function rawResponse(body: BodyInit, status = 200, contentType = 'application/json'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

function stubResponse(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function byteStream(source: UnderlyingByteSource): ReadableStream<Uint8Array> {
  const ByteReadableStream = ReadableStream as unknown as {
    new (underlyingSource: UnderlyingByteSource): ReadableStream<Uint8Array>
  }
  return new ByteReadableStream(source)
}

function trackedResponse(status: number) {
  const activity = { cancels: 0, pulls: 0 }
  const stream = byteStream({
    type: 'bytes',
    pull(controller) {
      activity.pulls += 1
      controller.enqueue(new TextEncoder().encode('{"error":"private upstream detail"}'))
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
      headers: { 'content-type': 'application/json' },
    }),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('learner skill-map client response boundary', () => {
  it('sends the exact request and returns a deep projection of exact coverage', async () => {
    const body = { ok: true, coverage: COVERAGE }
    const response = jsonResponse(body)
    const jsonSpy = vi.spyOn(response, 'json').mockResolvedValue(body)
    const fetchMock = stubResponse(response)

    const result = await fetchCourseSkillMap('course / 1', 'th')

    expect(fetchMock).toHaveBeenCalledWith('/api/courses/course%20%2F%201/skill-map?lang=th', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
    expect(result).toEqual({ ok: true, coverage: COVERAGE })
    if (!result.ok) throw new Error('expected valid coverage')
    expect(result.coverage).not.toBe(COVERAGE)
    expect(result.coverage[0]).not.toBe(COVERAGE[0])
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('accepts JSON whitespace around the exact response', async () => {
    stubResponse(rawResponse(` \r\n ${JSON.stringify({ ok: true, coverage: COVERAGE })} \t `))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: true,
      coverage: COVERAGE,
    })
  })

  it('accepts a rounded zero value after the learner has started the skill', async () => {
    const coverage = [{ id: 'shell', label: 'Shell skills', value: 0, notStarted: false }]
    stubResponse(jsonResponse({ ok: true, coverage }))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: true,
      coverage,
    })
  })

  it.each([
    ['truthy string ok', { ok: 'true', coverage: COVERAGE }],
    ['extra wrapper key', { ok: true, coverage: COVERAGE, trace: 'private' }],
    ['missing coverage', { ok: true }],
    ['empty coverage', { ok: true, coverage: [] }],
    ['non-array coverage', { ok: true, coverage: {} }],
    ['extra item key', { ok: true, coverage: [{ ...COVERAGE[0], score: 50 }] }],
    ['missing item key', { ok: true, coverage: [{ id: 'shell', label: 'Shell', value: 50 }] }],
    ['empty item ID', { ok: true, coverage: [{ ...COVERAGE[0], id: '' }] }],
    ['empty item label', { ok: true, coverage: [{ ...COVERAGE[0], label: '' }] }],
    ['fractional producer value', { ok: true, coverage: [{ ...COVERAGE[0], value: 50.5 }] }],
    ['out-of-range value', { ok: true, coverage: [{ ...COVERAGE[0], value: 101 }] }],
    ['string value', { ok: true, coverage: [{ ...COVERAGE[0], value: '50' }] }],
    ['non-boolean notStarted', { ok: true, coverage: [{ ...COVERAGE[0], notStarted: 0 }] }],
    ['positive value marked not started', { ok: true, coverage: [{ ...COVERAGE[0], notStarted: true }] }],
    ['duplicate item IDs', { ok: true, coverage: [COVERAGE[0], { ...COVERAGE[1], id: 'shell' }] }],
  ])('fails closed for %s', async (_label, body) => {
    stubResponse(jsonResponse(body))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it.each([
    ['top-level duplicate ending true', '{"ok":false,"ok":true,"coverage":[]}'],
    ['top-level duplicate ending false', `{"ok":true,"ok":false,"coverage":${JSON.stringify(COVERAGE)}}`],
    ['escaped duplicate top-level key', `{"ok":true,"\\u006f\\u006b":true,"coverage":${JSON.stringify(COVERAGE)}}`],
    ['nested duplicate item key', `{"ok":true,"coverage":[{"id":"old","id":"shell","label":"Shell","value":50,"notStarted":false}]}`],
  ])('rejects duplicate wire keys: %s', async (_label, body) => {
    stubResponse(rawResponse(body))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it.each([
    ['malformed JSON', '{"ok":'],
    ['trailing JSON value', `${JSON.stringify({ ok: true, coverage: COVERAGE })} false`],
    ['BOM', `\uFEFF${JSON.stringify({ ok: true, coverage: COVERAGE })}`],
    ['null', 'null'],
    ['array', '[]'],
  ])('rejects %s', async (_label, body) => {
    stubResponse(rawResponse(body))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('rejects invalid UTF-8 and a wrong media type', async () => {
    stubResponse(rawResponse(new Uint8Array([0xc3, 0x28])))
    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })

    stubResponse(rawResponse(JSON.stringify({ ok: true, coverage: COVERAGE }), 200, 'text/plain'))
    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('uses a bounded BYOB read and cancels an oversized single-chunk source', async () => {
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
    stubResponse(new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    expect(activity).toEqual({ cancels: 1, defaultReads: 0, largestByobRequest: 262_145 })
  })

  it('times out and cancels a stalled response stream', async () => {
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
    stubResponse(new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const request = fetchCourseSkillMap('course-1', 'en', { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)
    const result = await outcome
    if (result === 'stalled') streamController?.error(new Error('test cleanup'))

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(cancelled).toBe(true)
  })

  it('starts one deadline before fetch and aborts an unresolved fetch', async () => {
    vi.useFakeTimers()
    let observedSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        observedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined
        observedSignal?.addEventListener('abort', () => reject(observedSignal?.reason), { once: true })
      })
    ))

    const request = fetchCourseSkillMap('course-1', 'en', { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)

    expect(await outcome).toEqual({ ok: false, reason: 'unavailable' })
    expect(observedSignal?.aborted).toBe(true)
  })

  it('does not reset the deadline after fetch resolves', async () => {
    vi.useFakeTimers()
    let cancelled = false
    const stream = byteStream({
      type: 'bytes',
      pull() {},
      cancel() {
        cancelled = true
      },
    })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(stream, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })), 40)
        const signal = init?.signal
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason)
        }, { once: true })
      })
    ))

    const request = fetchCourseSkillMap('course-1', 'en', { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)

    expect(await outcome).toEqual({ ok: false, reason: 'unavailable' })
    expect(cancelled).toBe(true)
  })

  it('does not read denied or non-success response bodies and preserves stable reasons', async () => {
    const signedOut = trackedResponse(401)
    const accessLost = trackedResponse(403)
    const unavailable = trackedResponse(503)
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(signedOut.response)
        .mockResolvedValueOnce(accessLost.response)
        .mockResolvedValueOnce(unavailable.response),
    )

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({ ok: false, reason: 'signed-out' })
    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({ ok: false, reason: 'access-lost' })
    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({ ok: false, reason: 'unavailable' })
    expect(signedOut.activity).toEqual({ cancels: 1, pulls: 0 })
    expect(accessLost.activity).toEqual({ cancels: 1, pulls: 0 })
    expect(unavailable.activity).toEqual({ cancels: 1, pulls: 0 })
  })

  it('maps network failure to unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(fetchCourseSkillMap('course-1', 'en')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })
})
