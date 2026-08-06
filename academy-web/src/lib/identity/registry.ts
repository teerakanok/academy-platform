import { FakeIdentityAdapter } from './fake-adapter'
import type { IdentityAdapter } from './adapter'

// เลือก adapter ตามสภาพแวดล้อม
//
// กฎที่ห้ามผ่อน: **adapter ที่ประกาศตัวว่าใช้บน production ไม่ได้ ต้องไม่ถูกใช้บน
// production** — และต้องพังตั้งแต่ตอนเรียก ไม่ใช่ปล่อยผ่านแล้วไปพบทีหลังว่าคนทั้งระบบ
// ล็อกอินผ่าน adapter ปลอม
//
// ตอนนี้ยังไม่มี adapter ตัวจริง เพราะ Identity Control ยังไม่ release runtime,
// registry และ authorization ที่ให้ Academy ผูก production endpoint ได้.
let cached: IdentityAdapter | null | undefined

export function getIdentityAdapter(): IdentityAdapter | null {
  if (cached !== undefined) return cached
  cached = build()
  return cached
}

function build(): IdentityAdapter | null {
  const mode = process.env.IDENTITY_ADAPTER?.trim()
  if (!mode || mode === 'none') return null

  if (mode === 'fake') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('IDENTITY_ADAPTER=fake ใช้บน production ไม่ได้ — adapter นี้ไม่ยืนยันตัวตนใดๆ')
    }
    const issuer = process.env.IDENTITY_LOCAL_FAKE_ISSUER?.trim()
    if (!issuer) {
      throw new Error('IDENTITY_ADAPTER=fake ต้องกำหนด IDENTITY_LOCAL_FAKE_ISSUER สำหรับ local fixture โดย explicit')
    }
    return new FakeIdentityAdapter(issuer)
  }

  throw new Error(`ไม่รู้จัก IDENTITY_ADAPTER=${mode}`)
}

/** ใช้ในเทสเพื่อล้างค่าที่ cache ไว้ */
export function resetIdentityAdapterForTest(): void {
  cached = undefined
}
