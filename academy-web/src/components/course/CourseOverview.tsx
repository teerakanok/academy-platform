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

      {/* ใบรับรอง — บอกว่า "ทำได้ในระดับที่ผ่าน" ไม่ใช่ "นั่งอ่านครบ"
          จึงต้องเขียนโดยนำด้วยสิ่งที่ทำให้ได้ใบ ไม่ใช่สิ่งที่กั้นใบไว้ และต้อง
          ชัดว่า test out นับเท่ากับอ่านจบทุกประการ — คนที่รู้อยู่แล้วไม่ควรถูก
          ทำให้รู้สึกว่ากำลังโดนลงโทษที่รู้มาก่อน */}
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
              {cert.eligible ? 'Earned — you proved all of it' : 'Prove it and it is yours'}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-cs-accent-fill px-3 py-1 font-mono text-xs font-semibold text-cs-on-accent">
            {cert.provenCount} / {cert.total}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-cs-body">
          {cert.eligible
            ? 'It says you can do this, and every lesson behind it has the evidence to back that up.'
            : 'The certificate says you can do this — not that you read every page. Reading a lesson and testing out of it count exactly the same.'}
        </p>
        {!cert.eligible && skippedBlockers > 0 && (
          <p className="mt-3 max-w-2xl text-sm text-cs-body" data-testid="certificate-skipped-note">
            {skippedBlockers === 1 ? 'One lesson you skipped has' : `${skippedBlockers} lessons you skipped have`} no
            evidence yet. If you already know {skippedBlockers === 1 ? 'it' : 'them'}, test out — it takes a few
            questions and counts in full.
          </p>
        )}
        {!cert.eligible && cert.blocking.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {cert.blocking.slice(0, 4).map((b) => (
              <Link
                key={b.id}
                href={`/courses/${structure.slug}/lessons/${b.id}`}
                data-testid={`certificate-blocker-${b.id}`}
                className="rounded-control border border-cs-border bg-cs-surface px-3 py-1.5 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
              >
                {b.reason === 'skipped' ? 'Test out: ' : 'Open: '}
                {copy.nodeTitles[b.id] ?? b.id}
              </Link>
            ))}
            {cert.blocking.length > 4 && (
              <span className="self-center font-mono text-xs text-cs-muted">
                +{cert.blocking.length - 4} more
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card-feature p-6">
        <RadarChart data={skills} title="What you have proven in this course" testId="course-radar" />
      </section>
    </div>
  )
}
