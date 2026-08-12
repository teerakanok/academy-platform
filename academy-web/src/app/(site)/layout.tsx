import type { Metadata } from 'next'
import { AcademyShell } from '@/components/AppShell'
import '../globals.css'

export const metadata: Metadata = {
  title: {
    default: 'CYBERSKILLS Academy',
    template: '%s · CYBERSKILLS Academy',
  },
  description:
    'Learn cybersecurity without relearning what you already know. Map your path, prove your skills, and keep moving.',
  robots: { index: false, follow: false },
}

export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return <AcademyShell locale="en">{children}</AcademyShell>
}
