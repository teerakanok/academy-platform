import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchProgress,
  projectProgressRecord,
  pushProgress,
  reconcileCourseReset,
  resetCourseProgress,
} from '@/lib/course/progress-client'

function validRecord(slug = 'course') {
  return {
    version: 'v1' as const,
    slug,
    completed: [] as string[],
    skipped: [] as string[],
    testedOut: [] as string[],
    inProgress: [] as string[],
    checkpointResults: {} as Record<string, Record<string, boolean>>,
    videoCueResults: {} as Record<string, Record<string, boolean>>,
    simulationEvidence: {} as Record<string, Record<string, unknown>>,
    lastNodeId: null as string | null,
    updatedAt: 0,
  }
}

describe('progress response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts a valid record for the requested course', async () => {
    const record = validRecord()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, record }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    )

    await expect(fetchProgress('course')).resolves.toEqual({ ok: true, record })
  })

  it('fails closed when a success response contains a malformed record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, record: {} }), { status: 200 })),
    )

    await expect(fetchProgress('course')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('fails closed when a success response contains another course record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, record: validRecord('other-course') }), { status: 200 }),
      ),
    )

    await expect(fetchProgress('course')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('rejects extra record fields instead of widening the response contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, record: { ...validRecord(), unexpected: true } }), { status: 200 }),
      ),
    )

    await expect(fetchProgress('course')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it.each([
    ['status arrays', { completed: ['lesson', 42] }],
    ['checkpoint result maps', { checkpointResults: { lesson: [] } }],
    ['video cue result maps', { videoCueResults: { lesson: { cue: 'yes' } } }],
    ['simulation evidence maps', { simulationEvidence: { lesson: [] } }],
  ])('rejects invalid nested %s', async (_label, override) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, record: { ...validRecord(), ...override } }), { status: 200 }),
      ),
    )

    await expect(fetchProgress('course')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('returns a defensive projection instead of the untrusted response object', async () => {
    const record = {
      ...validRecord(),
      completed: ['lesson'],
      checkpointResults: { lesson: { question: true } },
      simulationEvidence: { lesson: { simulation: { passed: true } } },
    }
    const projected = projectProgressRecord(record, 'course')
    expect(projected).not.toBe(record)
    expect(projected?.completed).not.toBe(record.completed)
    expect(projected?.checkpointResults.lesson).not.toBe(record.checkpointResults.lesson)
    expect(projected?.simulationEvidence.lesson).not.toBe(record.simulationEvidence.lesson)
    expect(projected?.simulationEvidence.lesson.simulation).not.toBe(record.simulationEvidence.lesson.simulation)
  })

  it.each([
    ['duplicate JSON keys', '{"ok":false,"ok":true,"record":{}}', 'application/json'],
    ['wrong media type', JSON.stringify({ ok: true, record: validRecord() }), 'text/plain'],
    ['oversized body', ' '.repeat(262_145), 'application/json'],
  ])('fails closed on %s before accepting progress', async (_label, body, contentType) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      headers: { 'content-type': contentType },
    })))

    await expect(fetchProgress('course')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('progress client attempt recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('simulation-incomplete ไม่ขอ attempt ใหม่ เพราะ server ยังไม่ได้ consume ใบเดิม', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: 'ทำโจทย์จำลองให้ครบและกดยืนยันการตั้งค่าก่อนตรวจ',
            code: 'simulation-incomplete',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const result = await pushProgress({
      action: 'checkpoint',
      slug: 'course',
      nodeId: 'capstone',
      mode: 'learn',
      answers: {},
      simulations: {},
      attemptId: '00000000-0000-4000-8000-000000000001',
    })

    expect(result.failure?.needsNewAttempt).toBe(false)
    expect(result.failure?.message).toContain('กดยืนยัน')
  })

  it('rejects malformed truthy outcomes and never exposes the server error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ok: true,
        passed: 'yes',
        unexpected: 'credential=TOP_SECRET',
      }), { headers: { 'content-type': 'application/json' } })),
    )

    const malformed = await pushProgress({
      action: 'checkpoint',
      slug: 'course',
      nodeId: 'capstone',
      mode: 'test-out',
      answers: {},
    })
    expect(malformed.outcome).toBeUndefined()
    expect(malformed.failure?.message).toBe('บันทึกความคืบหน้าไม่สำเร็จ')
    expect(JSON.stringify(malformed)).not.toContain('TOP_SECRET')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ok: false,
        error: 'credential=TOP_SECRET',
      }), { status: 500, headers: { 'content-type': 'application/json' } })),
    )
    const failed = await pushProgress({ action: 'open', slug: 'course', nodeId: 'lesson' })
    expect(failed.failure?.message).toBe('บันทึกความคืบหน้าไม่สำเร็จ')
    expect(JSON.stringify(failed)).not.toContain('TOP_SECRET')
  })

  it('accepts only the exact success shape for each progress action', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(
        '{"ok":true,"correct":false,"explanation":"Review the cue."}',
        { headers: { 'content-type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        '{"ok":true,"passed":false}',
        { headers: { 'content-type': 'application/json' } },
      )))

    await expect(pushProgress({ action: 'open', slug: 'course', nodeId: 'lesson' }))
      .resolves.toEqual({ failure: null, outcome: undefined, cue: undefined })
    await expect(pushProgress({
      action: 'video-cue',
      slug: 'course',
      nodeId: 'lesson',
      cueId: 'cue',
      answer: [],
    })).resolves.toEqual({
      failure: null,
      outcome: undefined,
      cue: { correct: false, explanation: 'Review the cue.' },
    })
    await expect(pushProgress({
      action: 'checkpoint',
      slug: 'course',
      nodeId: 'capstone',
      mode: 'test-out',
      answers: {},
    })).resolves.toEqual({
      failure: null,
      outcome: { passed: false },
      cue: undefined,
    })
  })
})

