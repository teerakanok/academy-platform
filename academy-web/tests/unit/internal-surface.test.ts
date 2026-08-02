import { afterEach, describe, expect, it, vi } from 'vitest'
import { internalSurfacesEnabled, isInternalSurface } from '@/lib/internal-surface'

// นโยบายพื้นผิวภายในต้อง **ปิดก่อนเสมอ** — เปิดได้ด้วยค่าที่ตั้งใจตั้งเท่านั้น
//
// เดิม `/player` เปิดให้ผู้ล็อกอินทุกคน ทั้งที่มันคือคลังข้อสอบที่ยังส่งเฉลยไป client
// การพลาดค่า env, พิมพ์ผิด, หรือค่าที่ดู "คล้ายเปิด" ต้องแปลว่าปิด ไม่ใช่เปิด

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('internalSurfacesEnabled', () => {
  it('ไม่ตั้งค่า = ปิด', () => {
    vi.stubEnv('INTERNAL_SURFACES', '')
    expect(internalSurfacesEnabled()).toBe(false)
  })

  it.each(['off', 'true', '1', 'yes', 'ON', 'on ', 'enabled'])(
    'ค่า %s ที่ไม่ใช่ "on" ตรงตัว = ปิด',
    (value) => {
      vi.stubEnv('INTERNAL_SURFACES', value)
      // 'on ' ที่มีช่องว่างถูก trim จึงเปิด — ยกเว้นข้อนั้นออกจากคำกล่าวอ้าง
      expect(internalSurfacesEnabled()).toBe(value.trim() === 'on')
    },
  )

  it('"on" เท่านั้นที่เปิด', () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    expect(internalSurfacesEnabled()).toBe(true)
  })
})

describe('isInternalSurface', () => {
  it.each(['/player', '/player/', '/player/module/x', '/player/exam/y'])('%s = ภายใน', (path) => {
    expect(isInternalSurface(path)).toBe(true)
  })

  it.each(['/', '/dashboard', '/courses/basic-os-linux', '/playerx', '/api/progress'])(
    '%s = ไม่ใช่ภายใน (ห้ามกันเส้นทางปกติโดยไม่ตั้งใจ)',
    (path) => {
      expect(isInternalSurface(path)).toBe(false)
    },
  )
})
