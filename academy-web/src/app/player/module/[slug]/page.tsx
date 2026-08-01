import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCourseContent } from '@/lib/content/source'
import { PracticePlayer } from '@/components/player/PracticePlayer'

export const metadata: Metadata = privatePage('Module Practice (dev)')

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const bank = getCourseContent().modules.find((m) => m.slug === slug)
  if (!bank) notFound()
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-sm text-cs-accent mb-6">
        <Link href="/player" className="hover:underline underline-offset-4">
          player
        </Link>{' '}
        / {bank.moduleId}
      </p>
      <PracticePlayer bank={bank} />
    </div>
  )
}
