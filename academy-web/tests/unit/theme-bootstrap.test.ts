import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY } from '@/components/ThemeToggle'
import { ThemeBootstrapScript } from '@/components/ThemeBootstrapScript'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': 'request-theme-nonce' }),
}))

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

    const setAttribute = ((): { calls: string[][] } => {
      const calls: string[][] = []
      const store: Record<string, string> = { [THEME_STORAGE_KEY]: 'dark' }
      const fn = new Function('localStorage', 'document', THEME_BOOTSTRAP_SCRIPT)
      fn(
        { getItem: (key: string) => store[key] ?? null },
        { documentElement: { setAttribute: (...args: string[]) => calls.push(args) } },
      )
      return { calls }
    })()
    expect(setAttribute.calls).toEqual([['data-theme', 'dark']])
  })

  it('binds the pre-paint script to the middleware nonce', async () => {
    const html = renderToStaticMarkup(
      await ThemeBootstrapScript(),
    )

    expect(html).toContain('<script nonce="request-theme-nonce">')
    expect(html).toContain(THEME_BOOTSTRAP_SCRIPT)
  })
})
