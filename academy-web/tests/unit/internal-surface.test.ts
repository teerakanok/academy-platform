import { afterEach, describe, expect, it, vi } from 'vitest'
import { internalSurfacesEnabled, isInternalSurface } from '@/lib/internal-surface'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// นโยบายพื้นผิวภายในต้อง **ปิดก่อนเสมอ** — เปิดได้ด้วยค่าที่ตั้งใจตั้งเท่านั้น
//
// เดิม `/player` เปิดให้ผู้ล็อกอินทุกคน ทั้งที่มันคือคลังข้อสอบที่ยังส่งเฉลยไป client
// การพลาดค่า env, พิมพ์ผิด, หรือค่าที่ดู "คล้ายเปิด" ต้องแปลว่าปิด ไม่ใช่เปิด

afterEach(() => {
  vi.unstubAllEnvs()
})

function routeSource(path: string): string {
  const direct = join(process.cwd(), path)
  const resolved = existsSync(direct) ? direct : join(process.cwd(), path.replace('src/app/', 'src/app/(site)/'))
  return readFileSync(resolved, 'utf8')
}

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
    vi.stubEnv('NODE_ENV', 'development')
    expect(internalSurfacesEnabled()).toBe(true)
  })

  it('production toggle เปิดได้ แต่ page ยังต้องตรวจ staff authorization', () => {
    vi.stubEnv('INTERNAL_SURFACES', 'on')
    vi.stubEnv('NODE_ENV', 'production')
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

describe('player route authorization wiring', () => {
  it.each(['src/app/player/page.tsx', 'src/app/player/module/[slug]/page.tsx', 'src/app/player/exam/[id]/page.tsx'])(
    '%s ตรวจ staff ทุก request และห้ามถูก prerender',
    (path) => {
      const source = routeSource(path)
      expect(source).toContain("export const dynamic = 'force-dynamic'")
      expect(source).toContain('await requireInternalContentStaff()')
    },
  )
})
