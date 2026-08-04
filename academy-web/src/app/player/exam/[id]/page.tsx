import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCourseContent } from '@/lib/content/source'
import { ExamPlayer } from '@/components/player/ExamPlayer'
import { requireInternalContentStaff } from '@/lib/staff/authorization'

export const metadata: Metadata = privatePage('Full-Length Practice (dev)')
export const dynamic = 'force-dynamic'

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalContentStaff()
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
