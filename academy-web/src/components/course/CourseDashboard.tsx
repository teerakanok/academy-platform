'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CourseStructure } from '@/lib/content/course-types'
import {
  browserCourseStore,
  loadCourseProgress,
  toLearnerState,
  type CourseProgressRecord,
} from '@/lib/course/progress'
import { EMPTY_STATE, nextNode, summarise, type LearnerCourseState } from '@/lib/course/roadmap'
import { globalSkillData } from '@/lib/course/skills'
import { RadarChart } from './RadarChart'

export interface DashboardCourse {
  structure: CourseStructure
  title: string
  subtitle: string
  level: string
  nodeTitles: Record<string, string>
}

export function CourseDashboard({ courses }: { courses: DashboardCourse[] }) {
  const [progress, setProgress] = useState<Record<string, CourseProgressRecord>>({})
  const [corrupt, setCorrupt] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const store = browserCourseStore()
    const next: Record<string, CourseProgressRecord> = {}
    let sawCorrupt = false
    for (const course of courses) {
      const { record, corruptReset } = loadCourseProgress(store, course.structure.slug)
      next[course.structure.slug] = record
      sawCorrupt = sawCorrupt || corruptReset
    }
    setProgress(next)
    setCorrupt(sawCorrupt)
    setLoaded(true)
  }, [courses])

  function stateFor(slug: string): LearnerCourseState {
    const record = progress[slug]
    return record ? toLearnerState(record) : EMPTY_STATE
  }

  const started = courses
    .map((course) => ({ course, record: progress[course.structure.slug] }))
    .filter((entry) => entry.record && entry.record.lastNodeId !== null)
    .sort((a, b) => (b.record?.updatedAt ?? 0) - (a.record?.updatedAt ?? 0))

  const resume = started[0]
  const resumeNode = resume ? nextNode(resume.course.structure, stateFor(resume.course.structure.slug)) : null

  const globalData = globalSkillData(
    courses.map((course) => ({ structure: course.structure, state: stateFor(course.structure.slug) })),
  )

  return (
    <div className="space-y-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">My learning</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-cs-text">
          {resume ? 'Pick up where you left off' : 'Start something today'}
        </h1>
        <p className="mt-2 max-w-2xl text-cs-body">
          Your progress is saved in this browser. Sign-in and cross-device sync arrive with learner accounts.
        </p>
      </header>

      {corrupt && (
        <p role="alert" className="rounded-2xl border border-cs-amber-border bg-cs-amber-dim px-5 py-3 text-sm text-cs-amber">
          Saved progress for one of your courses could not be read and was cleared. Nothing else was affected.
        </p>
      )}

      {resume && resumeNode && (
        <section className="card p-6" data-testid="resume-card">
          <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">Continue</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold text-cs-text">
            {resume.course.nodeTitles[resumeNode.id] ?? resumeNode.id}
          </h2>
          <p className="mt-1 text-sm text-cs-muted">
            {resume.course.title} · about {resumeNode.estimatedMinutes} minutes
          </p>
          <Link
            href={`/courses/${resume.course.structure.slug}/lessons/${resumeNode.id}`}
            className="mt-4 inline-flex rounded-xl bg-cs-accent px-5 py-2.5 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90"
          >
            Continue lesson
          </Link>
        </section>
      )}

      <section aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="mb-4 font-display text-2xl font-semibold text-cs-text">
          Courses
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {courses.map((course) => {
            const state = stateFor(course.structure.slug)
            const summary = summarise(course.structure, state)
            return (
              <li key={course.structure.slug}>
                <Link
                  href={`/courses/${course.structure.slug}`}
                  className="card-interactive block h-full p-6"
                  data-testid={`course-card-${course.structure.slug}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-cs-accent-border bg-cs-accent-dim px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cs-accent">
                      {course.level}
                    </span>
                    <span className="font-mono text-[11px] text-cs-muted">
                      {Math.round(course.structure.estimatedMinutes / 60)}h · {course.structure.nodes.length} lessons
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold text-cs-text">{course.title}</h3>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-cs-body">{course.subtitle}</p>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs text-cs-muted">
                      <span data-testid={`course-progress-${course.structure.slug}`}>
                        {loaded ? `${summary.provenPercent}% proven` : '—'}
                      </span>
                      {summary.skipped > 0 && <span>{summary.skipped} skipped</span>}
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cs-surface-2"
                      role="progressbar"
                      aria-valuenow={summary.provenPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${course.title} progress`}
                    >
                      <div
                        className="h-full rounded-full bg-cs-accent transition-[width] duration-500"
                        style={{ width: `${summary.provenPercent}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card p-6" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="sr-only">
          Skill map
        </h2>
        <RadarChart
          data={globalData}
          title="Your skill map across everything"
          accent="accent-2"
          testId="global-radar"
        />
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold text-cs-text">Practice banks</h2>
        <p className="mt-1.5 text-sm text-cs-body">
          Timed practice tests and question banks, separate from the courses.
        </p>
        <Link
          href="/player"
          className="mt-4 inline-flex rounded-xl border border-cs-border px-5 py-2.5 text-sm transition-colors hover:border-cs-accent hover:text-cs-accent"
        >
          Open practice
        </Link>
      </section>
    </div>
  )
}
