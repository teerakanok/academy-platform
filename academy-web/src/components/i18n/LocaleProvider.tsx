'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  DEFAULT_UI_LOCALE,
  UI,
  UI_LOCALE_COOKIE,
  isUiLocale,
  type UiLocale,
  type UiStrings,
} from '@/lib/i18n/ui'

// ภาษาของตัวเว็บ (ไม่ใช่ภาษาของเนื้อหาคอร์ส ซึ่งมี locale ของตัวเองอยู่แล้ว)
//
// ทำไมเก็บฝั่ง client ไม่ใช่อ่าน cookie ใน layout:
// การเรียก cookies() ใน root layout จะทำให้**ทุกหน้ากลายเป็น dynamic** ซึ่งฆ่า
// static/SSG ที่หน้าร้านพึ่งพาอยู่ (และ SEO กับความเร็วบน edge หายไปด้วย)
//
// ราคาที่จ่ายคือเฟรมแรกเป็นภาษาตั้งต้นเสี้ยววินาที — แลกกับหน้าร้านที่ยัง static
// ทางที่ถูกกว่านี้ในระยะยาวคือแยก route ต่อภาษา (/th/...) ซึ่งได้ทั้งสองอย่าง
// แต่ต้องรื้อ routing ทั้งชุด บันทึกไว้ในแผนแล้ว

interface LocaleContextValue {
  locale: UiLocale
  t: UiStrings
  setLocale: (next: UiLocale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_UI_LOCALE,
  t: UI[DEFAULT_UI_LOCALE],
  setLocale: () => {},
})

function readCookie(): UiLocale | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${UI_LOCALE_COOKIE}=`))
  const value = raw?.split('=')[1]
  return isUiLocale(value) ? value : null
}

function routeSupportsUiLocale(pathname: string): boolean {
  return pathname === '/courses'
    || pathname.startsWith('/courses/')
    || pathname === '/access-required'
    || pathname === '/dashboard'
    || pathname === '/privacy'
}

export function requestedUiLocale(pathname: string, search: string): UiLocale | null {
  if (!routeSupportsUiLocale(pathname)) return null
  const values = new URLSearchParams(search).getAll('lang')
  return values.length === 1 && isUiLocale(values[0]) ? values[0] : null
}

function readLocalePreference(): UiLocale | null {
  if (typeof window === 'undefined') return null
  if (!routeSupportsUiLocale(window.location.pathname)) return null
  return requestedUiLocale(window.location.pathname, window.location.search) ?? readCookie()
}

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_UI_LOCALE,
  fixedLocale = false,
}: {
  children: React.ReactNode
  initialLocale?: UiLocale
  fixedLocale?: boolean
}) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale)

  useEffect(() => {
    if (fixedLocale) {
      document.documentElement.lang = initialLocale
      document.cookie = `${UI_LOCALE_COOKIE}=${initialLocale}; path=/; max-age=31536000; SameSite=Lax`
      return
    }
    const stored = readLocalePreference()
    if (stored) {
      setLocaleState(stored)
      document.documentElement.lang = stored
    }
  }, [fixedLocale, initialLocale])

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next)
    document.documentElement.lang = next
    // cookie ไม่ใช่ localStorage เพราะฝั่ง server จะได้อ่านได้ตอนที่เราแยก route ต่อภาษา
    // SameSite=Lax พอ — ค่านี้ไม่ใช่ข้อมูลอ่อนไหว
    document.cookie = `${UI_LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`
  }, [])

  return (
    <LocaleContext.Provider value={{ locale, t: UI[locale], setLocale }}>{children}</LocaleContext.Provider>
  )
}

export function useUi() {
  return useContext(LocaleContext)
}
