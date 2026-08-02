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

/** stream ที่ปล่อย chunk ไปเรื่อยๆ ไม่มีวันจบ — ถ้าโค้ดไม่ตัดสาย เทสจะค้างจน timeout */
function endlessStream(chunkBytes = 256): { body: ReadableStream<Uint8Array>; emitted: () => number } {
  let emitted = 0
  return {
    emitted: () => emitted,
    body: new ReadableStream({
      pull(controller) {
        emitted += chunkBytes
        controller.enqueue(new Uint8Array(chunkBytes).fill(120))
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
  })

  it('body ว่างไม่พัง', async () => {
    expect(await readBoundedBody(request(null), MAX)).toEqual({ ok: true, text: '' })
  })
})
