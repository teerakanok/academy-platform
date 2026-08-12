'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Locale, PublicCourseCopy, PublicCourseStructure } from '@/lib/content/course-types'
import { isEmptyCourseProgress, toLearnerState, type CourseProgressRecord } from '@/lib/course/progress'
import { fetchProgress } from '@/lib/course/progress-client'
import { fetchCourseSkillMap } from '@/lib/course/skill-map-client'
import type { SkillDatum } from '@/lib/course/skills'
import { skillMapPresentation, type SkillMapState } from '@/lib/course/skill-map-state'
import { courseRecordSummary } from '@/lib/course/roadmap'
import { EMPTY_STATE, nextNode, summarise } from '@/lib/course/roadmap'
import { UI } from '@/lib/i18n/ui'
import { learnerCourseUi } from '@/lib/i18n/learner-course'
import { RoadmapGraph } from './RoadmapGraph'
import { ResetCourseProgress } from './ResetCourseProgress'
import { courseStepCounts } from '@/lib/content/course-step-summary'
import { CourseSkillMap, courseSkillMapCopy } from './CourseSkillMap'

export function CourseOverview({
  structure,
  copy,
  locale,
  translatedNodeIds,
  learnerRoute = false,
}: {
  structure: PublicCourseStructure
  copy: PublicCourseCopy
  locale: Locale
  translatedNodeIds: string[]
  learnerRoute?: boolean
}) {
  const text = learnerCourseUi(locale)
  const ui = UI[locale]
  const [record, setRecord] = useState<CourseProgressRecord | null>(null)
  const [skillCoverage, setSkillCoverage] = useState<SkillDatum[] | null>(null)
  const [skillMapState, setSkillMapState] = useState<SkillMapState>('idle')
  const [loaded, setLoaded] = useState(false)
  const [accessIssue, setAccessIssue] = useState<
    'signed-out' | 'access-lost' | 'unavailable' | 'reset-completed-unavailable' | null
  >(null)
  const [reload, setReload] = useState(0)
  const courseTitleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    setRecord(null)
    setSkillCoverage(null)
    setSkillMapState('idle')
    setAccessIssue(null)
    fetchProgress(structure.slug).then((result) => {
      if (!alive) return
      if (result.ok) {
        setRecord(result.record)
      } else setAccessIssue(result.reason)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [structure.slug, locale, learnerRoute, reload])

  useEffect(() => {
    if (!learnerRoute || !record || accessIssue) return
    let alive = true
    setSkillMapState('loading')
    setSkillCoverage(null)
    fetchCourseSkillMap(structure.slug, locale).then((result) => {
      if (!alive) return
      if (result.ok) {
        setSkillCoverage(result.coverage)
        setSkillMapState('ready')
      } else if (result.reason === 'signed-out' || result.reason === 'access-lost') {
        setRecord(null)
        setAccessIssue(result.reason)
        setSkillMapState('idle')
      } else {
        setSkillMapState('unavailable')
      }
    })
    return () => {
      alive = false
    }
  }, [learnerRoute, record, accessIssue, structure.slug, locale, reload])

  const state = record ? toLearnerState(record) : EMPTY_STATE
  const summary = summarise(structure, state)
  const recordSummary = courseRecordSummary(structure, state)
  const skippedBlockers = recordSummary.blocking.filter((b) => b.reason === 'skipped').length
  const next = nextNode(structure, state)
  const untranslated = structure.nodes.length - translatedNodeIds.length
  const { lessonCount, checkpointCount } = courseStepCounts(structure)
  const skillMapView = skillMapPresentation({
    learnerRoute,
    state: skillMapState,
    coverage: skillCoverage,
    accessConfirmed: Boolean(record) && !accessIssue,
  })

  return (
    <div className="space-y-12">
      <header className="hero-bleed pt-6 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cs-accent-fill px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-on-accent">
            {ui.courses.level[structure.level]}
          </span>
          <span className="font-mono text-[11px] text-cs-muted">
            {text.timeSummary(
              Math.floor(structure.estimatedMinutes / 60),
              structure.estimatedMinutes % 60,
              lessonCount,
              checkpointCount,
            )}
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs">
            {structure.availableLocales.map((code) => (
              <Link
                key={code}
                href={learnerRoute ? `/courses/${structure.slug}/learn?lang=${code}` : `/courses/${structure.slug}/${code}`}
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

        <h1
          ref={courseTitleRef}
          tabIndex={-1}
          data-testid="course-title"
          className="mt-4 font-display text-[2.75rem] font-semibold leading-[1.06] tracking-tight text-cs-text outline-none sm:text-5xl"
        >
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-cs-body">{copy.subtitle}</p>
        <p className="mt-3 max-w-2xl text-sm text-cs-muted">{copy.audience}</p>

        {untranslated > 0 && (
          <p className="mt-4 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-2.5 text-xs text-cs-muted">
            {text.untranslated(translatedNodeIds.length, structure.nodes.length, locale, structure.defaultLocale)}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {record && next && !accessIssue && (
            <Link
              href={`/courses/${structure.slug}/lessons/${next.id}?lang=${locale}`}
              data-testid="start-or-continue"
              className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5"
            >
              {summary.completed + summary.testedOut + summary.skipped > 0 ? text.continue : text.start}
            </Link>
          )}
          {loaded && record && !accessIssue && (
            <ResetCourseProgress
              slug={structure.slug}
              locale={locale}
              canReset={!isEmptyCourseProgress(record)}
              returnFocusRef={courseTitleRef}
              onRecord={(nextRecord) => {
                setRecord(nextRecord)
                setSkillCoverage(null)
                setSkillMapState('idle')
                setReload((value) => value + 1)
              }}
              onInvalidated={(reason) => {
                setRecord(null)
                setSkillCoverage(null)
                setSkillMapState('idle')
                setLoaded(true)
                setAccessIssue(reason)
              }}
            />
          )}
        </div>

        {accessIssue && (
          <div
            role="alert"
            className="mt-4 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body"
            data-testid="course-access-lost"
          >
            <p>
              {text.accessIssue[accessIssue]}
            </p>
            {(accessIssue === 'unavailable' || accessIssue === 'reset-completed-unavailable') && (
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
                className="mt-3 rounded-control border border-cs-border bg-cs-surface px-4 py-2 text-sm hover:border-cs-accent"
                data-testid="course-access-retry"
              >
                {text.retry}
              </button>
            )}
          </div>
        )}
      </header>

      <section className="card p-6" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading" className="font-display text-lg font-semibold text-cs-text">
          {text.outcomesHeading}
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

      {!record && (
        <section
          className="border-l-2 border-cs-border py-3 pl-4 text-sm text-cs-body"
          data-testid={loaded ? 'course-progress-unconfirmed' : 'course-progress-loading'}
          aria-live="polite"
        >
          {loaded ? text.progressUnconfirmed : text.progressLoading}
        </section>
      )}

      {record && (
        <div className="space-y-12" data-testid="course-progress-content">
          <section aria-labelledby="roadmap-heading">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="roadmap-heading" className="font-display text-2xl font-semibold text-cs-text">
                {text.roadmapHeading}
              </h2>
              {/* ⚠️ เดิมเขียนว่า "proven" ซึ่งไม่จริงตั้งแต่ W0-3 — ตัวเลขนี้นับบทที่เดิน
              ผ่านแล้ว (รวมบทปกติที่ไล่ลองจนผ่านได้) · คำว่าพิสูจน์แล้วสงวนไว้ให้
              ด่านวัดผลบนการ์ดใบรับรองเท่านั้น */}
              <p className="font-mono text-xs text-cs-muted" data-testid="course-summary">
                {text.roadmapSummary(
                  summary.completed + summary.testedOut,
                  summary.total,
                  summary.skipped,
                )}
              </p>
            </div>
            <p className="mb-6 max-w-2xl text-sm text-cs-muted">
              {text.roadmapIntro}
            </p>
            <div className="card-feature p-4 sm:p-6">
              {accessIssue ? (
                <p className="text-sm text-cs-body">
                  {text.roadmapUnavailable}
                </p>
              ) : (
                <RoadmapGraph
                  structure={structure}
                  state={state}
                  nodeTitles={copy.nodeTitles}
                  courseSlug={structure.slug}
                  locale={locale}
                />
              )}
            </div>
          </section>

          {skillMapView === 'loading' && (
            <section className="border-l-2 border-cs-border py-3 pl-4 text-sm text-cs-body" role="status" aria-live="polite" data-testid="course-skill-map-loading">
              {courseSkillMapCopy(locale).loading}
            </section>
          )}

          {skillMapView === 'unavailable' && (
            <section className="border-l-2 border-cs-amber py-3 pl-4 text-sm text-cs-body" role="status" aria-live="polite" data-testid="course-skill-map-unavailable">
              <p>{courseSkillMapCopy(locale).unavailable}</p>
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
                className="mt-3 rounded-control border border-cs-border bg-cs-surface px-4 py-2 text-sm hover:border-cs-accent"
              >
                {courseSkillMapCopy(locale).retry}
              </button>
            </section>
          )}

          {skillMapView === 'ready' && skillCoverage && (
            <CourseSkillMap coverage={skillCoverage} locale={locale} />
          )}

          {/* ใบรับรอง — บอกว่า "ทำได้ในระดับที่ผ่าน" ไม่ใช่ "นั่งอ่านครบ"
          จึงต้องเขียนโดยนำด้วยสิ่งที่ทำให้ได้ใบ ไม่ใช่สิ่งที่กั้นใบไว้

          ⚠️ W0-3: ห้ามเขียนว่าบทปกติเป็นการวัดผล — สิ่งที่ใบรับรองอ้างถึงคือ
          **ด่านวัดผล (capstone)** เท่านั้น การเดินครบทุกบทเป็นเงื่อนไขความคืบหน้า
          ไม่ใช่หลักฐาน · เขียนตามจริงเสมอ ผู้เรียนจะได้รู้ว่าใบนี้ยืนยันอะไรจริงๆ */}
          <section
            className={`card-feature p-6 sm:p-7 ${recordSummary.recordComplete ? 'card-takeaway' : ''}`}
            data-testid="certificate-status"
            data-record-complete={recordSummary.recordComplete}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">
                  {text.learningRecord}
                </p>
                <h2 className="mt-1.5 font-display text-xl font-semibold text-cs-text">
                  {text.recordHeading(recordSummary.recordComplete)}
                </h2>
              </div>
              {/* คอร์สที่ยังไม่มีด่านวัดผลเลยต้องไม่โชว์ "0 / 0 checkpoints" ซึ่งอ่านแล้ว
              เหมือนผู้เรียนทำอะไรผิด ทั้งที่เป็นเรื่องของตัวคอร์สเอง */}
              {recordSummary.assessedTotal > 0 && (
                <span
                  className="shrink-0 rounded-full bg-cs-accent-fill px-3 py-1 font-mono text-xs font-semibold text-cs-on-accent"
                  data-testid="certificate-assessed-count"
                >
                  {text.checkpointCount(recordSummary.assessedPassed, recordSummary.assessedTotal)}
                </span>
              )}
            </div>
            <p className="mt-3 max-w-2xl text-sm text-cs-body">
              {text.recordBody(recordSummary.recordComplete)}
            </p>
            {recordSummary.courseIssue === 'no-assessment' && (
              // ปัญหาของคอร์ส ไม่ใช่ของผู้เรียน — บอกตามจริงและไม่ทำเป็นลิงก์ไปไหน
              <p className="mt-3 max-w-2xl text-sm text-cs-body" data-testid="certificate-no-assessment">
                {text.noAssessment}
              </p>
            )}
            <p className="mt-2 max-w-2xl text-xs text-cs-muted" data-testid="certificate-availability-note">
              {text.certificatePreview(recordSummary.recordComplete)}
            </p>
            <p className="mt-2 max-w-2xl text-xs text-cs-muted" data-testid="certificate-progress-note">
              {text.lessonsFinished(recordSummary.lessonsFinished, recordSummary.total)}
            </p>
            {!recordSummary.recordComplete && skippedBlockers > 0 && (
              <p className="mt-3 max-w-2xl text-sm text-cs-body" data-testid="certificate-skipped-note">
                {/* ⚠️ ห้ามชวนไป "test out" — ปิดอยู่ทั้งคอร์สจนกว่าจะมีคลังข้อแยก
                (assessment-policy) · ข้อความที่ชี้ไปยังทางที่ไม่มีอยู่จริงคือการ
                ส่งผู้เรียนไปชนกำแพง */}
                {text.skippedBlockers(skippedBlockers)}
              </p>
            )}
            {!accessIssue && !recordSummary.recordComplete && recordSummary.blocking.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {recordSummary.blocking.slice(0, 4).map((b) => (
                  <Link
                    key={b.id}
                    href={`/courses/${structure.slug}/lessons/${b.id}?lang=${locale}`}
                    data-testid={`certificate-blocker-${b.id}`}
                    className="rounded-control border border-cs-border bg-cs-surface px-3 py-1.5 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
                  >
                    {text.openBlocker}
                    {copy.nodeTitles[b.id] ?? b.id}
                  </Link>
                ))}
                {recordSummary.blocking.length > 4 && (
                  <span className="self-center font-mono text-xs text-cs-muted">
                    {text.moreBlockers(recordSummary.blocking.length - 4)}
                  </span>
                )}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
