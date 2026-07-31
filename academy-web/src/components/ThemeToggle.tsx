'use client'

import { useEffect, useState } from 'react'

// Academy ตั้งต้นเป็น light (บรรยากาศห้องเรียน ไม่ใช่ห้อง SOC) — สลับ dark ได้และจำไว้
export const THEME_STORAGE_KEY = 'academy.theme'

type Theme = 'light' | 'dark'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // โหมด private / storage เต็ม — สลับได้ในรอบนี้ แค่จำข้ามรอบไม่ได้
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cs-border text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent"
    >
      <span aria-hidden="true" className="text-sm">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
    </button>
  )
}