describe('course reset recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const operationId = '00000000-0000-4000-8000-000000000010'

  it.each([401, 403])('POST %s cancels the unread body before returning access-lost', async (status) => {
    let cancelCount = 0
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCount += 1
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })))

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'access-lost',
    })
    expect(cancelCount).toBe(1)
  })

  it('POST ล้มเหลวและไม่มี receipt → คงผลเป็น unknown ไม่เดาจาก record', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, completed: false }), {
            status: 200,
          }),
        ),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('response หายหลัง commit แล้ว receipt ยืนยัน → reconcile เป็น success', async () => {
    const cleared = validRecord()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('network lost'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, completed: true, record: cleared }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: true,
      record: cleared,
      reconciled: true,
    })
  })

  it('POST 200 ก็อ่าน receipt/current record ก่อนคืน success ไม่สร้าง empty record เอง', async () => {
    const current = { ...validRecord(), inProgress: ['lesson-new'] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, completed: true, record: current }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: true,
      record: current,
      reconciled: false,
    })
  })

  it('POST 200 แต่โหลด current record ไม่ได้ → แยกว่า reset สำเร็จแต่ view ยังยืนยันไม่ได้', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
        .mockRejectedValueOnce(new TypeError('offline')),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'completed-unavailable',
    })
  })

  it('POST และการอ่านกลับล้มเหลวทั้งคู่ → บอกว่า unknown โดยไม่สร้าง empty record เอง', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('network lost'))
        .mockRejectedValueOnce(new TypeError('still offline')),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('receipt ยืนยัน reset แต่ record ปัจจุบันมีงานรอบใหม่ → คืน record ปัจจุบันพร้อม success', async () => {
    const current = { ...validRecord(), inProgress: ['lesson-new'] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, completed: true, record: current }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    )

    await expect(reconcileCourseReset('course', operationId)).resolves.toEqual({
      ok: true,
      record: current,
      reconciled: true,
    })
  })

  it('receipt ที่มี record malformed ไม่ยืนยัน reset สำเร็จ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, completed: true, record: {} }), { status: 200 }),
      ),
    )

    await expect(reconcileCourseReset('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('receipt ของคอร์สอื่นไม่ยืนยัน reset สำเร็จ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, completed: true, record: validRecord('other-course') }),
          { status: 200 },
        ),
      ),
    )

    await expect(reconcileCourseReset('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('unknown แล้วตรวจซ้ำเจอ access loss → ยังเป็น unknown ไม่อ้างว่า reset ไม่เกิด', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(reconcileCourseReset('course', operationId)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })
})
