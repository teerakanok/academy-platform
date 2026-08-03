import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushProgress, reconcileCourseReset, resetCourseProgress } from '@/lib/course/progress-client'
import { emptyProgress } from '@/lib/course/progress'

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
})

describe('course reset recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const operationId = '00000000-0000-4000-8000-000000000010'

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
    const cleared = emptyProgress('course')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('network lost'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, completed: true, record: cleared }), { status: 200 }),
        ),
    )

    await expect(resetCourseProgress('course', operationId)).resolves.toEqual({
      ok: true,
      record: cleared,
      reconciled: true,
    })
  })

  it('POST 200 ก็อ่าน receipt/current record ก่อนคืน success ไม่สร้าง empty record เอง', async () => {
    const current = { ...emptyProgress('course'), inProgress: ['lesson-new'] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, completed: true, record: current }), { status: 200 }),
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
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
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
    const current = { ...emptyProgress('course'), inProgress: ['lesson-new'] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, completed: true, record: current }), { status: 200 }),
        ),
    )

    await expect(reconcileCourseReset('course', operationId)).resolves.toEqual({
      ok: true,
      record: current,
      reconciled: true,
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
