import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestLessonAttempt } from '@/lib/course/attempt-client'

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001'

function validAttempt() {
  return {
    ok: true,
    attemptId: ATTEMPT_ID,
    expiresAt: '2099-08-09T12:00:00.000Z',
    questions: [
      {
        kind: 'mcq',
        id: 'question-1',
        prompt: 'Which option is correct?',
        choices: { A: 'First', B: 'Second' },
        multiple: false,
      },
    ],
    simulations: [
      {
        kind: 'simulation',
        id: 'simulation-1',
        challenge: {
          id: 'challenge-1',
          title: 'Configure the interface',
          brief: 'Use the assigned network settings.',
          surface: 'network-interface',
          initial: { addressMode: 'dhcp', ipv4: '', applied: false } as Record<string, string | boolean>,
          requiredFields: { dhcp: [] as string[], static: ['ipv4'] as string[] },
          requirements: [{ id: 'requirement-1', label: 'The address remains stable' }],
        },
      },
    ],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function rawJsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubResponse(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('attempt client response boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the exact request and returns a deep, exact public projection', async () => {
    const body = validAttempt()
    const fetchMock = stubResponse(jsonResponse(body))

    const result = await requestLessonAttempt('course slug', 'capstone')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'course slug', nodeId: 'capstone' }),
    })
    expect(result).toEqual({
      status: 'ready',
      id: ATTEMPT_ID,
      questions: body.questions,
      simulations: body.simulations,
    })
    if (result.status !== 'ready') throw new Error('expected a ready attempt')
    expect(Object.keys(result).sort()).toEqual(['id', 'questions', 'simulations', 'status'])
    expect(Object.keys(result.questions[0]).sort()).toEqual(['choices', 'id', 'kind', 'multiple', 'prompt'])
    expect(Object.keys(result.simulations[0].challenge).sort()).toEqual([
      'brief',
      'id',
      'initial',
      'requiredFields',
      'requirements',
      'surface',
      'title',
    ])
  })

  it.each([
    ['false ok', { ...validAttempt(), ok: false }],
    ['missing ok', Object.fromEntries(Object.entries(validAttempt()).filter(([key]) => key !== 'ok'))],
    ['extra top-level key', { ...validAttempt(), unexpected: true }],
    ['missing questions', Object.fromEntries(Object.entries(validAttempt()).filter(([key]) => key !== 'questions'))],
    ['missing simulations', Object.fromEntries(Object.entries(validAttempt()).filter(([key]) => key !== 'simulations'))],
    ['non-array questions', { ...validAttempt(), questions: {} }],
    ['non-array simulations', { ...validAttempt(), simulations: {} }],
    ['empty task set', { ...validAttempt(), questions: [], simulations: [] }],
    ['non-UUID attempt id', { ...validAttempt(), attemptId: 'attempt-1' }],
    ['non-v4 UUID attempt id', { ...validAttempt(), attemptId: '00000000-0000-1000-8000-000000000001' }],
    ['invalid expiry', { ...validAttempt(), expiresAt: 'tomorrow' }],
    ['wrong question kind', { ...validAttempt(), questions: [{ ...validAttempt().questions[0], kind: 'text' }] }],
    ['answer field on question', { ...validAttempt(), questions: [{ ...validAttempt().questions[0], correct: ['A'] }] }],
    ['invalid choice value', { ...validAttempt(), questions: [{ ...validAttempt().questions[0], choices: { A: 'First', B: 2 } }] }],
    ['too few choices', { ...validAttempt(), questions: [{ ...validAttempt().questions[0], choices: { A: 'First' } }] }],
    ['wrong simulation kind', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], kind: 'mcq' }] }],
    ['answer field on challenge', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], challenge: { ...validAttempt().simulations[0].challenge, hints: ['secret'] } }] }],
    ['invalid initial state', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], challenge: { ...validAttempt().simulations[0].challenge, initial: { values: [] } } }] }],
    ['incomplete required fields', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], challenge: { ...validAttempt().simulations[0].challenge, requiredFields: { dhcp: [] } } }] }],
    ['grading field on requirement', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], challenge: { ...validAttempt().simulations[0].challenge, requirements: [{ id: 'requirement-1', label: 'Stable', operator: 'equals' }] } }] }],
    ['duplicate question ids', { ...validAttempt(), questions: [validAttempt().questions[0], { ...validAttempt().questions[0] }] }],
    ['duplicate ids across task kinds', { ...validAttempt(), simulations: [{ ...validAttempt().simulations[0], id: 'question-1' }] }],
  ])('fails closed for %s', async (_label, body) => {
    stubResponse(jsonResponse(body))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it('accepts required network-interface fields only when each field is present and supported', async () => {
    const body = validAttempt()
    body.simulations[0].challenge.initial = {
      addressMode: 'dhcp',
      ipv4: '',
      subnet: '',
      gateway: '',
      dns1: '',
      applied: false,
    }
    body.simulations[0].challenge.requiredFields = {
      dhcp: ['ipv4', 'dns1'],
      static: ['subnet', 'gateway'],
    }
    stubResponse(jsonResponse(body))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toMatchObject({
      status: 'ready',
      simulations: [{
        challenge: {
          initial: body.simulations[0].challenge.initial,
          requiredFields: body.simulations[0].challenge.requiredFields,
        },
      }],
    })
  })

  it.each([
    [
      'a supported required field missing from initial state',
      { initial: { addressMode: 'dhcp', applied: false }, requiredFields: { dhcp: [], static: ['ipv4'] } },
    ],
    [
      'a present required field unsupported by the surface',
      { initial: { addressMode: 'dhcp', hostname: '', applied: false }, requiredFields: { dhcp: [], static: ['hostname'] } },
    ],
  ])('rejects %s', async (_label, challengeFields) => {
    const body = validAttempt()
    body.simulations[0].challenge = {
      ...body.simulations[0].challenge,
      ...challengeFields,
    }
    stubResponse(jsonResponse(body))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it.each([
    ['a leap-year date without comparing the client clock', '2000-02-29T23:59:59Z'],
    ['a PostgreSQL-style positive offset', '2099-08-09T12:00:00.123456+05:30'],
    ['a negative offset', '2099-08-09T12:00:00-04:00'],
  ])('accepts %s', async (_label, expiresAt) => {
    stubResponse(jsonResponse({ ...validAttempt(), expiresAt }))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toMatchObject({
      status: 'ready',
      id: ATTEMPT_ID,
    })
  })

  it.each([
    ['month zero', '2099-00-01T12:00:00Z'],
    ['month thirteen', '2099-13-01T12:00:00Z'],
    ['day zero', '2099-01-00T12:00:00Z'],
    ['day past month end', '2099-01-32T12:00:00Z'],
    ['February 29 in a non-leap year', '2099-02-29T12:00:00Z'],
    ['February 29 in a non-leap century year', '2100-02-29T12:00:00Z'],
    ['April 31', '2099-04-31T12:00:00Z'],
    ['hour 24', '2099-08-09T24:00:00Z'],
    ['minute 60', '2099-08-09T23:60:00Z'],
    ['second 60', '2099-08-09T23:59:60Z'],
    ['offset hour 24', '2099-08-09T12:00:00+24:00'],
    ['offset minute 60', '2099-08-09T12:00:00+05:60'],
  ])('rejects an expiry with %s', async (_label, expiresAt) => {
    stubResponse(jsonResponse({ ...validAttempt(), expiresAt }))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it.each([
    [
      'top-level duplicate ending true',
      JSON.stringify(validAttempt()).replace('{"ok":true', '{"ok":false,"ok":true'),
    ],
    [
      'top-level duplicate ending false',
      JSON.stringify(validAttempt()).replace('{"ok":true', '{"ok":true,"ok":false'),
    ],
    [
      'escaped duplicate key',
      JSON.stringify(validAttempt()).replace('{"ok":true', '{"ok":true,"\\u006f\\u006b":true'),
    ],
    [
      'nested choice duplicate',
      JSON.stringify(validAttempt()).replace('"choices":{"A":"First","B":"Second"}', '"choices":{"A":"First","A":"Changed","B":"Second"}'),
    ],
  ])('rejects duplicate wire keys: %s', async (_label, raw) => {
    stubResponse(rawJsonResponse(raw))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it.each([
    ['malformed JSON', '{"ok":'],
    ['JSON with trailing bytes', `${JSON.stringify(validAttempt())} false`],
    ['UTF-8 BOM', `\uFEFF${JSON.stringify(validAttempt())}`],
  ])('rejects %s', async (_label, raw) => {
    stubResponse(rawJsonResponse(raw))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it('accepts JSON whitespace around an otherwise exact response', async () => {
    stubResponse(rawJsonResponse(` \n\t${JSON.stringify(validAttempt())}\r `))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toMatchObject({
      status: 'ready',
      id: ATTEMPT_ID,
    })
  })

  it('rejects a non-JSON success response', async () => {
    stubResponse(new Response(JSON.stringify(validAttempt()), { status: 200, headers: { 'content-type': 'text/plain' } }))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it('rejects invalid UTF-8', async () => {
    stubResponse(new Response(new Uint8Array([0xff]), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it('stops reading an oversized success body', async () => {
    stubResponse(rawJsonResponse(`{"padding":"${'x'.repeat(256 * 1024)}"}`))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it.each([401, 403])('maps HTTP %i to stable access-lost without trusting a body', async (status) => {
    stubResponse(new Response('not-json', { status }))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'access-lost',
    })
  })

  it('maps a valid 429 receipt to quota with a bounded integer retry', async () => {
    stubResponse(jsonResponse({ ok: false, error: 'quota', retryAfterSeconds: 75 }, 429))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'quota',
      retryAfterSeconds: 75,
    })
  })

  it.each([
    ['negative', { ok: false, error: 'quota', retryAfterSeconds: -1 }],
    ['fractional', { ok: false, error: 'quota', retryAfterSeconds: 1.5 }],
    ['string', { ok: false, error: 'quota', retryAfterSeconds: '75' }],
    ['outside the server window', { ok: false, error: 'quota', retryAfterSeconds: 1_801 }],
    ['extra response key', { ok: false, error: 'quota', retryAfterSeconds: 75, extra: true }],
  ])('keeps quota status but drops an invalid retry value: %s', async (_label, body) => {
    stubResponse(jsonResponse(body, 429))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'quota',
    })
  })

  it('does not let duplicate retry keys choose the displayed wait', async () => {
    stubResponse(rawJsonResponse('{"ok":false,"error":"quota","retryAfterSeconds":10,"retryAfterSeconds":600}', 429))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'quota',
    })
  })

  it.each([400, 404, 409, 500])('maps HTTP %i to stable error', async (status) => {
    stubResponse(jsonResponse({ ok: false, error: 'failed' }, status))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })

  it('maps a network failure to stable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(requestLessonAttempt('course', 'capstone')).resolves.toEqual({
      status: 'failed',
      reason: 'error',
    })
  })
})

describe('attempt hook consumer wiring', () => {
  it('uses the validated helper instead of casting an inline fetch response', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'components', 'course', 'use-lesson-attempt.ts'),
      'utf8',
    )

    expect(source).toContain("from '@/lib/course/attempt-client'")
    expect(source).toContain('requestLessonAttempt(slug, nodeId)')
    expect(source).not.toContain("fetch('/api/attempts'")
    expect(source).not.toContain('as AttemptResponse')
  })
})
