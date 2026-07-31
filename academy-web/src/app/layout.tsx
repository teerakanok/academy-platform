import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// ตาม pattern cyberskills-web: next/font โหลดฟอนต์ตอน build — ไม่มี external
// request ตอน runtime, CLS จากฟอนต์เป็น 0; ภาษาไทยใช้ system fallback
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CyberSkills Academy',
    template: '%s | CyberSkills Academy',
  },
  description:
    'แพลตฟอร์มเรียนรู้ cybersecurity แบบ personalized — เรียนเฉพาะสิ่งที่ยังไม่รู้ พิสูจน์ทักษะด้วย lab จริง',
  robots: {
    // ยังไม่ public — อยู่หลัง Zero Trust; กัน index ไว้ก่อนจนกว่า founder สั่งเปิด
    index: false,
    follow: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-cs-accent focus:text-cs-bg focus:px-4 focus:py-2 focus:rounded focus:text-sm focus:font-medium"
        >
          ข้ามไปเนื้อหาหลัก
        </a>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-cs-border px-6 py-6 text-sm text-cs-muted">
          <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-3">
            <span>© {new Date().getFullYear()} CYBERSKILLS</span>
            <Link href="/privacy" className="hover:text-cs-accent underline underline-offset-4">
              นโยบายความเป็นส่วนตัว
            </Link>
          </div>
        </footer>
      </body>
    </html>
  )
}
