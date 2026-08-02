import { describe, expect, it } from 'vitest'
import { readBoundedBody } from '@/lib/http/bounded-body'

// เพดานขนาด body ต้อง "หยุดอ่าน" ไม่ใช่ "อ่านจบแล้วค่อยบ่น"
//
// RIL cross-model รอบ 3 ชี้ว่า `request.arrayBuffer()` แล้ววัดทีหลัง buffer ทั้ง body
// จน EOF ก่อน แปลว่าจ่ายค่า memory ครบแล้วก่อนจะได้ปฏิเสธ — บน Workers ที่มี memory
// limit ต่อ isolate นี่คือช่องที่ผู้ใช้ล็อกอินคนเดียวทำให้บริการล่มได้

const MAX = 1024

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

    await expect(readBoundedBody(req, MAX)).rejects.toThrow(stream.boom.message)
    expect(req.body?.locked ?? false, 'error path ก็ต้องไม่ถือ lock ค้าง').toBe(false)
  })

  it('body ว่างไม่พัง', async () => {
    expect(await readBoundedBody(request(null), MAX)).toEqual({ ok: true, text: '' })
  })
})
