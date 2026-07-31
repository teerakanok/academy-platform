'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ModuleBank } from '@/lib/content/types'
import {
  browserStore,
  latestAttempt,
  newAttempt,
  saveAttempt,
  type AttemptRecord,
} from '@/lib/player/progress'
import { gradeMcq } from '@/lib/player/scoring'
import { shuffled } from '@/lib/player/shuffle'
import { McqCard } from './McqCard'
import { VideoSlot } from './VideoSlot'

// Practice runner ต่อ module: pool จาก bank ทั้ง module + shuffle seedable +
// per-question explanation หลังตอบ + progress ต่อ module + resume + retake
// (แผน §4-M2-2/-5/-6)

const progressKey = (slug: string) => `module:${slug}`

export function PracticePlayer({ bank }: { bank: ModuleBank }) {
  const contentId = progressKey(bank.slug)
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null)
  const [corruptNotice, setCorruptNotice] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    const { record, corruptReset } = latestAttempt(browserStore(), contentId)
    if (corruptReset) setCorruptNotice(true)
    if (record && record.status === 'in-progress') {
      setAttempt(record)
      // resume ณ ข้อแรกที่ยังไม่ตอบ
      const orderIds = shuffled(bank.questions.map((q) => q.id), record.seed)
      const firstUnanswered = orderIds.findIndex((id) => !(record.answers.mcq[id]?.length))
      setCursor(firstUnanswered === -1 ? orderIds.length - 1 : firstUnanswered)
    }
  }, [contentId, bank])

  const orderIds = useMemo(
    () => (attempt ? shuffled(bank.questions.map((q) => q.id), attempt.seed) : []),
    [attempt, bank],
  )

  function persist(next: AttemptRecord) {
    setAttempt({ ...next })
    saveAttempt(browserStore(), next)
  }

  function start() {
    const record = newAttempt(contentId, 'practice')
    persist(record)
    setCursor(0)
    setRevealed(false)
  }

  const stats = useMemo(() => {
    if (!attempt) return { answered: 0, correct: 0 }
    let answered = 0
    let correct = 0
    for (const q of bank.questions) {
      const a = attempt.answers.mcq[q.id]
      if (a && a.length > 0) {
        answered += 1
        if (gradeMcq(q, a)) correct += 1
      }
    }
    return { answered, correct }
  }, [attempt, bank])

  if (!attempt) {
    return (
      <div className="space-y-6">
        {corruptNotice && (
          <p role="alert" className="rounded-lg border border-cs-amber/40 bg-cs-amber/10 px-4 py-3 text-sm text-cs-amber">
            ข้อมูลความคืบหน้าเดิมเสียหายและถูกล้างแล้ว — เริ่มใหม่ได้เลย
          </p>
        )}
        <div className="rounded-lg border border-cs-border bg-cs-surface p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-cs-text">{bank.title}</h2>
          <p className="text-sm text-cs-body">
            โหมดฝึก: {bank.questions.length} ข้อจาก bank ของ module นี้ — เห็นคำอธิบายทันทีหลังตอบแต่ละข้อ
          </p>
          <VideoSlot />
          <button
            type="button"
            data-testid="start-practice-button"
            onClick={start}
            className="rounded-lg bg-cs-accent px-6 py-2.5 text-sm font-semibold text-cs-bg hover:opacity-90"
          >
            เริ่มฝึก
          </button>
        </div>
      </div>
    )
  }

  const currentId = orderIds[cursor]
  const current = bank.questions.find((q) => q.id === currentId)!
  const currentAnswer = attempt.answers.mcq[current.id]
  const answeredCurrent = (currentAnswer?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div
        data-testid="module-progress"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cs-border bg-cs-surface px-4 py-3 font-mono text-sm"
      >
        <p className="text-cs-muted">
          ข้อ <span className="text-cs-text">{cursor + 1}</span>/{orderIds.length}
        </p>
        <p className="text-cs-muted">
          ตอบแล้ว <span className="text-cs-text" data-testid="answered-count">{stats.answered}</span> · ถูก{' '}
          <span className="text-cs-accent" data-testid="correct-count">{stats.correct}</span>
        </p>
        <button
          type="button"
          data-testid="practice-retake-button"
          onClick={start}
          className="rounded border border-cs-border px-3 py-1 text-xs hover:border-cs-accent hover:text-cs-accent"
        >
          เริ่มรอบใหม่
        </button>
      </div>

      <div className="rounded-lg border border-cs-border bg-cs-surface/50 p-5 sm:p-6">
        <McqCard
          item={current}
          answer={currentAnswer}
          disabled={revealed}
          reveal={revealed}
          onChange={(a) => {
            const next = { ...attempt }
            next.answers = { ...next.answers, mcq: { ...next.answers.mcq, [current.id]: a } }
            persist(next)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-testid="practice-prev"
          disabled={cursor === 0}
          onClick={() => {
            setCursor((c) => c - 1)
            setRevealed(true) // ข้อที่ผ่านมาแล้ว = โชว์เฉลยได้เลย
          }}
          className="rounded-lg border border-cs-border px-4 py-2 text-sm hover:border-cs-accent hover:text-cs-accent disabled:opacity-30"
        >
          ← ข้อก่อนหน้า
        </button>
        {!revealed ? (
          <button
            type="button"
            data-testid="check-answer-button"
            disabled={!answeredCurrent}
            onClick={() => setRevealed(true)}
            className="rounded-lg bg-cs-accent px-5 py-2 text-sm font-semibold text-cs-bg hover:opacity-90 disabled:opacity-30"
          >
            ตรวจคำตอบ
          </button>
        ) : (
          <button
            type="button"
            data-testid="practice-next"
            disabled={cursor >= orderIds.length - 1}
            onClick={() => {
              setRevealed(false)
              setCursor((c) => c + 1)
            }}
            className="rounded-lg bg-cs-accent px-5 py-2 text-sm font-semibold text-cs-bg hover:opacity-90 disabled:opacity-30"
          >
            ข้อถัดไป →
          </button>
        )}
      </div>
    </div>
  )
}
