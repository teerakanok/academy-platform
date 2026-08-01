import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCourseContent } from '@/lib/content/source'
import { ExamPlayer } from '@/components/player/ExamPlayer'

export const metadata: Metadata = privatePage('Full-Length Practice (dev)')

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const test = getCourseContent().fullLength.find((t) => t.id === id)
  if (!test) notFound()
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-sm text-cs-accent mb-6">
        <Link href="/player" className="hover:underline underline-offset-4">
          player
        </Link>{' '}
        / {test.id}
      </p>
      <ExamPlayer test={test} />
    </div>
  )
}
