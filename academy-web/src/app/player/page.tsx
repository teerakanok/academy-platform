import type { Metadata } from 'next'
import { privatePage } from '@/lib/seo'
import Link from 'next/link'
import { getCourseContent } from '@/lib/content/source'
import { PlayerHub } from '@/components/player/PlayerHub'

export const metadata: Metadata = privatePage('Course Player (dev)')

// Internal dev player — เสพ fixture ผ่าน loader เท่านั้น (content-agnostic engine)
export default function PlayerPage() {
  const content = getCourseContent()
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="font-mono text-sm text-cs-accent mb-2">
        <Link href="/" className="hover:underline underline-offset-4">
          cyberskills --academy
        </Link>{' '}
        / player
      </p>
      <h1 className="font-display text-3xl font-bold text-cs-text mb-2">Course Player</h1>
      <p className="text-sm text-cs-muted mb-10 font-mono">
        internal dev build — เนื้อหาจาก dev fixture (ห้ามเผยแพร่)
      </p>
      <PlayerHub
        modules={content.modules.map((m) => ({
          slug: m.slug,
          title: m.title,
          questionCount: m.questions.length,
        }))}
        exams={content.fullLength.map((t) => ({
          id: t.id,
          title: t.title,
          mcqCount: t.questions.length,
          pbqCount: t.pbqs.length,
          timeLimitMinutes: t.timeLimitMinutes,
        }))}
      />
    </div>
  )
}
