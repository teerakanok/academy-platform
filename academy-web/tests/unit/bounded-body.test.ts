import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBoundedBody, readBoundedJson } from '@/lib/http/bounded-body'

// เพดานขนาด body ต้อง "หยุดอ่าน" ไม่ใช่ "อ่านจบแล้วค่อยบ่น"
//
// RIL cross-model รอบ 3 ชี้ว่า `request.arrayBuffer()` แล้ววัดทีหลัง buffer ทั้ง body
// จน EOF ก่อน แปลว่าจ่ายค่า memory ครบแล้วก่อนจะได้ปฏิเสธ — บน Workers ที่มี memory
// limit ต่อ isolate นี่คือช่องที่ผู้ใช้ล็อกอินคนเดียวทำให้บริการล่มได้

const MAX = 1024
const ROUTE_ROOT = join(__dirname, '..', '..', 'src', 'app')

function request(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api', { method: 'POST', body, headers })
}

/**
 * stream ที่ปล่อย chunk ไปเรื่อยๆ ไม่มีวันจบ
 *
 * นับสองอย่างแยกกันโดยตั้งใจ:
 *   `emitted`  — อ่านไปเท่าไร (พิสูจน์ว่าไม่รอ EOF)
 *   `canceled` — underlying source ได้รับสัญญาณยกเลิกไหม (พิสูจน์ว่า *ตัดสายจริง*)
 * ข้อหลังสำคัญกว่าและเทสรุ่นแรกไม่มี — RIL รอบ 4 พิสูจน์ว่าลบ `reader.cancel()` ออก
 * แล้วเทสยังเขียว เพราะดูแต่จำนวน byte ที่อ่าน
 */
function endlessStream(chunkBytes = 256): {
  body: ReadableStream<Uint8Array>
  emitted: () => number
  canceled: () => boolean
} {
  let emitted = 0
  let canceled = false
  return {
    emitted: () => emitted,
    canceled: () => canceled,
    body: new ReadableStream({
      pull(controller) {
        emitted += chunkBytes
        controller.enqueue(new Uint8Array(chunkBytes).fill(120))
      },
      // async และตั้งธงหลังรอ **macrotask** โดยตั้งใจ — ถ้าโค้ดเรียก cancel()
      // โดยไม่ await ธงจะยังไม่ถูกตั้งตอนฟังก์ชันคืนค่า เทสจึงพิสูจน์ "รอจนยกเลิกเสร็จ"
      // ได้จริง · ใช้ `Promise.resolve()` ไม่พอ เพราะ microtask จะเสร็จทันภายใน
      // await หลายชั้นที่ตามมาอยู่ดี แล้วเทสจะเขียวแม้โค้ดไม่ได้รอ (RIL รอบ 5 ชี้)
      async cancel() {
        await new Promise((resolve) => setTimeout(resolve, 0))
        canceled = true
      },
    }),
  }
}

/** stream ที่พังกลางทาง — ใช้พิสูจน์ว่า lock ถูกปล่อยแม้ในเส้นทาง error */
function failingStream(): { body: ReadableStream<Uint8Array>; boom: Error } {
  const boom = new Error('อ่าน body ไม่สำเร็จ')
  let sent = false
  return {
    boom,
    body: new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true
          controller.enqueue(new Uint8Array(8).fill(65))
          return
        }
        controller.error(boom)
      },
    }),
  }
}

function stalledStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull() {
      return new Promise<void>(() => undefined)
    },
  })
}

function hangingCancelStream(firstChunkBytes = 0): {
  body: ReadableStream<Uint8Array>
  cancelStarted: () => boolean
} {
  let cancelStarted = false
  return {
    cancelStarted: () => cancelStarted,
    body: new ReadableStream({
      pull(controller) {
        if (firstChunkBytes > 0) controller.enqueue(new Uint8Array(firstChunkBytes))
        return new Promise<void>(() => undefined)
      },
      cancel() {
        cancelStarted = true
        return new Promise<void>(() => undefined)
      },
    }),
  }
}

