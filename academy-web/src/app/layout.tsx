import type { Metadata } from 'next'
import Link from 'next/link'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
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
    default: 'CyberSkills Academy',
    template: '%s · CyberSkills Academy',
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
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-cs-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-cs-on-accent"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-cs-border bg-cs-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
            <Link href="/" className="font-display text-lg font-semibold tracking-tight text-cs-text">
              CyberSkills <span className="text-cs-accent">Academy</span>
            </Link>
            <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="rounded-lg px-3 py-1.5 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text"
              >
                My learning
              </Link>
              <Link
                href="/player"
                className="rounded-lg px-3 py-1.5 text-cs-muted transition-colors hover:bg-cs-surface-2 hover:text-cs-text"
              >
                Practice
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="mt-16 border-t border-cs-border px-6 py-8 text-sm text-cs-muted">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span>© {new Date().getFullYear()} CYBERSKILLS</span>
            <Link href="/privacy" className="underline underline-offset-4 hover:text-cs-accent">
              นโยบายความเป็นส่วนตัว (Privacy)
            </Link>
          </div>
        </footer>
      </body>
    </html>
  )
}
