'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CourseStructure } from '@/lib/content/course-types'
import {
  emptyProgress,
  toLearnerState,
  type CourseProgressRecord,
} from '@/lib/course/progress'
import {
  EMPTY_STATE,
  nextNode,
  nodeStatus,
  summarise,
  type LearnerCourseState,
} from '@/lib/course/roadmap'
import { globalSkillData } from '@/lib/course/skills'
import { CourseCover } from './CourseCover'
import { RadarChart } from './RadarChart'

// ความคืบหน้าเป็น "จุดต่อบทเรียน" ไม่ใช่แถบ — แถบที่ 0% คือเส้นจางที่มองไม่เห็น
// และไม่บอกอะไรเลย ส่วนจุดบอกได้ทันทีว่าคอร์สยาวแค่ไหนและเดินไปถึงไหน
// คอร์สที่ยาวมากกลับไปใช้แถบ เพราะจุด 50 จุดอ่านไม่ออก
const MAX_DOTS = 12

function LessonProgress({
  structure,
  state,
  loaded,
  label,
  testId,
  provenPercent,
  skipped,
}: {
  structure: DashboardCourse['structure']
  state: LearnerCourseState
  loaded: boolean
  label: string
  testId: string
  provenPercent: number
  skipped: number
}) {
  const useDots = structure.nodes.length <= MAX_DOTS

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-cs-text" data-testid={testId}>
          {!loaded ? '—' : provenPercent > 0 ? `${provenPercent}% proven` : 'Not started yet'}
        </span>
        {skipped > 0 && <span className="text-cs-muted">{skipped} skipped</span>}
      </div>

      {useDots ? (
        <ul
          className="flex flex-wrap gap-1 sm:gap-1.5"
          role="progressbar"
          aria-valuenow={provenPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress`}
        >
          {structure.nodes.map((node) => {
            const status = nodeStatus(node, state)
            const isProven = status === 'completed' || status === 'tested-out'
            const isSkipped = status === 'skipped'
            return (
              <li
                key={node.id}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  isProven
                    ? 'bg-cs-accent-fill'
                    : isSkipped
                      ? 'border border-dashed border-cs-border-2 bg-transparent'
                      : 'bg-cs-border-2/70'
                }`}
              />
            )
          })}
        </ul>
      ) : (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-cs-surface-sunken"
          role="progressbar"
          aria-valuenow={provenPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress`}
        >
          <div
            className="h-full rounded-full bg-cs-accent-fill transition-[width] duration-500"
            style={{ width: `${provenPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}

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
    let alive = true
    // ดึงทุกคอร์สในครั้งเดียว — ยิงทีละคอร์สทำให้ dashboard ช้าขึ้นตามจำนวนคอร์ส
    fetch('/api/progress', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { ok: boolean; records?: Record<string, CourseProgressRecord> }) => {
        if (!alive) return
        const next: Record<string, CourseProgressRecord> = {}
        for (const course of courses) {
          next[course.structure.slug] = body.records?.[course.structure.slug] ?? emptyProgress(course.structure.slug)
        }
        setProgress(next)
        setCorrupt(false)
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
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
      <header className="hero-bleed pb-2">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">My learning</p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-cs-text sm:text-5xl">
          {resume ? 'Pick up where you left off' : 'Start something today'}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-cs-body">
          Your progress is saved in this browser. Sign-in and cross-device sync arrive with learner accounts.
        </p>
      </header>

      {corrupt && (
        <p role="alert" className="rounded-2xl border border-cs-amber-border bg-cs-amber-dim px-5 py-3 text-sm text-cs-amber">
          Saved progress for one of your courses could not be read and was cleared. Nothing else was affected.
        </p>
      )}

      {resume && resumeNode && (
        <section
          className="card-feature hero-wash relative overflow-hidden p-6 sm:p-8"
          data-testid="resume-card"
        >
          <div className="relative flex flex-col items-stretch gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">Continue</p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-snug text-cs-text sm:text-3xl">
                {resume.course.nodeTitles[resumeNode.id] ?? resumeNode.id}
              </h2>
              <p className="mt-2 text-sm text-cs-muted">
                {resume.course.title} · about {resumeNode.estimatedMinutes} minutes
              </p>
            </div>
            <Link
              href={`/courses/${resume.course.structure.slug}/lessons/${resumeNode.id}`}
              className="shrink-0 rounded-control bg-cs-accent-fill px-6 py-3 text-center text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5 sm:text-left"
            >
              Continue lesson
            </Link>
          </div>
        </section>
      )}

      <section aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="mb-4 font-display text-2xl font-semibold text-cs-text">
          Courses
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const state = stateFor(course.structure.slug)
            const summary = summarise(course.structure, state)
            return (
              // min-w-0: grid item มี min-width:auto เป็นค่าตั้งต้น จึงหดต่ำกว่าขนาด
              // เนื้อหาของตัวเองไม่ได้ — SVG ในปกมีขนาดในตัว การ์ดเลยกว้างเกินจอมือถือ
              // แล้วดันทั้งหน้าให้เลื่อนซ้ายขวาได้ (gate มือถือจับได้)
              <li key={course.structure.slug} className="min-w-0">
                <Link
                  href={`/courses/${course.structure.slug}`}
                  className="card-feature card-interactive group block h-full overflow-hidden"
                  data-testid={`course-card-${course.structure.slug}`}
                >
                  {/* ปก = แผนที่จริงของคอร์สนี้ ต่างกันทุกคอร์สโดยไม่ต้องมีคนวาด */}
                  <CourseCover
                    structure={course.structure}
                    state={state}
                    className="h-32 border-b border-cs-border transition-transform duration-300 group-hover:scale-[1.03] md:h-[152px]"
                  />

                  <div className="p-6">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-cs-accent-fill px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-on-accent">
                        {course.level}
                      </span>
                      <span className="font-mono text-[11px] text-cs-muted">
                        {Math.round(course.structure.estimatedMinutes / 60)}h · {course.structure.nodes.length} lessons
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-xl font-semibold leading-snug text-cs-text">
                      {course.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-cs-body">{course.subtitle}</p>

                    <div className="mt-5 border-t border-cs-border pt-4">
                      <LessonProgress
                        structure={course.structure}
                        state={state}
                        loaded={loaded}
                        label={course.title}
                        testId={`course-progress-${course.structure.slug}`}
                        provenPercent={summary.provenPercent}
                        skipped={summary.skipped}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card-feature p-6 sm:p-8" aria-labelledby="skills-heading">
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

      <section className="surface-sunken rounded-feature border border-cs-border p-6">
        <h2 className="font-display text-lg font-semibold text-cs-text">Practice banks</h2>
        <p className="mt-1.5 text-sm text-cs-body">
          Timed practice tests and question banks, separate from the courses.
        </p>
        <Link
          href="/player"
          className="mt-4 inline-flex rounded-control border border-cs-border bg-cs-surface px-5 py-2.5 text-sm transition-colors hover:border-cs-accent hover:text-cs-accent"
        >
          Open practice
        </Link>
      </section>
    </div>
  )
}
