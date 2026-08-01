'use client'

import { useUi } from './LocaleProvider'
import { UI_LOCALES, UI_LOCALE_LABEL } from '@/lib/i18n/ui'

// สลับภาษาของเว็บ — สองภาษาจึงเป็นปุ่มคู่ ไม่ใช่ dropdown
// (dropdown สำหรับสองตัวเลือกคือการเพิ่มคลิกโดยไม่ได้อะไร)
export function LanguageToggle() {
  const { locale, setLocale, t } = useUi()

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
          onClick={() => setLocale(code)}
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
