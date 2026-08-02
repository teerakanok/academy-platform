'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LessonVideo, Locale } from '@/lib/content/course-types'
import type { PublicVideoCueQuestion } from '@/lib/content/public-lesson'
import type { VideoCueOutcome } from '@/lib/course/progress-client'
import { useUi } from '@/components/i18n/LocaleProvider'

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
  questions: PublicVideoCueQuestion[]
  answeredCueIds: string[]
  /** ส่งคำตอบให้เซิร์ฟเวอร์ตรวจ — คำถามกลางวิดีโอไม่มีเฉลยอยู่ฝั่งนี้แล้ว (W0-1) */
  onCueAnswered: (cueId: string, answer: string[]) => Promise<VideoCueOutcome | null>
}) {
  const { t: ui } = useUi()
  const videoRef = useRef<HTMLVideoElement>(null)
  const clampingRef = useRef(false)
  const [answered, setAnswered] = useState<string[]>(answeredCueIds)
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [cueOutcome, setCueOutcome] = useState<VideoCueOutcome | null>(null)
  const [checking, setChecking] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  // ── ภาษาเสียง ─────────────────────────────────────────────────────────────
  // เนื้อหาเดิมที่มีแค่ src เดียว = ถือว่ามีหนึ่งแทร็ก ไม่ต้องแก้ไฟล์คอร์สเก่า
  const audioTracks =
    video.audio && video.audio.length > 0
      ? video.audio
      : video.src
        ? [{ locale: 'en' as Locale, src: video.src, label: 'English' }]
        : []
  const [audioLocale, setAudioLocale] = useState<Locale>(() => audioTracks[0]?.locale ?? 'en')
  const activeAudio = audioTracks.find((a) => a.locale === audioLocale) ?? audioTracks[0]
  const captions = video.captions ?? []

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
    setCueOutcome(null)
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

  async function submitAnswer() {
    if (!activeQuestion || !selected || checking) return
    setChecking(true)
    const result = await onCueAnswered(activeQuestion.cueId, [selected])
    setChecking(false)
    // ตรวจไม่สำเร็จ = ยังไม่มีผล ปล่อยให้กดใหม่ได้ ไม่ใช่แกล้งบอกว่าถูก
    if (result) setCueOutcome(result)
  }

  function continueAfterCue() {
    if (!activeCueId) return
    setAnswered((prev) => (prev.includes(activeCueId) ? prev : [...prev, activeCueId]))
    setActiveCueId(null)
    setSelected(null)
    setCueOutcome(null)
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

  // สลับภาษาเสียง = เปลี่ยนไฟล์ จึงต้องคืนตำแหน่งและสถานะเล่นเอง
  // ไม่งั้นผู้เรียนที่ดูมา 4 นาทีแล้วเปลี่ยนภาษาจะถูกโยนกลับไปเริ่มใหม่
  function switchAudio(locale: Locale) {
    const el = videoRef.current
    const at = el?.currentTime ?? 0
    const wasPlaying = el ? !el.paused : false
    setAudioLocale(locale)
    requestAnimationFrame(() => {
      const next = videoRef.current
      if (!next) return
      const resume = () => {
        next.currentTime = at
        if (wasPlaying) void next.play()
        next.removeEventListener('loadedmetadata', resume)
      }
      next.addEventListener('loadedmetadata', resume)
    })
  }

  const upcoming = nextPendingCue(currentTime)

  return (
    <div className="not-prose" data-testid="interactive-video">
      {audioTracks.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-2" data-testid="audio-language-picker">
          <span className="font-mono text-[11px] uppercase tracking-wide text-cs-muted">{ui.video.audio}</span>
          {audioTracks.map((track) => (
            <button
              key={track.locale}
              type="button"
              onClick={() => switchAudio(track.locale)}
              data-testid={`audio-${track.locale}`}
              aria-pressed={track.locale === audioLocale}
              className={`rounded-control border px-3 py-1 text-[13px] transition-colors ${
                track.locale === audioLocale
                  ? 'border-cs-accent bg-cs-accent-dim text-cs-accent'
                  : 'border-cs-border text-cs-muted hover:border-cs-accent hover:text-cs-accent'
              }`}
            >
              {track.label}
            </button>
          ))}
          {captions.length > 0 && (
            <span className="ml-1 text-[11px] text-cs-muted">
              {ui.video.captionsHint(captions.map((c) => c.label).join(' / '))}
            </span>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-feature border border-cs-border bg-black shadow-feature">
        <video
          ref={videoRef}
          src={activeAudio?.src}
          className="block aspect-video w-full"
          controls
          preload="metadata"
          playsInline
          data-testid="lesson-video"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onError={() => setUnavailable(true)}
          crossOrigin="anonymous"
        >
          {/* คำบรรยายเป็น <track> มาตรฐาน — เบราว์เซอร์มีตัวเลือกเปิด/ปิดและเลือก
              ภาษาให้อยู่แล้ว ไม่ต้องเขียน UI ซ้ำ และผู้เรียนที่คุ้นกับ player อื่น
              จะหาเจอทันที ค่าตั้งต้นเลือกภาษาที่ "ไม่ใช่ภาษาเสียง" เพราะคนที่เปิด
              คำบรรยายมักฟังภาษาหนึ่งแล้วอ่านอีกภาษาหนึ่ง */}
          {captions.map((c) => (
            <track
              key={c.locale}
              kind="subtitles"
              src={c.src}
              srcLang={c.locale}
              label={c.label}
              default={captions.length === 1 ? c.locale !== audioLocale : false}
            />
          ))}
        </video>

        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-cs-surface p-6 text-center text-sm text-cs-muted">
            The demo video is not available in this environment. Run
            <code className="mx-1 font-mono text-xs">bash scripts/make-dummy-lesson-video.sh</code>
            to generate it.
          </div>
        )}

        {activeQuestion && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-cs-bg/95 px-4 py-2.5 backdrop-blur"
            data-testid="video-paused-marker"
          >
            <span aria-hidden="true" className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">
              Paused
            </span>
            <span className="text-[13px] text-cs-body">There is a question below.</span>
          </div>
        )}
      </div>

      {activeQuestion && (
          <div
            // คำถามอยู่ "ใต้วิดีโอ" ไม่ใช่ทับบนวิดีโอ
            //
            // เดิมเป็น overlay ทับในกล่อง 16:9 ซึ่งเตี้ยเกินกว่าจะใส่คำถามพร้อมตัวเลือก
            // ได้ครบ ผู้เรียนจึงต้องเลื่อนอ่านในกรอบวิดีโอ ซึ่งอ่านยากและดูเหมือนหน้าพัง
            // วางไว้ข้างล่างแทน: ไม่มีการเลื่อนซ้อน อ่านได้เต็มความกว้าง และยังเห็น
            // เฟรมที่เป็นต้นเหตุของคำถามค้างอยู่ข้างบน
            className="card-feature card-takeaway mt-3 p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Question"
            data-testid="video-quiz"
          >
            <div className="w-full">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cs-accent">
                Quick check · paused at {formatTime(cues.find((c) => c.id === activeCueId)?.atSeconds ?? 0)}
              </p>
              <p className="mb-4 font-display text-lg font-semibold text-cs-text">{activeQuestion.prompt}</p>

              <div className="space-y-2">
                {Object.entries(activeQuestion.choices).map(([letter, text]) => {
                  const isPicked = selected === letter
                  // ระบายสีตามผลได้เฉพาะตัวเลือกที่ผู้เรียนเลือกเอง และเฉพาะเมื่อ
                  // เซิร์ฟเวอร์ตอบแล้ว — ฝั่งนี้ไม่รู้ว่าข้อไหนถูก (และไม่ควรรู้)
                  const tone =
                    cueOutcome && isPicked
                      ? cueOutcome.correct
                        ? 'border-cs-accent bg-cs-accent-dim'
                        : 'border-cs-amber bg-cs-amber-dim'
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
                        disabled={checking || cueOutcome !== null}
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

              {cueOutcome?.explanation && (
                <p
                  className="mt-3 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-3 text-sm leading-relaxed text-cs-body"
                  data-testid="video-quiz-explanation"
                >
                  {cueOutcome.explanation}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {!cueOutcome ? (
                  <button
                    type="button"
                    onClick={submitAnswer}
                    disabled={!selected || checking}
                    data-testid="video-quiz-submit"
                    className="rounded-xl bg-cs-accent-fill px-5 py-2 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {checking ? 'Checking…' : 'Check answer'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={continueAfterCue}
                    data-testid="video-quiz-continue"
                    className="rounded-xl bg-cs-accent-fill px-5 py-2 text-sm font-semibold text-cs-on-accent transition-opacity hover:opacity-90"
                  >
                    Keep watching
                  </button>
                )}
              </div>
            </div>
          </div>
      )}

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
