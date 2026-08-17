'use client'

import { useEffect, useState } from 'react'
import { useUi } from '@/components/i18n/LocaleProvider'

// Academy ตั้งต้นเป็น light (บรรยากาศห้องเรียน ไม่ใช่ห้อง SOC) — สลับ dark ได้และจำไว้
export const THEME_STORAGE_KEY = 'academy.theme'

/** สคริปต์ก่อน paint ที่ root layout ฝังไว้ — ต้องอ่าน key เดียวกับปุ่มสลับธีม
 *  ไม่งั้นผู้ที่เลือก dark ไว้จะเห็นหน้าสว่างวาบทุกครั้งที่โหลด
 *  ประกาศไว้ตรงนี้เพื่อให้ test ตรวจได้ว่ามันยัง parse ผ่านจริง — สคริปต์ที่
 *  syntax พังจะตายเงียบทั้งก้อนโดยหน้าเว็บยังดูปกติ */
export const THEME_BOOTSTRAP_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')` +
  `document.documentElement.setAttribute('data-theme','dark')}catch(e){}`

type Theme = 'light' | 'dark'

export function ThemeToggle() {
  const { t } = useUi()
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    let current: Theme = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light'
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') current = stored
    } catch {
      // The pre-paint DOM state remains authoritative when storage is unavailable.
    }
    document.documentElement.setAttribute('data-theme', current)
    setTheme(current)
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
      aria-label={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cs-border text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent"
    >
      <span aria-hidden="true" className="text-sm">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
    </button>
  )
}
