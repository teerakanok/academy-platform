'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AccountMenu } from '@/components/auth/AccountMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from './LanguageToggle'
import { useUi } from './LocaleProvider'

// หัวและท้ายเว็บ — เป็น client component เพราะต้องเปลี่ยนภาษาได้โดยไม่ทำให้ทุกหน้า
// กลายเป็น dynamic (ดูเหตุผลใน LocaleProvider)
//
// กฎที่ห้ามผิด: เมื่อเว็บเป็นภาษาอังกฤษ ต้องไม่มีคำไทยหลุดออกมาเลย — เคยพลาดที่
// ลิงก์ privacy บน footer ซึ่งเขียนไทยคาไว้บนหน้าอังกฤษ คนต่างชาติที่เปิดมาเจอ
// ก็ไม่รู้ว่าลิงก์นั้นคืออะไร

export function SiteChrome({
  children,
  showInternalSurfaces = false,
}: {
  children: React.ReactNode
  /** เมนูของพื้นผิวภายใน — ค่าตั้งต้นคือซ่อน · ตัดสินฝั่งเซิร์ฟเวอร์แล้วส่งลงมา
   *  (ซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ — ตัวกันจริงอยู่ที่ middleware) */
  showInternalSurfaces?: boolean
}) {
  const { t } = useUi()

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-cs-accent-fill focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-cs-on-accent"
      >
        {t.nav.skipToContent}
      </a>

      <header className="sticky top-0 z-40 border-b border-cs-border bg-cs-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-3.5">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5">
            {/* โลโก้ canonical จาก cyberskills-web/public/redesign/logos — ห้ามวาดใหม่ */}
            <Image src="/brand/logo-academy.svg" alt="" width={30} height={30} priority className="shrink-0" />
            {/* ที่ 390px ใส่ชื่อเต็มไม่พอที่ จึงตัดคำว่า CYBERSKILLS ออกบนจอเล็ก
                เพราะโลโก้แบกตระกูลอยู่แล้ว — ชื่อเต็มยังอยู่ครบสำหรับ screen reader */}
            <span className="whitespace-nowrap font-display text-base font-semibold tracking-tight text-cs-text sm:text-lg">
              <span className="sr-only">CYBERSKILLS Academy</span>
              <span aria-hidden="true" className="hidden sm:inline">
                CYBERSKILLS{' '}
              </span>
              <span aria-hidden="true" className="text-cs-accent">
                Academy
              </span>
            </span>
          </Link>

          <nav aria-label={t.nav.main} className="ml-auto flex items-center gap-0.5 text-[13px] sm:gap-1 sm:text-sm">
            <Link
              href="/dashboard"
              className="whitespace-nowrap rounded-lg px-2 py-2 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text sm:px-3 sm:py-1.5"
            >
              {t.nav.myLearning}
            </Link>
            {showInternalSurfaces && (
              <Link
                href="/player"
                className="whitespace-nowrap rounded-lg px-2 py-2 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text sm:px-3 sm:py-1.5"
              >
                {t.nav.practice}
              </Link>
            )}
          </nav>

          {/* ตัวสลับภาษาซ่อนบนจอเล็กสุด — ที่ 390px มีของครบเกินจะใส่ทั้งหมด
              และมันอยู่ในหน้าโปรไฟล์ได้เมื่อทำแล้ว */}
          <div className="hidden sm:block">
            <LanguageToggle />
          </div>
          <AccountMenu />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-16 border-t border-cs-border px-6 py-8 text-sm text-cs-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} CYBERSKILLS</span>
          <div className="flex items-center gap-4">
            <div className="sm:hidden">
              <LanguageToggle />
            </div>
            <Link
              href="/privacy"
              className="whitespace-nowrap underline underline-offset-4 hover:text-cs-accent"
            >
              {t.footer.privacy}
            </Link>
          </div>
        </div>
      </footer>
    </>
  )
}
