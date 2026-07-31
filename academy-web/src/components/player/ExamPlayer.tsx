'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FullLengthTest } from '@/lib/content/types'
import {
  browserStore,
  isExpired,
  latestAttempt,
  newAttempt,
  saveAttempt,
  type AttemptRecord,
} from '@/lib/player/progress'
import { scoreExam, type PbqFieldAnswer } from '@/lib/player/scoring'
import { shuffled } from '@/lib/player/shuffle'
import { McqCard } from './McqCard'
import { PbqCard } from './PbqCard'
import { ResultsScreen } from './ResultsScreen'
import { Timer } from './Timer'

// Exam runner: timed (deadline-based endsAt) + shuffle seedable + resume หลัง
// reload + retake = attempt ใหม่ (แผน §4-M2-2/-6); หมดเวลา = auto-submit

type Phase = 'intro' | 'running' | 'submitted'

export function ExamPlayer({ test }: { test: FullLengthTest }) {
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [index, setIndex] = useState(0)
  const [corruptNotice, setCorruptNotice] = useState(false)

  // resume: attempt in-progress ที่ยังไม่หมดเวลา → ทำต่อได้ทันที;
  // หมดเวลาไประหว่างปิดหน้า → finalize เป็น submitted ทันที (idempotent) —
  // ห้ามเด้งกลับ intro ทั้งที่ storage ยังค้าง in-progress (finding review lane)
  useEffect(() => {
    const { record, corruptReset } = latestAttempt(browserStore(), test.id)
    if (corruptReset) setCorruptNotice(true)
    if (!record) return
    if (record.status === 'in-progress' && isExpired(record)) {
      const finalized: AttemptRecord = { ...record, status: 'submitted', submittedAt: record.endsAt }
      saveAttempt(browserStore(), finalized)
      setAttempt(finalized)
      setPhase('submitted')
    } else if (record.status === 'in-progress') {
      setAttempt(record)
      setPhase('running')
    } else {
      setAttempt(record)
      setPhase('submitted')
    }
  }, [test.id])

  const order = useMemo(() => {
    if (!attempt) return { mcqIds: [] as string[], total: 0 }
    const mcqIds = shuffled(
      test.questions.map((q) => q.id),
      attempt.seed,
    )
    return { mcqIds, total: mcqIds.length + test.pbqs.length }
  }, [attempt, test])

  function persist(next: AttemptRecord) {
    setAttempt({ ...next })
    saveAttempt(browserStore(), next)
  }

  function start() {
    const record = newAttempt(test.id, 'exam', { timeLimitMinutes: test.timeLimitMinutes })
    persist(record)
    setIndex(0)
    setPhase('running')
  }

  function submit() {
    if (!attempt || attempt.status === 'submitted') return
    const next: AttemptRecord = { ...attempt, status: 'submitted', submittedAt: Date.now() }
    persist(next)
    setPhase('submitted')
  }

  if (phase === 'intro' || !attempt) {
    return (
      <div className="space-y-6">
        {corruptNotice && (
          <p role="alert" className="rounded-lg border border-cs-amber/40 bg-cs-amber/10 px-4 py-3 text-sm text-cs-amber">
            ข้อมูลความคืบหน้าเดิมเสียหายและถูกล้างแล้ว — เริ่ม attempt ใหม่ได้เลย
          </p>
        )}
        <div className="rounded-lg border border-cs-border bg-cs-surface p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-cs-text">{test.title}</h2>
          <ul className="text-sm text-cs-body space-y-1">
            <li>· {test.questions.length} MCQ + {test.pbqs.length} PBQ</li>
            <li>· เวลา {test.timeLimitMinutes} นาที (deadline คงที่ — reload แล้วเวลาเดินต่อ)</li>
            <li>· MCQ แบบ multi ต้องถูกครบชุด · PBQ ให้คะแนนต่อช่อง · ไม่ตอบ = ผิด</li>
          </ul>
          <button
            type="button"
            data-testid="start-exam-button"
            onClick={start}
            className="rounded-lg bg-cs-accent-fill px-6 py-2.5 text-sm font-semibold text-cs-on-accent hover:opacity-90"
          >
            เริ่มทำแบบทดสอบ
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'submitted') {
    const score = scoreExam(test, attempt.answers)
    return (
      <ResultsScreen
        test={test}
        score={score}
        answers={attempt.answers}
        onRetake={() => {
          setPhase('intro')
          setAttempt(null)
          setIndex(0)
          // attempt เดิมคงอยู่ใน store (ไม่ทับ) — เริ่มใหม่คือ record ใหม่
        }}
      />
    )
  }

  const isMcqPhase = index < order.mcqIds.length
  const currentMcq = isMcqPhase
    ? test.questions.find((q) => q.id === order.mcqIds[index])!
    : null
  const currentPbq = !isMcqPhase ? test.pbqs[index - order.mcqIds.length] : null

  const answeredCount =
    Object.values(attempt.answers.mcq).filter((a) => a && a.length > 0).length +
    test.pbqs.filter((p) => {
      const fields = attempt.answers.pbq[p.id]
      return fields && Object.values(fields).some((v) => v !== undefined)
    }).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cs-border bg-cs-surface px-4 py-3">
        <p className="font-mono text-sm text-cs-muted">
          ข้อ <span className="text-cs-text">{index + 1}</span>/{order.total}
          <span className="ml-3 text-xs">(ตอบแล้ว {answeredCount})</span>
        </p>
        <div className="flex items-center gap-4">
          <Timer endsAt={attempt.endsAt!} onExpire={submit} />
          <button
            type="button"
            data-testid="submit-exam-button"
            onClick={submit}
            className="rounded-lg bg-cs-accent-fill px-4 py-2 text-sm font-semibold text-cs-on-accent hover:opacity-90"
          >
            ส่งคำตอบ
          </button>
        </div>
      </div>

      <nav aria-label="ไปยังข้อ" className="flex flex-wrap gap-1.5">
        {Array.from({ length: order.total }, (_, i) => {
          const id = i < order.mcqIds.length ? order.mcqIds[i] : test.pbqs[i - order.mcqIds.length].id
          const answered =
            i < order.mcqIds.length
              ? (attempt.answers.mcq[id]?.length ?? 0) > 0
              : Object.values(attempt.answers.pbq[id] ?? {}).some((v) => v !== undefined)
          return (
            <button
              key={id}
              type="button"
              data-testid={`nav-q-${i + 1}`}
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'step' : undefined}
              className={`h-8 w-8 rounded font-mono text-xs transition-colors ${
                i === index
                  ? 'bg-cs-accent-fill text-cs-on-accent font-bold'
                  : answered
                    ? 'bg-cs-accent-dim text-cs-accent border border-cs-accent-border'
                    : 'border border-cs-border text-cs-muted hover:border-cs-border-2'
              }`}
            >
              {i + 1}
            </button>
          )
        })}
      </nav>

      <div className="rounded-lg border border-cs-border bg-cs-surface/50 p-5 sm:p-6">
        {currentMcq && (
          <McqCard
            item={currentMcq}
            answer={attempt.answers.mcq[currentMcq.id]}
            onChange={(a) => {
              const next = { ...attempt }
              next.answers = { ...next.answers, mcq: { ...next.answers.mcq, [currentMcq.id]: a } }
              persist(next)
            }}
          />
        )}
        {currentPbq && (
          <PbqCard
            item={currentPbq}
            answers={attempt.answers.pbq[currentPbq.id] ?? {}}
            onFieldChange={(fieldId, a: PbqFieldAnswer) => {
              const next = { ...attempt }
              next.answers = {
                ...next.answers,
                pbq: {
                  ...next.answers.pbq,
                  [currentPbq.id]: { ...next.answers.pbq[currentPbq.id], [fieldId]: a },
                },
              }
              persist(next)
            }}
          />
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          data-testid="prev-question"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded-lg border border-cs-border px-4 py-2 text-sm hover:border-cs-accent hover:text-cs-accent disabled:opacity-30"
        >
          ← ข้อก่อนหน้า
        </button>
        <button
          type="button"
          data-testid="next-question"
          disabled={index === order.total - 1}
          onClick={() => setIndex((i) => Math.min(order.total - 1, i + 1))}
          className="rounded-lg border border-cs-border px-4 py-2 text-sm hover:border-cs-accent hover:text-cs-accent disabled:opacity-30"
        >
          ข้อถัดไป →
        </button>
      </div>
    </div>
  )
}
