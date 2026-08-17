import { describe, expect, it } from 'vitest'
import { THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY } from '@/components/ThemeToggle'

describe('สคริปต์ธีมก่อน paint', () => {
  it('parse ผ่านจริง — สคริปต์ที่ syntax พังจะตายเงียบทั้งก้อน', () => {
    expect(() => new Function(THEME_BOOTSTRAP_SCRIPT)).not.toThrow()
  })

  it('อ่าน key เดียวกับปุ่มสลับธีม จึงไม่เกิดหน้าสว่างวาบให้คนที่เลือก dark ไว้', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY)
  })

  it('ตั้งค่า data-theme และห่อด้วย try/catch — localStorage ที่ถูกบล็อกต้องไม่ทำหน้าพัง', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("setAttribute('data-theme','dark')")
    expect(THEME_BOOTSTRAP_SCRIPT.startsWith('try{')).toBe(true)
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('catch')

    // ทำงานได้จริงเมื่อ localStorage บอกว่า dark
    const setAttribute = ((): { calls: string[][] } => {
      const calls: string[][] = []
      const store: Record<string, string> = { [THEME_STORAGE_KEY]: 'dark' }
      const fn = new Function(
        'localStorage',
        'document',
        THEME_BOOTSTRAP_SCRIPT,
      )
      fn(
        { getItem: (k: string) => store[k] ?? null },
        { documentElement: { setAttribute: (...args: string[]) => calls.push(args) } },
      )
      return { calls }
    })()
    expect(setAttribute.calls).toEqual([['data-theme', 'dark']])
  })
})