function streamRequest(
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  return new Request('https://example.test/api', {
    method: 'POST',
    body,
    headers,
    signal,
    // @ts-expect-error — undici requires duplex for a stream request body
    duplex: 'half',
  })
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  }).sort()
}

function routeName(path: string): string {
  return relative(join(__dirname, '..', '..'), path)
    .replaceAll('\\', '/')
    .replace('src/app/(site)/', 'src/app/')
}

describe('readBoundedBody', () => {
  it('body เล็กกว่าเพดาน อ่านได้ครบถ้วน', async () => {
    const result = await readBoundedBody(request('{"a":1}'), MAX)
    expect(result).toEqual({ ok: true, text: '{"a":1}' })
  })

  it('อ่าน UTF-8 หลาย byte กลับมาถูกต้อง (ไม่ตัดกลางตัวอักษร)', async () => {
    const thai = JSON.stringify({ note: 'สวัสดีชาวโลก' })
    const result = await readBoundedBody(request(thai), MAX)
    expect(result.ok && result.text).toBe(thai)
  })

  it('นับเป็น byte ไม่ใช่จำนวนตัวอักษร — ข้อความไทยที่สั้นแต่หนักถูกปฏิเสธ', async () => {
    // 400 ตัวอักษร (< 1024 ในหน่วย String.length) แต่ 1,200 byte (> เพดาน)
    const thai = 'ก'.repeat(400)
    expect(thai.length).toBeLessThan(MAX)
    expect(new TextEncoder().encode(thai).length).toBeGreaterThan(MAX)
    expect(await readBoundedBody(request(thai), MAX)).toEqual({ ok: false, reason: 'too-large' })
  })

  it('ปฏิเสธเร็วเมื่อ Content-Length ประกาศเกิน โดยไม่ต้องอ่าน body เลย', async () => {
    const stream = endlessStream()
    const req = new Request('https://example.test/api', {
      method: 'POST',
      body: stream.body,
      headers: { 'content-length': String(MAX * 100) },
      // @ts-expect-error — undici ต้องการ duplex เมื่อ body เป็น stream
      duplex: 'half',
    })
    expect(await readBoundedBody(req, MAX)).toEqual({ ok: false, reason: 'too-large' })
    // ReadableStream ดึง chunk แรกไว้ล่วงหน้าเองตั้งแต่ตอนสร้าง (พฤติกรรมของ stream
    // ไม่ใช่ของเรา) — สิ่งที่ต้องพิสูจน์คือเราไม่ได้ "ไล่อ่านต่อ" หลังเห็น header
    expect(stream.emitted(), 'ไม่ควรไล่อ่าน body ต่อเมื่อ header บอกว่าเกินแล้ว').toBeLessThanOrEqual(256)
    // และต้องบอกฝั่งที่ส่งว่าเลิกสนใจแล้ว ไม่ใช่ทิ้งค้างไว้เฉยๆ
    expect(stream.canceled(), 'fast reject ต้อง cancel body ด้วย').toBe(true)
    expect(req.body?.locked ?? false).toBe(false)
  })

  it('🔴 stream ที่ไม่มีวันจบ: ต้องตัดสายเมื่อเกินเพดาน ไม่ใช่รอ EOF', async () => {
    // ถ้าโค้ดใช้ arrayBuffer()/text() เทสนี้จะค้างจนหมดเวลา — นี่คือข้อที่พิสูจน์ว่า
    // guard จำกัด "ทรัพยากรที่ใช้จริง" ไม่ใช่แค่ปฏิเสธหลังจ่ายไปครบแล้ว
    const stream = endlessStream(256)
    const req = new Request('https://example.test/api', {
      method: 'POST',
      body: stream.body,
      // @ts-expect-error — undici ต้องการ duplex เมื่อ body เป็น stream
      duplex: 'half',
    })

    expect(await readBoundedBody(req, MAX)).toEqual({ ok: false, reason: 'too-large' })
    // อ่านไปเกินเพดานแค่ไม่กี่ chunk แล้วหยุด ไม่ใช่ไหลไปเรื่อยๆ
    expect(stream.emitted()).toBeLessThanOrEqual(MAX + 256 * 4)
    // 🔴 ข้อที่พิสูจน์ว่า "ตัดสาย" จริง — ไม่ใช่แค่เลิกอ่านแล้วปล่อยฝั่งส่งค้างไว้
    // (ลบ reader.cancel() ออกแล้วเทสต้องแดงที่บรรทัดนี้)
    expect(stream.canceled(), 'ต้องส่งสัญญาณยกเลิกไปถึง underlying source').toBe(true)
    // และต้องไม่ถือ lock ค้าง — cancel() ไม่ปล่อย lock ให้เองตาม spec
    expect(req.body?.locked ?? false, 'request.body ต้องไม่ถูกล็อกค้าง').toBe(false)
  })

  it('เส้นทางปกติก็ต้องไม่ทิ้ง lock ค้างไว้', async () => {
    const req = request('{"a":1}')
    expect((await readBoundedBody(req, MAX)).ok).toBe(true)
    expect(req.body?.locked ?? false).toBe(false)
  })

  it('body ที่พังกลางทาง: error ส่งต่อ และ lock ต้องถูกปล่อยด้วย', async () => {
    // เส้นทางที่สามที่เทสรุ่นก่อนไม่มี — implementation ที่ปล่อย lock เฉพาะ
    // success/oversize จะยังผ่านทั้งที่ error path ถือ lock ค้าง (RIL รอบ 5 ชี้)
    const stream = failingStream()
    const req = new Request('https://example.test/api', {
      method: 'POST',
      body: stream.body,
      // @ts-expect-error — undici ต้องการ duplex เมื่อ body เป็น stream
      duplex: 'half',
    })

    // เทียบ **ตัว error เดิม** ไม่ใช่แค่ข้อความ — ถ้าเทียบข้อความ การห่อด้วย
    // `new Error(err.message)` ระหว่างทาง (ซึ่งทำ stack trace หายและกลบต้นเหตุ)
    // จะรอดเทสไปได้ (RIL รอบ 6 ยืนยันด้วย mutation)
    await expect(readBoundedBody(req, MAX)).rejects.toBe(stream.boom)
    expect(req.body?.locked ?? false, 'error path ก็ต้องไม่ถือ lock ค้าง').toBe(false)
  })

  it('body ขนาดเท่าเพดานพอดีต้องผ่าน — เพดานคือ "ไม่เกิน" ไม่ใช่ "ต่ำกว่า"', async () => {
    // ไม่มีเคสนี้ mutation `total > maxBytes` → `total >= maxBytes` จะรอด และผู้เรียน
    // ที่ส่ง body ยาวเท่าเพดานพอดีจะถูกปฏิเสธโดยไม่มีใครรู้ (RIL รอบ 6 ชี้)
    const exact = 'x'.repeat(MAX)
    expect(new TextEncoder().encode(exact).length).toBe(MAX)
    const result = await readBoundedBody(request(exact), MAX)
    expect(result.ok && result.text).toBe(exact)
  })

  it('body ว่างไม่พัง', async () => {
    expect(await readBoundedBody(request(null), MAX)).toEqual({ ok: true, text: '' })
  })

  it('stream ที่ไม่ resolve ต้องจบตาม deadline รวม', async () => {
    const startedAt = Date.now()
    const body = stalledStream()
    const outcome = readBoundedBody(streamRequest(body), MAX, { timeoutMs: 20 })
    await expect(outcome).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(body.locked).toBe(false)
  })

  it.each([
    ['declared oversize', true],
    ['stream overflow', false],
  ])('cancel ที่ค้างตอน %s ต้องไม่ block เกิน deadline', async (_name, declaredOversize) => {
    const stream = hangingCancelStream(declaredOversize ? 0 : MAX + 1)
    const headers: Record<string, string> = declaredOversize
      ? { 'content-length': String(MAX * 100) }
      : {}
    const startedAt = Date.now()
    const result = await readBoundedBody(
      streamRequest(stream.body, headers),
      MAX,
      { timeoutMs: 20 },
    )
    expect(result).toEqual({ ok: false, reason: 'too-large' })
    expect(stream.cancelStarted()).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(stream.body.locked).toBe(false)
  })

  it('request signal ที่ abort ก่อนอ่านต้อง propagate เหตุผลเดิม', async () => {
    const controller = new AbortController()
    const reason = new Error('stop before read')
    const req = streamRequest(stalledStream(), {}, controller.signal)
    controller.abort(reason)
    await expect(readBoundedBody(req, MAX, { timeoutMs: 1_000 })).rejects.toBe(reason)
  })

  it('request signal ที่ abort กลาง read ต้อง propagate เหตุผลเดิม', async () => {
    const controller = new AbortController()
    const reason = new Error('stop during read')
    const outcome = readBoundedBody(
      streamRequest(stalledStream(), {}, controller.signal),
      MAX,
      { timeoutMs: 1_000 },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort(reason)
    await expect(outcome).rejects.toBe(reason)
  })

  it('empty chunk ที่ไม่ done ต้องถูกจับทันที ไม่ปล่อยวน microtask', async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(0))
      },
    })
    await expect(readBoundedBody(streamRequest(body), MAX)).rejects.toBeInstanceOf(RangeError)
    expect(pulls).toBeLessThanOrEqual(2)
  })

  it('reject bound ที่ไม่ deterministic และ deadline ที่ขยายเกิน default ไม่ได้', async () => {
    for (const invalidBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(readBoundedBody(request('{}'), invalidBytes)).rejects.toThrow(RangeError)
    }
    await expect(readBoundedBody(request('{}'), MAX, { timeoutMs: 0 }))
      .rejects.toThrow(RangeError)
    await expect(readBoundedBody(request('{}'), MAX, { timeoutMs: 6_000 }))
      .rejects.toThrow(RangeError)
  })

  it('readBoundedJson แปลง read error เป็น read-error', async () => {
    const stream = failingStream()
    await expect(readBoundedJson(streamRequest(stream.body), MAX))
      .resolves.toEqual({ ok: false, reason: 'read-error' })
  })

  it('actual JSON routes ใช้ bounded parser ไม่ใช่ raw request body reader', () => {
    if (!existsSync(ROUTE_ROOT)) throw new Error('Academy route root is missing')
    const routes = routeFiles(ROUTE_ROOT)
    expect(routes).not.toHaveLength(0)
    for (const route of routes) {
      expect(readFileSync(route, 'utf8')).not.toMatch(
        /\brequest\.(?:json|formData|arrayBuffer|text)\s*\(/,
      )
    }
    expect(routes.filter((route) => readFileSync(route, 'utf8').includes('readBoundedJson')).map(routeName))
      .toEqual([
        'src/app/api/admin/courses/[slug]/route.ts',
        'src/app/api/admin/courses/route.ts',
        'src/app/api/attempts/reauthenticate/route.ts',
        'src/app/api/attempts/route.ts',
        'src/app/api/auth/activity/route.ts',
        'src/app/api/auth/otp/route.ts',
        'src/app/api/auth/verify/route.ts',
        'src/app/api/courses/[slug]/certificate/route.ts',
        'src/app/api/leads/route.ts',
        'src/app/api/leads/unsubscribe/route.ts',
        'src/app/api/practice/simulation/route.ts',
        'src/app/api/progress/route.ts',
        'src/app/api/security/csp-report/route.ts',
      ])
  })
})
