'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LessonVideo, VideoCueQuestion } from '@/lib/content/course-types'

// Custom video player พร้อมคำถามแทรกกลางเรื่อง
//
// เหตุผลที่ต้องเป็น player ของเราเอง ไม่ใช่ iframe ของ vendor (design guard ที่ล็อกไว้):
// ชั้น interactive ทั้งหมด — หยุดที่ cue, เด้งคำถาม, กันกรอข้ามคำถาม — เป็น logic
// ฝั่งเรา ถ้าฝัง iframe ของผู้ให้บริการเราจะควบคุมสิ่งเหล่านี้ไม่ได้และย้ายเจ้าไม่ได้
//
// กติกาการกรอ: กรอถอยหลังได้เสรี กรอไปข้างหน้าข้ามคำถามที่ยังไม่ตอบไม่ได้ —
// จะถูกดึงกลับมาที่คำถามนั้น (ไม่ใช่การลงโทษ แต่คือการรับประกันว่าคำถามได้ถูกเห็น)
// ตอบผิดก็ไปต่อได้ตามหลัก "ผู้เรียน override ได้เสมอ" — คำถามนี้ไม่ใช่ด่านตัดสิน

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export function InteractiveVideo({
  video,
  questions,
  answeredCueIds,
  onCueAnswered,
}: {
  video: LessonVideo
  questions: VideoCueQuestion[]
  answeredCueIds: string[]
  onCueAnswered: (cueId: string, correct: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const clampingRef = useRef(false)
  const [answered, setAnswered] = useState<string[]>(answeredCueIds)
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const cues = [...video.cues].sort((a, b) => a.atSeconds - b.atSeconds)
  const questionByCue = new Map(questions.map((q) => [q.cueId, q]))

  const nextPendingCue = useCallback(
    (fromTime: number) => cues.find((c) => !answered.includes(c.id) && c.atSeconds > fromTime) ?? null,
    [cues, answered],
  )

  const activeQuestion = activeCueId ? questionByCue.get(activeCueId) ?? null : null

  function openCue(cueId: string) {
    setActiveCueId(cueId)
    setSelected(null)
    setSubmitted(false)
    videoRef.current?.pause()
  }

  function handleTimeUpdate() {
    const el = videoRef.current
    if (!el) return
    setCurrentTime(el.currentTime)
    if (activeCueId) return
    const due = cues.find((c) => !answered.includes(c.id) && el.currentTime >= c.atSeconds)
    if (due) openCue(due.id)
  }

  function handleSeeking() {
    const el = videoRef.current
    if (!el || clampingRef.current) return
    // หา cue ที่ยังไม่ตอบตัวแรกจากจุดเริ่มเรื่อง — ห้ามกระโดดข้ามมันไป
    const firstPending = cues.find((c) => !answered.includes(c.id))
    if (firstPending && el.currentTime > firstPending.atSeconds) {
      clampingRef.current = true
      el.currentTime = firstPending.atSeconds
      window.setTimeout(() => {
        clampingRef.current = false
      }, 0)
      openCue(firstPending.id)
    }
  }

  function submitAnswer() {
    if (!activeQuestion || !selected) return
    setSubmitted(true)
    const correct = activeQuestion.correct.length === 1 && activeQuestion.correct[0] === selected
    onCueAnswered(activeQuestion.cueId, correct)
  }

  function continueAfterCue() {
    if (!activeCueId) return
    setAnswered((prev) => (prev.includes(activeCueId) ? prev : [...prev, activeCueId]))
    setActiveCueId(null)
    setSelected(null)
    setSubmitted(false)
    void videoRef.current?.play()
  }

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [])

  const upcoming = nextPendingCue(currentTime)

  return (
    <div className="not-prose" data-testid="interactive-video">
      <div className="relative overflow-hidden rounded-2xl border border-cs-border bg-black shadow-card">
        <video
          ref={videoRef}
          src={video.src}
          className="block aspect-video w-full"
          controls
          preload="metadata"
          playsInline
          data-testid="lesson-video"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onError={() => setUnavailable(true)}
        />

        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-cs-surface p-6 text-center text-sm text-cs-muted">
            The demo video is not available in this environment. Run
            <code className="mx-1 font-mono text-xs">bash scripts/make-dummy-lesson-video.sh</code>
            to generate it.
          </div>
        )}

        {activeQuestion && (
          <div
            // ทึบเกือบเต็มโดยตั้งใจ: คำถามต้องอ่านออกไม่ว่าเฟรมวิดีโอข้างหลังจะสว่าง
            // หรือมีสีจัดแค่ไหน (ภาพ test pattern ทำให้เห็นปัญหานี้ชัด)
            className="absolute inset-0 flex items-center justify-center bg-cs-bg/[0.985] p-5 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Question"
            data-testid="video-quiz"
          >
            <div className="max-h-full w-full max-w-xl overflow-y-auto">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cs-accent">
                Quick check · paused at {formatTime(cues.find((c) => c.id === activeCueId)?.atSeconds ?? 0)}
              </p>
              <p className="mb-4 font-display text-lg font-semibold text-cs-text">{activeQuestion.prompt}</p>

              <div className="space-y-2">
                {Object.entries(activeQuestion.choices).map(([letter, text]) => {
                  const isPicked = selected === letter
                  const isCorrect = activeQuestion.correct.includes(letter)
                  const showResult = submitted
                  const tone = showResult
                    ? isCorrect
                      ? 'border-cs-accent bg-cs-accent-dim'
                      : isPicked
                        ? 'border-cs-amber bg-cs-amber-dim'
                        : 'border-cs-border'
                    : isPicked
                      ? 'border-cs-accent bg-cs-accent-dim'
                      : 'border-cs-border hover:border-cs-border-2'
                  return (
                    <label
                      key={letter}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-cs-surface px-4 py-2.5 text-sm transition-colors ${tone}`}
                    >
                      <input
                        type="radio"
                        name={`cue-${activeQuestion.cueId}`}
                        value={letter}
                        checked={isPicked}
                        disabled={submitted}
                        onChange={() => setSelected(letter)}
                        className="mt-0.5 h-4 w-4 accent-cs-accent"
                      />
                      <span className="text-cs-body">
                        <span className="mr-1.5 font-mono text-cs-muted">{letter}.</span>
                        {text}
                      </span>
                    </label>
                  )
                })}
              </div>

              {submitted && (
                <p
                  className="mt-3 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-3 text-sm leading-relaxed text-cs-body"
                  data-testid="video-quiz-explanation"
                >
                  {activeQuestion.explanation}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {!submitted ? (
                  <button
                    type="button"
                    onClick={submitAnswer}
                    disabled={!selected}
                    data-testid="video-quiz-submit"
                    className="rounded-xl bg-cs-accent px-5 py-2 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Check answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={continueAfterCue}
                    data-testid="video-quiz-continue"
                    className="rounded-xl bg-cs-accent px-5 py-2 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90"
                  >
                    Keep watching
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cs-muted">
        <span data-testid="video-cue-progress">
          Checkpoints answered: {answered.length}/{cues.length}
        </span>
        {upcoming && (
          <span>
            Next question at {formatTime(upcoming.atSeconds)}
            {playing ? '' : ' · press play to continue'}
          </span>
        )}
        {!upcoming && answered.length === cues.length && cues.length > 0 && (
          <span className="text-cs-accent">All in-video questions answered</span>
        )}
      </div>
    </div>
  )
}
