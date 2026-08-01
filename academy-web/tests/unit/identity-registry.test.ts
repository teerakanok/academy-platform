import { afterEach, describe, expect, it } from 'vitest'
import { getIdentityAdapter, resetIdentityAdapterForTest } from '@/lib/identity/registry'

// adapter ปลอมหลุดขึ้น production = ทุกคนล็อกอินได้โดยไม่มีการยืนยันตัวตนใดๆ
// จึงต้องพังตั้งแต่ตอนเรียก ไม่ใช่ปล่อยผ่านแล้วไปพบทีหลังว่าคนทั้งระบบเข้ามาทางนั้น

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
  resetIdentityAdapterForTest()
})

describe('การเลือก identity adapter', () => {
  it('ไม่ตั้งค่า = ไม่มี adapter (ไม่ใช่เดาเอาเอง)', () => {
    delete process.env.IDENTITY_ADAPTER
    resetIdentityAdapterForTest()
    expect(getIdentityAdapter()).toBeNull()
  })

  it('fake ใช้ได้นอก production', () => {
    process.env.IDENTITY_ADAPTER = 'fake'
    process.env.NODE_ENV = 'test'
    resetIdentityAdapterForTest()
    const adapter = getIdentityAdapter()
    expect(adapter?.name).toBe('fake')
    expect(adapter?.productionSafe).toBe(false)
  })

  it('fake บน production ต้องพังทันที', () => {
    process.env.IDENTITY_ADAPTER = 'fake'
    process.env.NODE_ENV = 'production'
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow(/production/)
  })

  it('ค่าที่ไม่รู้จักต้องพัง ไม่ใช่เงียบแล้วกลายเป็นไม่มี auth', () => {
    process.env.IDENTITY_ADAPTER = 'something-else'
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow()
  })
})
