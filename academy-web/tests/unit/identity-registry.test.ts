import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIdentityAdapter, resetIdentityAdapterForTest } from '@/lib/identity/registry'

// adapter ปลอมหลุดขึ้น production = ทุกคนล็อกอินได้โดยไม่มีการยืนยันตัวตนใดๆ
// จึงต้องพังตั้งแต่ตอนเรียก ไม่ใช่ปล่อยผ่านแล้วไปพบทีหลังว่าคนทั้งระบบเข้ามาทางนั้น

const original = { ...process.env }

afterEach(() => {
  vi.unstubAllEnvs()
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
    process.env.IDENTITY_LOCAL_FAKE_ISSUER = 'https://identity.local.invalid'
    // NODE_ENV เป็น read-only ในชนิดของ Node — ต้อง stub ผ่าน vitest ไม่ใช่ assign ตรง
    vi.stubEnv('NODE_ENV', 'test')
    resetIdentityAdapterForTest()
    const adapter = getIdentityAdapter()
    expect(adapter?.name).toBe('fake')
    expect(adapter?.productionSafe).toBe(false)
  })

  it('fake บน production ต้องพังทันที', () => {
    process.env.IDENTITY_ADAPTER = 'fake'
    vi.stubEnv('NODE_ENV', 'production')
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow(/production/)
  })

  it('fake ต้องไม่เดา canonical issuer จาก Account Center URL', () => {
    process.env.IDENTITY_ADAPTER = 'fake'
    delete process.env.IDENTITY_LOCAL_FAKE_ISSUER
    vi.stubEnv('NODE_ENV', 'test')
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow(/IDENTITY_LOCAL_FAKE_ISSUER/)
  })

  it('fake ปฏิเสธ issuer ที่หน้าตาเป็น production เพื่อไม่ให้ fixture เลียนแบบ canonical identity', () => {
    process.env.IDENTITY_ADAPTER = 'fake'
    process.env.IDENTITY_LOCAL_FAKE_ISSUER = 'https://accounts.cyberskills.co.th'
    vi.stubEnv('NODE_ENV', 'test')
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow(/local-only/)
  })

  it('ค่าที่ไม่รู้จักต้องพัง ไม่ใช่เงียบแล้วกลายเป็นไม่มี auth', () => {
    process.env.IDENTITY_ADAPTER = 'something-else'
    resetIdentityAdapterForTest()
    expect(() => getIdentityAdapter()).toThrow()
  })
})
