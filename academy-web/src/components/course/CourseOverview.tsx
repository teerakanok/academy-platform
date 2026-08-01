'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CourseCopy, CourseStructure, Locale } from '@/lib/content/course-types'
import {
  browserCourseStore,
  emptyProgress,
  loadCourseProgress,
  resetCourse,
  toLearnerState,
  type CourseProgressRecord,
} from '@/lib/course/progress'
import { certificateEligibility } from '@/lib/course/roadmap'
import { EMPTY_STATE, nextNode, summarise } from '@/lib/course/roadmap'
import { courseSkillData } from '@/lib/course/skills'
import { RadarChart } from './RadarChart'
import { RoadmapGraph } from './RoadmapGraph'

export function CourseOverview({
  structure,
  copy,
  locale,
  translatedNodeIds,
}: {
  structure: CourseStructure
  copy: CourseCopy
  locale: Locale
  translatedNodeIds: string[]
}) {
  const [record, setRecord] = useState<CourseProgressRecord>(() => emptyProgress(structure.slug))
  const [corrupt, setCorrupt] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const { record: loadedRecord, corruptReset } = loadCourseProgress(browserCourseStore(), structure.slug)
    setRecord(loadedRecord)
    setCorrupt(corruptReset)
    setLoaded(true)
  }, [structure.slug])

  const state = loaded ? toLearnerState(record) : EMPTY_STATE
  const summary = summarise(structure, state)
  const cert = certificateEligibility(structure, state)
  const skippedBlockers = cert.blocking.filter((b) => b.reason === 'skipped').length
  const next = nextNode(structure, state)
  const skills = courseSkillData(structure, copy.skillLabels, state)
  const untranslated = structure.nodes.length - translatedNodeIds.length

  return (
    <div className="space-y-12">
      <header className="hero-bleed pt-6 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cs-accent-fill px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-on-accent">
            {structure.level}
          </span>
          <span className="font-mono text-[11px] text-cs-muted">
            {Math.floor(structure.estimatedMinutes / 60)}h {structure.estimatedMinutes % 60}m ·{' '}
            {structure.nodes.length} lessons
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs">
            {structure.availableLocales.map((code) => (
              <Link
                key={code}
                href={`/courses/${structure.slug}?lang=${code}`}
                aria-current={code === locale ? 'true' : undefined}
                data-testid={`lang-${code}`}
                className={`rounded-lg px-2.5 py-1 font-mono uppercase transition-colors ${
                  code === locale
                    ? 'bg-cs-accent-fill text-cs-on-accent'
                    : 'border border-cs-border text-cs-muted hover:border-cs-accent hover:text-cs-accent'
                }`}
              >
                {code}
              </Link>
            ))}
          </span>
        </div>

        <h1 className="mt-4 font-display text-[2.75rem] font-semibold leading-[1.06] tracking-tight text-cs-text sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-cs-body">{copy.subtitle}</p>
        <p className="mt-3 max-w-2xl text-sm text-cs-muted">{copy.audience}</p>

        {untranslated > 0 && (
          <p className="mt-4 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-2.5 text-xs text-cs-muted">
            {translatedNodeIds.length} of {structure.nodes.length} lessons are available in{' '}
            <span className="font-mono uppercase">{locale}</span>. The rest open in{' '}
            <span className="font-mono uppercase">{structure.defaultLocale}</span> and are labelled when you get there.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {next && (
            <Link
              href={`/courses/${structure.slug}/lessons/${next.id}`}
              data-testid="start-or-continue"
              className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5"
            >
              {summary.completed + summary.testedOut + summary.skipped > 0 ? 'Continue' : 'Start the first lesson'}
            </Link>
          )}
          {loaded && summary.coveragePercent > 0 && (
            <button
              type="button"
              onClick={() => {
                resetCourse(browserCourseStore(), structure.slug)
                setRecord(emptyProgress(structure.slug))
              }}
              data-testid="reset-course"
              className="rounded-control border border-cs-border bg-cs-surface px-6 py-3 text-sm text-cs-muted transition-colors duration-200 hover:border-cs-amber hover:text-cs-amber"
            >
              Reset my progress
            </button>
          )}
        </div>

        {corrupt && (
          <p role="alert" className="mt-4 rounded-xl border border-cs-amber-border bg-cs-amber-dim px-4 py-2.5 text-sm text-cs-amber">
            Saved progress for this course could not be read and was cleared.
          </p>
        )}
      </header>

      <section className="card p-6" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading" className="font-display text-lg font-semibold text-cs-text">
          What you will be able to do
        </h2>
        <ul className="mt-4 space-y-2.5">
          {copy.outcomes.map((outcome, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-cs-body">
              <span aria-hidden="true" className="mt-0.5 text-cs-accent">
                ✓
              </span>
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="roadmap-heading">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="roadmap-heading" className="font-display text-2xl font-semibold text-cs-text">
            Your route through this course
          </h2>
          <p className="font-mono text-xs text-cs-muted" data-testid="course-summary">
            {summary.completed + summary.testedOut}/{summary.total} proven
            {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}
          </p>
        </div>
        <p className="mb-6 max-w-2xl text-sm text-cs-muted">
          Lessons unlock as you clear what comes before them. You can skip an ordinary lesson and take its summary
          instead — required checkpoints are the exception, and they have to be earned.
        </p>
        <div className="card-feature p-4 sm:p-6">
          <RoadmapGraph
            structure={structure}
            state={state}
            nodeTitles={copy.nodeTitles}
            courseSlug={structure.slug}
          />
        </div>
      </section>

      {/* ใบรับรองการเรียนจบ — แสดงตั้งแต่ยังไม่ได้ เพราะสิ่งที่ผู้เรียนต้องรู้คือ
          "ต้องทำอะไรอีกถึงจะได้" ไม่ใช่รู้ตอนได้แล้ว
          กติกา: ทุกบทต้องพิสูจน์แล้ว การข้ามกั้นใบไว้ แต่ไม่ได้ปิดประตู —
          กลับมาพิสูจน์เมื่อไหร่ก็ได้ ถ้าข้ามครึ่งคอร์สแล้วยังได้ใบ ใบนั้นก็ไม่ได้
          บอกอะไรกับใคร และเราจะเป็นคนแรกที่รู้ */}
      <section
        className={`card-feature p-6 sm:p-7 ${cert.eligible ? 'card-takeaway' : ''}`}
        data-testid="certificate-status"
        data-eligible={cert.eligible}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">
              Certificate of completion
            </p>
            <h2 className="mt-1.5 font-display text-xl font-semibold text-cs-text">
              {cert.eligible ? 'Earned — every lesson proven' : 'Prove every lesson to earn it'}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-cs-accent-fill px-3 py-1 font-mono text-xs font-semibold text-cs-on-accent">
            {cert.provenCount} / {cert.total}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-cs-body">
          {cert.eligible
            ? 'Nothing was skipped and every required checkpoint was earned, so the certificate says something true about you.'
            : skippedBlockers > 0
              ? `A certificate that counted skipped lessons would not mean anything. ${skippedBlockers} skipped ${skippedBlockers === 1 ? 'lesson is' : 'lessons are'} holding it — come back and prove ${skippedBlockers === 1 ? 'it' : 'them'} any time, by reading or by testing out.`
              : 'It is issued once every lesson on your route is proven — either by finishing it or by testing out of it.'}
        </p>
      </section>

      <section className="card-feature p-6">
        <RadarChart data={skills} title="What you have proven in this course" testId="course-radar" />
      </section>
    </div>
  )
}
