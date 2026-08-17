import type { ReactNode } from 'react'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { THEME_BOOTSTRAP_SCRIPT } from '@/components/ThemeToggle'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import { SiteChrome } from '@/components/i18n/SiteChrome'
import { internalSurfacesEnabled } from '@/lib/internal-surface'
import type { UiLocale } from '@/lib/i18n/ui'

const fraunces = Fraunces({
  subsets: ['latin'],
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

export function AcademyShell({
  children,
  locale,
  fixedLocale = false,
}: {
  children: ReactNode
  locale: UiLocale
  fixedLocale?: boolean
}) {
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      {/* The root layout owns this literal pre-paint theme script. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <LocaleProvider initialLocale={locale} fixedLocale={fixedLocale}>
          <SiteChrome showInternalSurfaces={internalSurfacesEnabled()}>{children}</SiteChrome>
        </LocaleProvider>
      </body>
    </html>
  )
}
