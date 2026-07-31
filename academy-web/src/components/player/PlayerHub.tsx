'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { browserStore, latestAttempt } from '@/lib/player/progress'

// Hub: เลือก module → practice + เห็น progress ต่อ module (แผน §4-M2-5)
// รับเฉพาะ metadata (ไม่แบก bank ทั้งก้อนมาที่ hub)

export interface ModuleMeta {
  slug: string
  title: string
  questionCount: number
}

export interface ExamMeta {
  id: string
  title: string
  mcqCount: number
  pbqCount: number
  timeLimitMinutes: number
}

interface ProgressSummary {
  answered: number
  status: string
}

export function PlayerHub({ modules, exams }: { modules: ModuleMeta[]; exams: ExamMeta[] }) {
  const [progress, setProgress] = useState<Record<string, ProgressSummary>>({})

  useEffect(() => {
    const store = browserStore()
    const next: Record<string, ProgressSummary> = {}
    for (const m of modules) {
      const { record } = latestAttempt(store, `module:${m.slug}`)
      if (record) {
        next[m.slug] = {
          answered: Object.values(record.answers.mcq).filter((a) => a && a.length > 0).length,
          status: record.status,
        }
      }
    }
    for (const e of exams) {
      const { record } = latestAttempt(store, e.id)
      if (record) {
        next[e.id] = {
          answered: Object.values(record.answers.mcq).filter((a) => a && a.length > 0).length,
          status: record.status,
        }
      }
    }
    setProgress(next)
  }, [modules, exams])

  return (
    <div className="space-y-10">
      <section aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="font-display text-xl font-bold text-cs-text mb-4">
          ฝึกตาม Module
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {modules.map((m) => {
            const p = progress[m.slug]
            return (
              <li key={m.slug}>
                <Link
                  href={`/player/module/${m.slug}`}
                  data-testid={`module-link-${m.slug}`}
                  className="block rounded-lg border border-cs-border bg-cs-surface p-5 transition-colors hover:border-cs-accent"
                >
                  <p className="font-display font-semibold text-cs-text">{m.title}</p>
                  <p className="mt-1 font-mono text-xs text-cs-muted">
                    {m.questionCount} ข้อ
                    {p && (
                      <span className="ml-2 text-cs-accent" data-testid={`module-progress-${m.slug}`}>
                        · ตอบแล้ว {p.answered}
                      </span>
                    )}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="exams-heading">
        <h2 id="exams-heading" className="font-display text-xl font-bold text-cs-text mb-4">
          Full-Length Practice
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {exams.map((e) => {
            const p = progress[e.id]
            return (
              <li key={e.id}>
                <Link
                  href={`/player/exam/${e.id}`}
                  data-testid={`exam-link-${e.id}`}
                  className="block rounded-lg border border-cs-border bg-cs-surface p-5 transition-colors hover:border-cs-accent"
                >
                  <p className="font-display font-semibold text-cs-text">{e.title}</p>
                  <p className="mt-1 font-mono text-xs text-cs-muted">
                    {e.mcqCount} MCQ + {e.pbqCount} PBQ · {e.timeLimitMinutes} นาที
                    {p && (
                      <span className="ml-2 text-cs-accent">
                        · {p.status === 'submitted' ? 'ส่งแล้ว' : `ค้างอยู่ (ตอบแล้ว ${p.answered})`}
                      </span>
                    )}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
