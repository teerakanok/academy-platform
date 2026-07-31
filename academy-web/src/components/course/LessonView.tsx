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

  const upcoming = loaded ? nextNode(structure, toLearnerState(record)) : null
  const isCapstone = node.kind === 'capstone'

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

      <header>
        <div className="flex flex-wrap items-center gap-2">
          {isCapstone && (
            <span className="rounded-full border border-cs-accent-2-border bg-cs-accent-2-dim px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cs-accent-2">
              Required checkpoint
            </span>
          )}
          <span className="font-mono text-[11px] text-cs-muted">about {node.estimatedMinutes} minutes</span>
          {done && (
            <span
              data-testid="lesson-status"
              className="rounded-full border border-cs-accent-border bg-cs-accent-dim px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cs-accent"
            >
              {done === 'completed' ? 'Done' : done === 'tested-out' ? 'Proven' : 'Skipped'}
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-cs-text">
          {lesson.title}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-cs-body">{lesson.objective}</p>

        {servedLocale !== requestedLocale && (
          <p className="mt-4 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-2.5 text-xs text-cs-muted">
            This lesson is not translated into <span className="font-mono uppercase">{requestedLocale}</span> yet, so
            you are reading the <span className="font-mono uppercase">{servedLocale}</span> version.
          </p>
        )}
      </header>

      {mode === 'learn' && !done && canSkip(node) && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm text-cs-body">Already know this?</p>
          <button
            type="button"
            onClick={() => setMode('test-out')}
            data-testid="test-out"
            className="rounded-xl border border-cs-accent-2-border bg-cs-accent-2-dim px-4 py-2 text-sm font-medium text-cs-accent-2 transition-colors hover:opacity-90"
          >
            Prove it and move on
          </button>
          <button
            type="button"
            onClick={skipLesson}
            data-testid="skip-lesson"
            className="rounded-xl border border-cs-border px-4 py-2 text-sm text-cs-muted transition-colors hover:border-cs-border-2 hover:text-cs-body"
          >
            Skip with the summary
          </button>
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

      {mode === 'learn' && <LessonBody blocks={lesson.blocks} />}

      {(mode === 'skipped' || done) && (
        <section className="card p-6" data-testid="cheatsheet">
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
        <CheckpointQuiz
          questions={lesson.checkpoint}
          requireAllCorrect={mode === 'test-out' || isCapstone}
          onPassed={mode === 'test-out' ? finishTestOut : finishLesson}
        />
      )}

      {done && (
        <div className="card flex flex-wrap items-center gap-3 p-6" data-testid="lesson-complete">
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
              className="rounded-xl border border-cs-border px-4 py-2 text-sm transition-colors hover:border-cs-accent hover:text-cs-accent"
            >
              Back to the map
            </Link>
            {upcoming && upcoming.id !== node.id && (
              <button
                type="button"
                onClick={goNext}
                data-testid="next-lesson"
                className="rounded-xl bg-cs-accent px-5 py-2 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90"
              >
                Next: {nodeTitles[upcoming.id] ?? upcoming.id}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
