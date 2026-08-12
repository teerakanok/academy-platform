'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUi } from './LocaleProvider'
import { UI_LOCALES, UI_LOCALE_LABEL } from '@/lib/i18n/ui'

// สลับภาษาของเว็บ — สองภาษาจึงเป็นปุ่มคู่ ไม่ใช่ dropdown
// (dropdown สำหรับสองตัวเลือกคือการเพิ่มคลิกโดยไม่ได้อะไร)
export function languageNavigationTarget(
  pathname: string,
  currentHref: string,
  next: (typeof UI_LOCALES)[number],
): { href: string; method: 'assign' | 'replace' } | null {
  const segments = pathname.split('/').filter(Boolean)
  const url = new URL(currentHref)
  if (segments[0] !== 'courses') {
    if (pathname !== '/' || next !== 'th') return null
    const params = new URLSearchParams([['lang', next]])
    for (const [key, value] of url.searchParams) {
      if (key !== 'lang') params.append(key, value)
    }
    return { href: `/courses?${params.toString()}${url.hash}`, method: 'assign' }
  }
  if (segments.length === 1) {
    url.searchParams.set('lang', next)
    return { href: `${url.pathname}${url.search}${url.hash}`, method: 'assign' }
  }
  if (segments.length === 3 && (segments[2] === 'en' || segments[2] === 'th')) {
    url.pathname = `/courses/${segments[1]}/${next}`
    url.searchParams.delete('lang')
    return { href: `${url.pathname}${url.search}${url.hash}`, method: 'replace' }
  }
  const isLearnerOverview = segments.length === 3 && segments[2] === 'learn'
  const isLesson = segments.length === 4 && segments[2] === 'lessons'
  if (!isLearnerOverview && !isLesson) return null
  url.pathname = pathname
  url.searchParams.set('lang', next)
  return { href: `${url.pathname}${url.search}${url.hash}`, method: 'replace' }
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useUi()
  const pathname = usePathname()
  const router = useRouter()

  function selectLocale(next: (typeof UI_LOCALES)[number]) {
    if (next === locale) return
    setLocale(next)
    const target = languageNavigationTarget(pathname, window.location.href, next)
    if (!target) return
    if (target.method === 'assign') window.location.assign(target.href)
    else router.replace(target.href)
  }

  return (
    <div
      className="flex items-center rounded-control border border-cs-border p-0.5"
      role="group"
      aria-label={t.language.label}
      data-testid="language-toggle"
    >
      {UI_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => selectLocale(code)}
          aria-pressed={code === locale}
          data-testid={`lang-${code}`}
          className={`rounded-[6px] px-2 py-1 text-[12px] font-medium transition-colors ${
            code === locale
              ? 'bg-cs-accent-dim text-cs-accent'
              : 'text-cs-muted hover:text-cs-accent'
          }`}
        >
          {UI_LOCALE_LABEL[code]}
        </button>
      ))}
    </div>
  )
}
