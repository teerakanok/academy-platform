'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { CourseNode, CourseStructure, Locale } from '@/lib/content/course-types'
import type { PublicLesson } from '@/lib/content/public-lesson'
import {
  emptyProgress,
  markCompleted,
  markSkipped,
  markStarted,
  markTestedOut,
  recordVideoCue,
  toLearnerState,
  type CourseProgressRecord,
} from '@/lib/course/progress'
import {
  fetchProgress,
  pushProgress,
  type CheckpointOutcome,
  type ProgressAction,
  type ProgressSyncFailure,
  type VideoCueOutcome,
} from '@/lib/course/progress-client'
import { isTestOutAvailable } from '@/lib/course/assessment-policy'
import { canSkip, nextNode, nodeStatus } from '@/lib/course/roadmap'
import { CheckpointQuiz } from './CheckpointQuiz'
import { InteractiveVideo } from './InteractiveVideo'
import { LessonBody } from './LessonBody'

type Mode = 'learn' | 'test-out' | 'skipped'

// รายการติ๊กเองสำหรับผู้เรียน — ตั้งใจให้ "ไม่ใช่ประตู"
//
// ติ๊กครบแล้วปลดล็อกให้ข้าม/ให้เริ่ม quiz คือการเอา self-report มาทำหน้าที่หลักฐาน
// ซึ่งขัดกับหลักของ product เองที่ว่า "ข้ามไม่เคยนับว่าพิสูจน์แล้ว มีแต่ checkpoint
// ที่นับ" และคนที่ติ๊กครบเร็วที่สุดมักเป็นคนที่รู้น้อยที่สุด
// ประโยชน์จริงของมันคือทำให้ผู้เรียน "หยุดคิดทีละข้อ" ก่อนตัดสินใจ — active recall
// ซึ่งได้ผลกว่าการกวาดตาอ่านซ้ำ จึงให้มันบอกผลลัพธ์ ไม่ให้มันกั้นทาง
function SelfCheckList({
  items,
  checked,
  onToggle,
  testId,
  size,
}: {
  items: string[]
  checked: Set<number>
  onToggle: (index: number) => void
  testId: string
  size: 'sm' | 'md'
}) {
  return (
    <ul className={size === 'md' ? 'space-y-1' : 'space-y-0.5'} data-testid={testId}>
      {items.map((item, i) => {
        const on = checked.has(i)
        return (
          <li key={i}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(i)}
              data-testid="self-check-item"
              className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-cs-surface-2 ${
                size === 'md' ? 'text-[0.95rem] leading-relaxed' : 'text-sm leading-relaxed'
              } ${on ? 'text-cs-text' : 'text-cs-body'}`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${
                  on ? 'border-cs-accent bg-cs-accent text-cs-on-accent' : 'border-cs-border-2 bg-transparent'
                }`}
              >
                {on && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M2 6.2 4.7 9 10 3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span>{item}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

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
  // ⚠️ PublicLesson ไม่ใช่ LessonContent โดยเจตนา — ชนิดนี้คือด่านที่กันเฉลย
  // ไม่ให้ข้ามมาฝั่ง browser (W0-1) ห้ามเปลี่ยนกลับเป็น LessonContent
  lesson: PublicLesson
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
  // เก็บไว้ในหน่วยความจำของหน้าเท่านั้น — เป็นเครื่องช่วยคิดของผู้เรียน ไม่ใช่หลักฐาน
  // จึงไม่ต้อง persist และไม่ควรไปปนกับ record ที่บอกว่าอะไรผ่านแล้ว
  const [known, setKnown] = useState<Set<number>>(() => new Set())
  const [recalled, setRecalled] = useState<Set<number>>(() => new Set())
  // โหมดตั้งใจตอบ — ผู้เรียนเลือกเอง ไม่ใช่ระบบบังคับ
  //
  // ตอนแรกผมจะบันทึกว่า "เปิดดูระหว่างตอบ" แล้วไม่นับเป็น proven — คิดใหม่แล้วไม่ทำ
  // เพราะกฎแบบนั้นลงโทษเฉพาะคนที่ซื่อสัตย์พอจะใช้ปุ่มของเรา ส่วนคนที่เปิดอีกแท็บ
  // ไม่โดนอะไรเลย = สอนให้คนเลี่ยงทางตรง
  // สิ่งที่ช่วยจริงคือให้ "ตอบจากความจำ" เป็นตัวเลือกที่กดได้ง่าย ไม่ใช่ข้อบังคับ
  const [focused, setFocused] = useState(false)

  function toggle(set: (fn: (prev: Set<number>) => Set<number>) => void, index: number) {
    set((prev) => {
      const next = new Set(prev)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  const [syncError, setSyncError] = useState<ProgressSyncFailure | null>(null)

  useEffect(() => {
    let alive = true
    fetchProgress(structure.slug).then((loadedRecord) => {
      if (!alive) return
      const started = markStarted(loadedRecord, node.id)
      setRecord(started)
      setLoaded(true)
      const status = nodeStatus(node, toLearnerState(started))
      if (status === 'completed') setDone('completed')
      else if (status === 'tested-out') setDone('tested-out')
      else if (status === 'skipped') setDone('skipped')
      // แค่ "เปิดอ่าน" ก็บันทึก เพื่อให้กลับมาต่อจากที่ค้างได้จากเครื่องไหนก็ได้
      void pushProgress({ action: 'open', slug: structure.slug, nodeId: node.id })
    })
    return () => {
      alive = false
    }
  }, [structure.slug, node])

  // อัปเดตหน้าจอทันที แล้วค่อยบันทึก — ผู้เรียนไม่ควรต้องรอ network ระหว่างตอบคำถาม
  // แต่ถ้าบันทึกไม่สำเร็จต้องบอกให้รู้ ไม่ใช่เงียบแล้วปล่อยให้เขาเสียงานไปเฉยๆ
  function persist(next: CourseProgressRecord, event?: ProgressAction) {
    setRecord(next)
    if (!event) return
    void pushProgress(event).then(({ failure }) => setSyncError(failure))
  }

  const learnerState = toLearnerState(record)
  const upcoming = loaded ? nextNode(structure, learnerState) : null
  const isCapstone = node.kind === 'capstone'
  const nodeIndex = structure.nodes.findIndex((n) => n.id === node.id)
  const position = nodeIndex + 1
  const prevNode = nodeIndex > 0 ? structure.nodes[nodeIndex - 1] : null
  const followingNode = nodeIndex < structure.nodes.length - 1 ? structure.nodes[nodeIndex + 1] : null

  /**
   * ส่งคำตอบให้เซิร์ฟเวอร์ตรวจ แล้วค่อยอัปเดตสถานะจากผลที่ได้จริง
   *
   * ⚠️ ห้ามกลับไปเป็นแบบเดิมที่ `setDone()` ทันทีแล้วค่อยยิง API (F4) — หน้าจอ
   * ประกาศว่าผ่านทั้งที่เซิร์ฟเวอร์อาจปฏิเสธ ทำให้ผู้เรียนเห็นสถานะที่ไม่มีอยู่จริง
   * และทำให้ e2e เขียวปลอมด้วย · ตรงนี้คือจุดเดียวที่แปลผลของเซิร์ฟเวอร์เป็นสถานะ
   */
  async function submitCheckpoint(
    quizMode: 'learn' | 'test-out',
    answers: Record<string, string[]>,
  ): Promise<CheckpointOutcome | null> {
    const { failure, outcome } = await pushProgress({
      action: 'checkpoint',
      slug: structure.slug,
      nodeId: node.id,
      mode: quizMode,
      answers,
    })
    setSyncError(failure)
    if (failure || !outcome) return null

    if (outcome.passed) {
      const results = outcome.results ?? {}
      setRecord(
        quizMode === 'test-out'
          ? markTestedOut(record, node.id, results)
          : markCompleted(record, node.id, results),
      )
    }
    return outcome
  }

  function finishCheckpoint(quizMode: 'learn' | 'test-out') {
    setDone(quizMode === 'test-out' ? 'tested-out' : 'completed')
  }

  async function submitVideoCue(cueId: string, answer: string[]): Promise<VideoCueOutcome | null> {
    const { failure, cue } = await pushProgress({
      action: 'video-cue',
      slug: structure.slug,
      nodeId: node.id,
      cueId,
      answer,
    })
    setSyncError(failure)
    if (failure || !cue) return null
    setRecord((prev) => recordVideoCue(prev, node.id, cueId, cue.correct))
    return cue
  }

  function skipLesson() {
    persist(markSkipped(record, node.id), { action: 'skip', slug: structure.slug, nodeId: node.id })
    setDone('skipped')
    setMode('skipped')
  }

  async function goNext() {
    // อ่านสดจากบัญชีก่อนเลือกบทถัดไป — อาจมีเครื่องอื่นเรียนคืบไปแล้ว
    const fresh = await fetchProgress(structure.slug)
    const target = nextNode(structure, toLearnerState(fresh))
    router.push(target ? `/courses/${structure.slug}/lessons/${target.id}` : `/courses/${structure.slug}`)
  }

  return (
    <article className="space-y-8">
      {syncError && (
        <p
          role="alert"
          data-testid="progress-sync-error"
          className="rounded-control border border-cs-amber-border bg-cs-amber-dim px-4 py-3 text-sm text-cs-body"
        >
          {syncError.message} — ความคืบหน้าล่าสุดของบทนี้อาจยังไม่ถูกบันทึกไว้ในบัญชี
        </p>
      )}
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
          {/* จัดเป็นสองฝั่งชัดเจน (คำถาม | ทางเลือก) แทนการดัน ml-auto —
              พอจอแคบแล้ว ml-auto จะทิ้งช่องว่างไว้ฝั่งซ้ายของแถวที่สอง ทำให้ดูเหลื่อม */}
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-cs-muted">Already know this?</p>
              {/* ต้องเห็นสาระของบทก่อนถึงจะตัดสินได้จริง — ชื่อบทกับหนึ่งประโยค
                  ไม่พอให้ใครบอกได้ว่าตัวเองรู้แล้วหรือยัง */}
              <button
                type="button"
                onClick={() => setPeeking((v) => !v)}
                data-testid="peek-key-ideas"
                aria-expanded={peeking}
                className="rounded-control px-1 py-1 text-sm font-medium text-cs-accent underline underline-offset-4 transition-colors hover:text-cs-text"
              >
                {peeking ? 'Hide what it covers' : 'See what it covers'}
              </button>
            </div>
            <span className="flex flex-wrap gap-2">
              {/* ปุ่มนี้ผูกกับนโยบายเดียวกับที่ API บังคับ — เดิมผูกกับ canSkip()
                  อย่างเดียว จึงขึ้นบนบทที่เซิร์ฟเวอร์ปฏิเสธ test-out อยู่ดี */}
              {isTestOutAvailable(node) && (
                <button
                  type="button"
                  onClick={() => setMode('test-out')}
                  data-testid="test-out"
                  className="rounded-control border-2 border-cs-accent bg-cs-surface px-4 py-2 text-sm font-medium text-cs-accent transition-colors hover:bg-cs-accent-dim"
                >
                  Prove it and move on
                </button>
              )}
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
            <div className="mt-3 border-t border-cs-border pt-3">
              {/* ⚠️ คำว่า "proven" สงวนไว้ให้ด่านบังคับเท่านั้นตั้งแต่ W0-3 —
                  บทปกติผ่านแล้วนับเป็นความคืบหน้า ไม่ใช่หลักฐานที่ใบรับรองอ้างถึง */}
              <p className="mb-2.5 text-xs text-cs-muted">
                Tick anything you could already explain. This is just to help you decide — nothing here changes your
                progress.
              </p>
              <SelfCheckList
                items={lesson.cheatsheet}
                checked={known}
                onToggle={(i) => toggle(setKnown, i)}
                testId="key-ideas-peek"
                size="sm"
              />
              {known.size > 0 && (
                <p className="mt-3 text-sm text-cs-body" data-testid="peek-verdict">
                  {known.size === lesson.cheatsheet.length ? (
                    // ข้อความต้องไม่ชี้ไปที่ปุ่มที่ไม่มีอยู่จริง — เมื่อ "พิสูจน์แล้วข้าม"
                    // ถูกปิด (assessment-policy) การบอกให้ไปกดมันคือการส่งผู้เรียนไปชนกำแพง
                    isTestOutAvailable(node) ? (
                      <>
                        You marked all {lesson.cheatsheet.length}. Then the checkpoint should be quick —{' '}
                        <span className="font-medium text-cs-text">prove it and move on</span> marks this lesson done,
                        which skipping does not.
                      </>
                    ) : (
                      <>
                        You marked all {lesson.cheatsheet.length}. Then the checkpoint at the end should be quick — and
                        passing it marks this lesson done, which skipping does not.
                      </>
                    )
                  ) : (
                    <>
                      <span className="font-medium text-cs-text">
                        {lesson.cheatsheet.length - known.size} of {lesson.cheatsheet.length}
                      </span>{' '}
                      are still new to you. That is the part this lesson adds.
                    </>
                  )}
                </p>
              )}
            </div>
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
          onCueAnswered={submitVideoCue}
        />
      )}

      {mode === 'learn' && focused && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-cs-border-2 bg-cs-surface-2 px-4 py-3"
          data-testid="focus-bar"
        >
          <p className="text-sm text-cs-muted">The lesson is hidden while you answer.</p>
          <button
            type="button"
            onClick={() => setFocused(false)}
            data-testid="focus-off"
            className="rounded-control border border-cs-border bg-cs-surface px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
          >
            Show the lesson again
          </button>
        </div>
      )}

      {mode === 'learn' && !focused && (
        <>
          <LessonBody blocks={lesson.blocks} slug={structure.slug} nodeId={node.id} />
          {lesson.attribution && (
            <p className="prose-lesson border-t border-cs-border pt-4 text-xs text-cs-muted">
              {lesson.attribution}
            </p>
          )}

          {/* จังหวะปิดการอ่าน: สรุปสิ่งที่เพิ่งอ่านก่อนจะเจอคำถาม
              เดิมอ่านจบแล้วเจอ quiz ทันทีซึ่งกระโดดเกินไป และไม่มีโอกาสทบทวน */}
          {/* ต้องดูไม่เหมือน callout — callout คือหมายเหตุข้างทาง (กล่องสีอ่อน มน 16px
              ตัวเล็ก) ส่วนกล่องนี้คือชิ้นเอกของหน้า จึงใช้ card-feature (พื้นขาว เงาลึก
              มน 24px) + แถบสีประจำตัวด้านซ้าย + ตัวหนังสือใหญ่ขึ้น เดิมทั้งสองใช้
              accent-dim + accent-border เหมือนกันเป๊ะ จึงกลืนกันจริงตามที่ทัก */}
          {!done && (
            <section
              className="card-feature card-takeaway mt-14 overflow-hidden p-6 sm:p-8"
              data-testid="key-takeaways"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">That is the lesson</p>
                  <h2 className="mt-1.5 font-display text-2xl font-semibold text-cs-text">Key ideas to keep</h2>
                </div>
                <span
                  className="shrink-0 rounded-full bg-cs-accent-fill px-3 py-1 font-mono text-xs font-semibold text-cs-on-accent"
                  data-testid="takeaway-count"
                >
                  {recalled.size} / {lesson.cheatsheet.length}
                </span>
              </div>
              <p className="mt-3 text-sm text-cs-muted">
                Tick each one you could explain right now without scrolling back. Whatever you leave unticked is worth
                a re-read.
              </p>
              <div className="mt-5 border-t border-cs-border pt-5">
                <SelfCheckList
                  items={lesson.cheatsheet}
                  checked={recalled}
                  onToggle={(i) => toggle(setRecalled, i)}
                  testId="key-takeaway-list"
                  size="md"
                />
              </div>
              <p className="mt-5 border-t border-cs-border pt-4 text-sm text-cs-body">
                {recalled.size === lesson.cheatsheet.length
                  ? 'All of them. The checkpoint below should be quick.'
                  : 'When you are ready, a few questions below confirm it stuck.'}
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
        {/* เรื่องเลื่อนกลับไปอ่าน: ไม่ล็อก เพราะล็อกไม่ได้จริง (เปิดอีกแท็บก็จบ) และ
            การล็อกทำให้ระบบดูไม่ไว้ใจผู้เรียน สิ่งที่ช่วยจริงคือบอกตรงๆ ว่าการเปิดดู
            ให้ผลอะไร — ตอบจากความจำคือสิ่งเดียวที่บอกได้ว่า "รู้" ไม่ใช่ "หาเจอ" */}
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-cs-muted">
            {mode === 'test-out' || isCapstone
              ? 'Answer from memory. Looking something up gives you the answer without telling you whether you knew it.'
              : 'Answer from memory if you can. Getting one wrong here is useful to you and costs you nothing.'}
          </p>
          {mode === 'learn' && !focused && (
            <button
              type="button"
              onClick={() => setFocused(true)}
              data-testid="focus-on"
              className="text-sm font-medium text-cs-accent underline underline-offset-4 transition-colors hover:text-cs-text"
            >
              Hide the lesson while I answer
            </button>
          )}
        </div>
        <CheckpointQuiz
          questions={lesson.checkpoint}
          requireAllCorrect={mode === 'test-out' || isCapstone}
          onSubmit={(answers) => submitCheckpoint(mode === 'test-out' ? 'test-out' : 'learn', answers)}
          onPassed={() => finishCheckpoint(mode === 'test-out' ? 'test-out' : 'learn')}
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
