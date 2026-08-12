import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  requestPracticeSimulation,
  type PracticeSimulationInput,
} from '@/lib/simulation/practice-client'

const REQUIREMENTS = [
  { id: 'address', label: 'The address remains stable' },
  { id: 'applied', label: 'The settings are applied' },
]

const INPUT: PracticeSimulationInput = {
  slug: 'course slug',
  nodeId: 'lesson/1',
  challengeId: 'network-setup',
  state: { addressMode: 'static', ipv4: '192.168.10.50', applied: true },
  wantHint: false,
  requirements: REQUIREMENTS,
  responseVariant: 'regular',
}

function inputFor(responseVariant: 'regular' | 'capstone'): PracticeSimulationInput {
  return { ...INPUT, responseVariant }
}

function regularVerdict(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    passed: false,
    results: [
      { id: 'address', label: 'The address remains stable', met: true },
      { id: 'applied', label: 'The settings are applied', met: false },
    ],
    metCount: 1,
    total: 2,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function rawResponse(body: string, status = 200, contentType = 'application/json'): Response {
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('practice simulation client response boundary', () => {
  it('sends the exact request and returns a deep regular-verdict projection', async () => {
    const body = regularVerdict()
    const response = jsonResponse(body)
    const jsonSpy = vi.spyOn(response, 'json').mockResolvedValue(body)
    const fetchMock = stubResponse(response)

    const result = await requestPracticeSimulation(INPUT)

    expect(fetchMock).toHaveBeenCalledWith('/api/practice/simulation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        slug: INPUT.slug,
        nodeId: INPUT.nodeId,
        challengeId: INPUT.challengeId,
        state: INPUT.state,
        wantHint: INPUT.wantHint,
      }),
    })
    expect(result).toEqual({
      status: 'ready',
      verdict: {
        passed: false,
        results: body.results,
        metCount: 1,
        total: 2,
      },
    })
    if (result.status !== 'ready') throw new Error('expected a ready verdict')
    expect(result.verdict).not.toBe(body)
    expect(result.verdict.results).not.toBe(body.results)
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['passed regular verdict with a debrief', regularVerdict({
      passed: true,
      results: REQUIREMENTS.map((requirement) => ({ ...requirement, met: true })),
      metCount: 2,
      debrief: 'A stable address makes the service findable.',
    }), inputFor('regular')],
    ['requested hints on a failed regular verdict', regularVerdict({ hints: ['Check the address mode.'] }), {
      ...inputFor('regular'),
      wantHint: true,
    }],
    ['passed-only capstone verdict', { ok: true, passed: false }, inputFor('capstone')],
  ])('accepts an exact %s', async (_label, body, input) => {
    stubResponse(jsonResponse(body))

    await expect(requestPracticeSimulation(input as PracticeSimulationInput)).resolves.toMatchObject({
      status: 'ready',
      verdict: { passed: body.passed },
    })
  })

  it.each([
    ['passed-only capstone response for a regular node', inputFor('regular'), { ok: true, passed: false }],
    ['per-requirement regular response for a capstone node', inputFor('capstone'), regularVerdict()],
  ])('rejects a cross-variant %s', async (_label, input, body) => {
    stubResponse(jsonResponse(body))

    await expect(requestPracticeSimulation(input)).resolves.toEqual({ status: 'failed' })
  })

  it.each([
    ['truthy string ok', { ...regularVerdict(), ok: 'true' }],
    ['string passed flag', { ...regularVerdict(), passed: 'false' }],
    ['extra top-level field', { ...regularVerdict(), trace: 'private' }],
    ['partial regular shape', { ok: true, passed: false, metCount: 0, total: 2 }],
    ['non-array results', { ...regularVerdict(), results: {} }],
    ['empty results', { ...regularVerdict(), results: [], metCount: 0, total: 0 }],
    ['result with an extra field', {
      ...regularVerdict(),
      results: [{ ...regularVerdict().results[0], answer: 'secret' }, regularVerdict().results[1]],
    }],
    ['non-boolean result', {
      ...regularVerdict(),
      results: [{ ...regularVerdict().results[0], met: 1 }, regularVerdict().results[1]],
    }],
    ['duplicate result IDs', {
      ...regularVerdict(),
      results: [regularVerdict().results[0], { ...regularVerdict().results[1], id: 'address' }],
    }],
    ['foreign result ID', {
      ...regularVerdict(),
      results: [regularVerdict().results[0], { ...regularVerdict().results[1], id: 'foreign' }],
    }],
    ['changed result label', {
      ...regularVerdict(),
      results: [{ ...regularVerdict().results[0], label: 'Changed' }, regularVerdict().results[1]],
    }],
    ['inconsistent met count', { ...regularVerdict(), metCount: 2 }],
    ['inconsistent total', { ...regularVerdict(), total: 3 }],
    ['inconsistent passed flag', { ...regularVerdict(), passed: true }],
    ['hints that were not requested', { ...regularVerdict(), hints: ['Secret hint'] }],
    ['hints on a passed verdict', {
      ...regularVerdict(),
      passed: true,
      results: REQUIREMENTS.map((requirement) => ({ ...requirement, met: true })),
      metCount: 2,
      hints: ['Unreachable'],
    }],
    ['debrief on a failed verdict', { ...regularVerdict(), debrief: 'Too early' }],
    ['empty hint', { ...regularVerdict(), hints: [''] }],
    ['empty debrief', {
      ...regularVerdict(),
      passed: true,
      results: REQUIREMENTS.map((requirement) => ({ ...requirement, met: true })),
      metCount: 2,
      debrief: '',
    }],
  ])('fails closed for %s', async (_label, body) => {
    stubResponse(jsonResponse(body))

    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
  })

  it.each([
    ['top-level duplicate ending true', JSON.stringify(regularVerdict()).replace('{"ok":true', '{"ok":false,"ok":true')],
    ['top-level duplicate ending false', JSON.stringify(regularVerdict()).replace('{"ok":true', '{"ok":true,"ok":false')],
    ['escaped duplicate key', JSON.stringify(regularVerdict()).replace('{"ok":true', '{"ok":true,"\\u006f\\u006b":true')],
    ['nested duplicate key', JSON.stringify(regularVerdict()).replace('"met":true', '"met":false,"met":true')],
  ])('rejects duplicate wire keys: %s', async (_label, body) => {
    stubResponse(rawResponse(body))

    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
  })

  it.each([
    ['malformed JSON', '{"ok":'],
    ['trailing JSON value', `${JSON.stringify(regularVerdict())} false`],
    ['BOM', `\uFEFF${JSON.stringify(regularVerdict())}`],
    ['null', 'null'],
    ['array', '[]'],
  ])('rejects %s', async (_label, body) => {
    stubResponse(rawResponse(body))

    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
  })

  it('rejects invalid UTF-8 and a wrong media type', async () => {
    stubResponse(new Response(new Uint8Array([0xff]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })

    stubResponse(rawResponse(JSON.stringify(regularVerdict()), 200, 'text/plain'))
    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
  })

  it('uses a bounded BYOB read and cancels an oversized single-chunk source', async () => {
    const activity = { cancels: 0, defaultReads: 0, largestByobRequest: 0 }
    let sentDefaultChunk = false
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        const request = controller.byobRequest
        if (!request?.view) {
          activity.defaultReads += 1
          if (sentDefaultChunk) {
            controller.close()
            return
          }
          sentDefaultChunk = true
          controller.enqueue(new Uint8Array(1_000_000))
          controller.close()
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

    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
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

    const request = requestPracticeSimulation(INPUT, { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)
    const result = await outcome
    if (result === 'stalled') streamController?.error(new Error('test cleanup'))

    expect(result).toEqual({ status: 'failed' })
    expect(cancelled).toBe(true)
  })

  it('starts the deadline before fetch and aborts an unresolved fetch', async () => {
    vi.useFakeTimers()
    let observedSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        observedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined
        observedSignal?.addEventListener('abort', () => reject(observedSignal?.reason), { once: true })
      })
    ))

    const request = requestPracticeSimulation(inputFor('regular'), { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)

    expect(await outcome).toEqual({ status: 'failed' })
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

    const request = requestPracticeSimulation(inputFor('regular'), { responseTimeoutMs: 50 })
    const outcome = Promise.race([
      request,
      new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 75)),
    ])
    await vi.advanceTimersByTimeAsync(75)

    expect(await outcome).toEqual({ status: 'failed' })
    expect(cancelled).toBe(true)
  })

  it('does not read a non-success body and maps network failure to the stable failure state', async () => {
    const activity = { cancels: 0, pulls: 0 }
    const stream = byteStream({
      type: 'bytes',
      pull(controller) {
        activity.pulls += 1
        controller.enqueue(new TextEncoder().encode('{"error":"private"}'))
        controller.close()
      },
      cancel() {
        activity.cancels += 1
      },
    })
    stubResponse(new Response(stream, { status: 500, headers: { 'content-type': 'application/json' } }))

    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
    expect(activity).toEqual({ cancels: 1, pulls: 0 })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(requestPracticeSimulation(INPUT)).resolves.toEqual({ status: 'failed' })
  })
})

describe('practice simulation consumer wiring', () => {
  it('delegates request and response validation without retaining an inline cast', () => {
    const simulationSource = readFileSync(
      join(process.cwd(), 'src/components/course/blocks/SimulationBlock.tsx'),
      'utf8',
    )
    const lessonBodySource = readFileSync(
      join(process.cwd(), 'src/components/course/LessonBody.tsx'),
      'utf8',
    )
    const lessonViewSource = readFileSync(
      join(process.cwd(), 'src/components/course/LessonView.tsx'),
      'utf8',
    )

    expect(lessonViewSource).toContain("responseVariant={isCapstone ? 'capstone' : 'regular'}")
    expect(lessonBodySource).toContain('responseVariant={responseVariant}')
    expect(simulationSource).toContain("from '@/lib/simulation/practice-client'")
    expect(simulationSource).toContain('requestPracticeSimulation({')
    expect(simulationSource).toContain('responseVariant,')
    expect(simulationSource).not.toContain("fetch('/api/practice/simulation'")
    expect(simulationSource).not.toContain('res.json()')
    expect(simulationSource).not.toContain('interface PracticeVerdict')
  })
})
