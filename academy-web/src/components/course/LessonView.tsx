'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { CourseNode, CourseStructure, LessonContent, Locale } from '@/lib/content/course-types'
import {
  browserCourseStore,
  emptyProgress,
  loadCourseProgress,
  markCompleted,
  markSkipped,
  markStarted,
  markTestedOut,
  recordVideoCue,
  saveCourseProgress,
  toLearnerState,
  type CourseProgressRecord,
} from '@/lib/course/progress'
import { canSkip, nextNode, nodeStatus } from '@/lib/course/roadmap'
import { CheckpointQuiz } from './CheckpointQuiz'
import { InteractiveVideo } from './InteractiveVideo'
import { LessonBody } from './LessonBody'

type Mode = 'learn' | 'test-out' | 'skipped'

export function LessonView({
  structure,
  node,
  lesson,
  courseTitle,
  nodeTitles,
  servedLocale,
  requestedLocale,
}: {
  structure: CourseStructure
  node: CourseNode
  lesson: LessonContent
  courseTitle: string
  nodeTitles: Record<string, string>
  servedLocale: Locale
  requestedLocale: Locale
}) {
  const router = useRouter()
  const [record, setRecord] = useState<CourseProgressRecord>(() => emptyProgress(structure.slug))
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<Mode>('learn')
  const [done, setDone] = useState<null | 'completed' | 'tested-out' | 'skipped'>(null)
  const [peeking, setPeeking] = useState(false)

  useEffect(() => {
    const store = browserCourseStore()
    const { record: loadedRecord } = loadCourseProgress(store, structure.slug)
    const started = markStarted(loadedRecord, node.id)
    saveCourseProgress(store, started)
    setRecord(started)
    setLoaded(true)
    const status = nodeStatus(node, toLearnerState(started))
    if (status === 'completed') setDone('completed')
    else if (status === 'tested-out') setDone('tested-out')
    else if (status === 'skipped') setDone('skipped')
  }, [structure.slug, node])

  function persist(next: CourseProgressRecord) {
    saveCourseProgress(browserCourseStore(), next)
    setRecord(next)
  }

  const learnerState = toLearnerState(record)
  const upcoming = loaded ? nextNode(structure, learnerState) : null
  const isCapstone = node.kind === 'capstone'
  const nodeIndex = structure.nodes.findIndex((n) => n.id === node.id)
  const position = nodeIndex + 1
  const prevNode = nodeIndex > 0 ? structure.nodes[nodeIndex - 1] : null
  const followingNode = nodeIndex < structure.nodes.length - 1 ? structure.nodes[nodeIndex + 1] : null

  function finishLesson(results: Record<string, boolean>) {
    persist(markCompleted(record, node.id, results))
    setDone('completed')
  }

  function finishTestOut(results: Record<string, boolean>) {
    persist(markTestedOut(record, node.id, results))
    setDone('tested-out')
  }

  function skipLesson() {
    persist(markSkipped(record, node.id))
    setDone('skipped')
    setMode('skipped')
  }

  function goNext() {
    const store = browserCourseStore()
    const { record: fresh } = loadCourseProgress(store, structure.slug)
    const target = nextNode(structure, toLearnerState(fresh))
    router.push(target ? `/courses/${structure.slug}/lessons/${target.id}` : `/courses/${structure.slug}`)
  }

  return (
    <article className="space-y-8">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-cs-muted">
        <Link href="/dashboard" className="hover:text-cs-accent">
          My learning
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/courses/${structure.slug}`} className="hover:text-cs-accent">
          {courseTitle}
        </Link>
      </nav>

      <header className="hero-bleed pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">
            Lesson {position} of {structure.nodes.length}
          </span>
          <span className="font-mono text-[11px] text-cs-muted">· about {node.estimatedMinutes} minutes</span>
          {isCapstone && (
            <span className="rounded-full border-2 border-cs-accent px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-accent">
              Required checkpoint
            </span>
          )}
          {done && (
            <span
              data-testid="lesson-status"
              className="rounded-full bg-cs-accent-fill px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-cs-on-accent"
            >
              {done === 'completed' ? 'Done' : done === 'tested-out' ? 'Proven' : 'Skipped'}
            </span>
          )}
        </div>

        <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-cs-text">
          {lesson.title}
        </h1>

        {/* objective คือคำสัญญาของบท ไม่ใช่คำอธิบายประกอบ — ให้มันมีน้ำหนักจริง */}
        <p className="mt-4 border-l-2 border-cs-accent pl-4 text-lg leading-relaxed text-cs-body">
          {lesson.objective}
        </p>

        {/* แถบตำแหน่ง: ผู้เรียนต้องรู้เสมอว่าอยู่จุดไหนของเส้นทาง ไม่ใช่อยู่ในอุโมงค์ */}
        <ol className="mt-4 flex flex-wrap items-center gap-x-1.5" aria-label="Course progress">
          {structure.nodes.map((n) => {
            const status = nodeStatus(n, learnerState)
            const isCurrent = n.id === node.id
            const isProven = status === 'completed' || status === 'tested-out'
            return (
              <li key={n.id}>
                <Link
                  href={`/courses/${structure.slug}/lessons/${n.id}`}
                  aria-label={`${nodeTitles[n.id] ?? n.id}${isCurrent ? ' (current)' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  // แถบสูง 6px กดด้วยเมาส์ได้ แต่นิ้วกดไม่โดน — ขยายพื้นที่กดด้วย
                  // padding แนวตั้ง โดยที่เส้นยังบางเท่าเดิม (ไม่ทำให้ดีไซน์หนาขึ้น)
                  className="group flex items-center py-2.5"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${
                      isCurrent
                        ? 'w-10 bg-cs-accent-fill'
                        : isProven
                          ? 'w-5 bg-cs-accent-fill/70 group-hover:w-7'
                          : status === 'skipped'
                            ? 'w-5 bg-cs-border-2/60 group-hover:w-7'
                            : 'w-5 bg-cs-border-2/40 group-hover:w-7'
                    }`}
                  />
                </Link>
              </li>
            )
          })}
        </ol>

        {servedLocale !== requestedLocale && (
          <p className="mt-4 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-2.5 text-xs text-cs-muted">
            This lesson is not translated into <span className="font-mono uppercase">{requestedLocale}</span> yet, so
            you are reading the <span className="font-mono uppercase">{servedLocale}</span> version.
          </p>
        )}
      </header>

      {mode === 'learn' && !done && canSkip(node) && (
        <div className="rounded-control border border-cs-border bg-cs-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-cs-muted">Already know this?</p>
            {/* ต้องเห็นสาระของบทก่อนถึงจะตัดสินได้จริง — ชื่อบทกับหนึ่งประโยค
                ไม่พอให้ใครบอกได้ว่าตัวเองรู้แล้วหรือยัง */}
            <button
              type="button"
              onClick={() => setPeeking((v) => !v)}
              data-testid="peek-key-ideas"
              aria-expanded={peeking}
              className="rounded-control px-2 py-1 text-sm font-medium text-cs-accent underline underline-offset-4 transition-colors hover:text-cs-text"
            >
              {peeking ? 'Hide what it covers' : 'See what it covers'}
            </button>
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('test-out')}
                data-testid="test-out"
                className="rounded-control border-2 border-cs-accent bg-cs-surface px-4 py-2 text-sm font-medium text-cs-accent transition-colors hover:bg-cs-accent-dim"
              >
                Prove it and move on
              </button>
              <button
                type="button"
                onClick={skipLesson}
                data-testid="skip-lesson"
                className="rounded-control border border-cs-border px-4 py-2 text-sm text-cs-muted transition-colors hover:border-cs-border-2 hover:text-cs-body"
              >
                Skip with the summary
              </button>
            </span>
          </div>

          {peeking && (
            <ul className="mt-3 space-y-1.5 border-t border-cs-border pt-3" data-testid="key-ideas-peek">
              {lesson.cheatsheet.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-cs-body">
                  <span aria-hidden="true" className="mt-0.5 font-mono text-cs-accent">
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'test-out' && (
        <div className="card border-cs-accent-2-border p-4">
          <p className="text-sm text-cs-body">
            Answer every question correctly and this lesson is marked as proven — no need to read it. Get one wrong and
            it stays open for you.
          </p>
          <button
            type="button"
            onClick={() => setMode('learn')}
            className="mt-3 text-sm text-cs-muted underline underline-offset-4 hover:text-cs-accent"
          >
            Read the lesson instead
          </button>
        </div>
      )}

      {mode === 'learn' && node.video && lesson.videoCueQuestions && lesson.videoCueQuestions.length > 0 && (
        <InteractiveVideo
          video={node.video}
          questions={lesson.videoCueQuestions}
          answeredCueIds={Object.keys(record.videoCueResults[node.id] ?? {})}
          onCueAnswered={(cueId, correct) => persist(recordVideoCue(record, node.id, cueId, correct))}
        />
      )}

      {mode === 'learn' && (
        <>
          <LessonBody blocks={lesson.blocks} />
          {lesson.attribution && (
            <p className="prose-lesson border-t border-cs-border pt-4 text-xs text-cs-muted">
              {lesson.attribution}
            </p>
          )}

          {/* จังหวะปิดการอ่าน: สรุปสิ่งที่เพิ่งอ่านก่อนจะเจอคำถาม
              เดิมอ่านจบแล้วเจอ quiz ทันทีซึ่งกระโดดเกินไป และไม่มีโอกาสทบทวน */}
          {!done && (
            <section className="mt-14 rounded-feature border border-cs-accent-border bg-cs-accent-dim p-6 sm:p-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">
                That is the lesson
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-cs-text">Key ideas to keep</h2>
              <ul className="mt-4 space-y-2">
                {lesson.cheatsheet.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-cs-body">
                    <span aria-hidden="true" className="mt-0.5 font-mono text-cs-accent">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-cs-accent-border pt-4 text-sm text-cs-muted">
                When you are ready, a few questions below confirm it stuck.
              </p>
            </section>
          )}
        </>
      )}

      {(mode === 'skipped' || done) && (
        <section className="card-feature p-6 sm:p-8" data-testid="cheatsheet">
          <h2 className="font-display text-lg font-semibold text-cs-text">
            {done === 'skipped' ? 'The summary you skipped to' : 'Keep this'}
          </h2>
          <ul className="mt-4 space-y-2">
            {lesson.cheatsheet.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-cs-body">
                <span aria-hidden="true" className="mt-0.5 font-mono text-cs-accent">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!done && (mode === 'learn' || mode === 'test-out') && (
        <div className="pt-2">
        <CheckpointQuiz
          questions={lesson.checkpoint}
          requireAllCorrect={mode === 'test-out' || isCapstone}
          onPassed={mode === 'test-out' ? finishTestOut : finishLesson}
        />
        </div>
      )}

      {done && (
        <div className="card-feature hero-wash flex flex-wrap items-center gap-3 p-6 sm:p-7" data-testid="lesson-complete">
          <p className="text-sm text-cs-body">
            {done === 'skipped'
              ? 'Marked as skipped. It stays on your map as unproven, and you can come back any time.'
              : done === 'tested-out'
                ? 'Marked as proven. It shows on your map as tested out.'
                : 'Lesson complete.'}
          </p>
          <div className="ml-auto flex gap-2">
            <Link
              href={`/courses/${structure.slug}`}
              className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm transition-colors duration-200 hover:border-cs-accent hover:text-cs-accent"
            >
              Back to the map
            </Link>
            {upcoming && upcoming.id !== node.id && (
              <button
                type="button"
                onClick={goNext}
                data-testid="next-lesson"
                className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              >
                Next: {nodeTitles[upcoming.id] ?? upcoming.id}
              </button>
            )}
          </div>
        </div>
      )}
      <nav
        aria-label="Lesson navigation"
        className="flex items-center justify-between gap-3 border-t border-cs-border pt-6"
      >
        {prevNode ? (
          <Link
            href={`/courses/${structure.slug}/lessons/${prevNode.id}`}
            className="group min-w-0 rounded-control border border-cs-border bg-cs-surface px-4 py-3 text-left transition-colors hover:border-cs-accent"
          >
            <span className="block font-mono text-[10px] uppercase tracking-wide text-cs-muted">Previous</span>
            <span className="mt-0.5 block truncate text-sm text-cs-text group-hover:text-cs-accent">
              {nodeTitles[prevNode.id] ?? prevNode.id}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {followingNode && (
          <Link
            href={`/courses/${structure.slug}/lessons/${followingNode.id}`}
            className="group min-w-0 rounded-control border border-cs-border bg-cs-surface px-4 py-3 text-right transition-colors hover:border-cs-accent"
          >
            <span className="block font-mono text-[10px] uppercase tracking-wide text-cs-muted">Next in course</span>
            <span className="mt-0.5 block truncate text-sm text-cs-text group-hover:text-cs-accent">
              {nodeTitles[followingNode.id] ?? followingNode.id}
            </span>
          </Link>
        )}
      </nav>
    </article>
  )
}
