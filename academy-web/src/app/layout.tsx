import type { Metadata } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { SiteChrome } from '@/components/i18n/SiteChrome'
import { internalSurfacesEnabled } from '@/lib/internal-surface'
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
        <LocaleProvider>
          <SiteChrome showInternalSurfaces={internalSurfacesEnabled()}>{children}</SiteChrome>
        </LocaleProvider>
      </body>
    </html>
  )
}
