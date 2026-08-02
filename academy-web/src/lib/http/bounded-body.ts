// อ่าน request body แบบมีเพดาน — **หยุดอ่านทันทีที่เกิน** ไม่ใช่อ่านจบแล้วค่อยบ่น
//
// ทำไมไม่ใช้ `request.text()` / `request.arrayBuffer()` แล้วค่อยวัด: สองตัวนั้น
// buffer ทั้ง body จน EOF ก่อนคืนค่า แปลว่าเราจ่ายค่า memory ไปครบแล้วก่อนจะได้
// ปฏิเสธ · ผู้ใช้ที่ล็อกอินส่ง chunked body ขนาดมหาศาลได้ และบน Cloudflare Workers
// การ buffer payload ใหญ่ชน memory limit ได้จริง (RIL cross-model รอบ 3 ชี้)
//
// และต้องวัดเป็น **byte** ไม่ใช่ `String.length` — String.length นับ UTF-16 code unit
// ซึ่งอักษรไทยหนึ่งตัว = 1 หน่วยแต่กิน 3 byte จริง (RIL รอบ 2 พิสูจน์ว่าทะลุได้)

export type BoundedBody = { ok: true; text: string } | { ok: false; reason: 'too-large' }

export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBody> {
  const body = request.body

  // ปฏิเสธเร็วจาก Content-Length ถ้าประกาศมาเกิน — แต่ **ห้ามเชื่อเป็น guard เดียว**
  // เพราะ header ปลอมได้และ chunked body ไม่มี header นี้
  //
  // ⚠️ ต้อง cancel body ด้วย ไม่ใช่ return เฉยๆ — ไม่งั้นฝั่งที่ส่งยังถูกปล่อยให้
  // ส่งต่อและ underlying source ไม่เคยรู้ว่าเราเลิกสนใจแล้ว
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await body?.cancel().catch(() => {})
    return { ok: false, reason: 'too-large' }
  }

  if (!body) return { ok: true, text: '' }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        // ตัดสายทันที — ไม่อ่านส่วนที่เหลือและทิ้งสิ่งที่อ่านมาแล้ว
        await reader.cancel().catch(() => {})
        return { ok: false, reason: 'too-large' }
      }
      chunks.push(value)
    }
  } finally {
    // `cancel()` ไม่ปล่อย lock ให้เองตาม spec ของ Streams — ถ้าไม่ปล่อย
    // `request.body.locked` จะค้างเป็น true ตลอดอายุของ request
    try {
      reader.releaseLock()
    } catch {
      // มี read ค้างอยู่ในบางเส้นทาง — ปล่อยผ่าน สิ่งที่ต้องการคือไม่ถือ lock ไว้เฉยๆ
    }
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(merged) }
}
