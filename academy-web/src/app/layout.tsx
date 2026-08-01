import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { AccountMenu } from '@/components/auth/AccountMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import './globals.css'

// Fraunces (soft serif) พูดแทน "คน/ความรู้" · Inter อ่านยาวสบาย · JetBrains Mono
// พูดแทน "เครื่อง" — คอร์สนี้คือการสอนคนคุยกับเครื่อง ตัวอักษรเลยแบ่งหน้าที่แบบนั้น
const fraunces = Fraunces({
  subsets: ['latin'],
  // variable weight ปลดล็อกแกน SOFT/WONK ซึ่งเป็นตัวที่ทำให้หัวเรื่องดูอบอุ่น
  // แทนที่จะเป็น serif วิชาการแข็งๆ
  weight: 'variable',
  axes: ['SOFT', 'WONK'],
  variable: '--font-fraunces',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CYBERSKILLS Academy',
    template: '%s · CYBERSKILLS Academy',
  },
  description:
    'Learn cybersecurity without relearning what you already know. Map your path, prove your skills, and keep moving.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* ใช้ธีมที่ผู้ใช้เลือกไว้ก่อนวาดเฟรมแรก — กันจอกระพริบ; ค่าตั้งต้นคือ light
            ความปลอดภัย: สตริงนี้เป็น literal คงที่ ไม่มีการ interpolate ค่าใดจากผู้ใช้
            จึงไม่มีช่องทาง XSS (pattern เดียวกับ cyberskills-web) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('academy.theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-cs-accent-fill focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-cs-on-accent"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-cs-border bg-cs-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-6 sm:px-6 sm:py-3.5">
            <Link href="/" className="flex items-center gap-2 sm:gap-2.5">
              {/* โลโก้ canonical จาก cyberskills-web/public/redesign/logos — ห้ามวาดใหม่ */}
              <Image
                src="/brand/logo-academy.svg"
                alt=""
                width={30}
                height={30}
                priority
                className="shrink-0"
              />
              {/* ที่ 390px มี logo + ชื่อ + สองลิงก์ + ปุ่มธีม ใส่ครบไม่พอที่จริงๆ
                  (เคยล้นจนทั้งเว็บเลื่อนซ้ายขวาได้) จึงตัดคำว่า CyberSkills ออกบน
                  จอเล็ก เพราะโลโก้แบกตระกูลอยู่แล้ว — เลือกตัดตรงนี้เพราะไม่ทำให้
                  ปลายทางไหนหายไป ต่างจากการยุบเมนูเป็นแฮมเบอร์เกอร์
                  ชื่อเต็มยังอยู่ครบสำหรับ screen reader */}
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
            <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 text-[13px] sm:gap-1 sm:text-sm">
              {/* py-2 บนจอเล็กเพื่อให้นิ้วกดโดนจริง ไม่ใช่แค่พอกดด้วยเมาส์ */}
              <Link
                href="/dashboard"
                className="whitespace-nowrap rounded-lg px-2 py-2 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text sm:px-3 sm:py-1.5"
              >
                My learning
              </Link>
              <Link
                href="/player"
                className="whitespace-nowrap rounded-lg px-2 py-2 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text sm:px-3 sm:py-1.5"
              >
                Practice
              </Link>
            </nav>
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
            <Link
              href="/privacy"
              className="whitespace-nowrap underline underline-offset-4 hover:text-cs-accent"
            >
              นโยบายความเป็นส่วนตัว (Privacy)
            </Link>
          </div>
        </footer>
      </body>
    </html>
  )
}
