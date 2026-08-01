'use client'

import { useState } from 'react'
import type { CheckpointQuestion } from '@/lib/content/course-types'

// Checkpoint ท้ายบท — ใช้เกณฑ์ all-or-nothing เดียวกับ engine ข้อสอบ (multi ต้องถูกครบชุด)
//
// บทเรียนปกติ: ตอบเสร็จก็ผ่าน ตอบผิดได้ (เรียนรู้ ไม่ใช่คัดออก)
// capstone: ต้องถูกทุกข้อจึงจะนับว่าผ่าน — นี่คือด่านที่ทำให้คำว่า "พิสูจน์แล้ว" มีความหมาย

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

export function CheckpointQuiz({
  questions,
  requireAllCorrect,
  onPassed,
  onAnswered,
}: {
  questions: CheckpointQuestion[]
  /** true เมื่อเป็น capstone — ต้องถูกทุกข้อ */
  requireAllCorrect: boolean
  onPassed: (results: Record<string, boolean>, answers: Record<string, string[]>) => void
  onAnswered?: (results: Record<string, boolean>, answers: Record<string, string[]>) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [graded, setGraded] = useState(false)

  const results: Record<string, boolean> = Object.fromEntries(
    questions.map((q) => [q.id, sameSet(answers[q.id] ?? [], q.correct)]),
  )
  const correctCount = Object.values(results).filter(Boolean).length
  const allAnswered = questions.every((q) => (answers[q.id]?.length ?? 0) > 0)
  const passed = requireAllCorrect ? correctCount === questions.length : true

  function toggle(question: CheckpointQuestion, letter: string) {
    if (graded) return
    const isMulti = question.correct.length > 1
    setAnswers((prev) => {
      const current = new Set(prev[question.id] ?? [])
      if (isMulti) {
        if (current.has(letter)) current.delete(letter)
        else current.add(letter)
      } else {
        current.clear()
        current.add(letter)
      }
      return { ...prev, [question.id]: [...current].sort() }
    })
  }

  function grade() {
    setGraded(true)
    onAnswered?.(results, answers)
  }

  function retry() {
    setAnswers({})
    setGraded(false)
  }

  return (
    <section className="card-feature p-6 sm:p-8" aria-labelledby="checkpoint-heading" data-testid="checkpoint">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checkpoint-heading" className="font-display text-2xl font-semibold text-cs-text">
          {requireAllCorrect ? 'Required checkpoint' : 'Check yourself'}
        </h2>
        <span className="font-mono text-xs text-cs-muted">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      </div>
      <p className="mb-6 text-sm text-cs-muted">
        {requireAllCorrect
          ? 'This one is required. Answer every question correctly to mark the checkpoint as proven — you can retry as many times as you like.'
          : 'Getting one wrong is fine. The explanations are the point.'}
      </p>

      <div className="space-y-7">
        {questions.map((question, index) => {
          const picked = answers[question.id] ?? []
          const isMulti = question.correct.length > 1
          const isCorrect = results[question.id]
          return (
            <div key={question.id} data-testid={`checkpoint-q-${question.id}`}>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cs-muted">
                Question {index + 1}
                {isMulti ? ' · select all that apply' : ''}
              </p>
              <p className="mb-3 leading-relaxed text-cs-text">{question.prompt}</p>
              <div className="space-y-2">
                {Object.entries(question.choices).map(([letter, text]) => {
                  const isPicked = picked.includes(letter)
                  const answerIsRight = question.correct.includes(letter)
                  const tone = graded
                    ? answerIsRight
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
                        type={isMulti ? 'checkbox' : 'radio'}
                        name={`q-${question.id}`}
                        value={letter}
                        checked={isPicked}
                        disabled={graded}
                        onChange={() => toggle(question, letter)}
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
              {graded && (
                <p
                  className="mt-2.5 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-3 text-sm leading-relaxed text-cs-body"
                  data-testid={`checkpoint-explanation-${question.id}`}
                >
                  <span className={`font-semibold ${isCorrect ? 'text-cs-accent' : 'text-cs-amber'}`}>
                    {isCorrect ? 'Correct. ' : 'Not quite. '}
                  </span>
                  {question.explanation}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-cs-border pt-5">
        {!graded ? (
          <button
            type="button"
            onClick={grade}
            disabled={!allAnswered}
            data-testid="checkpoint-submit"
            className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
          >
            Check my answers
          </button>
        ) : (
          <>
            <span className="font-mono text-sm text-cs-muted" data-testid="checkpoint-score">
              {correctCount}/{questions.length} correct
            </span>
            {passed ? (
              <button
                type="button"
                onClick={() => onPassed(results, answers)}
                data-testid="checkpoint-continue"
                className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              >
                {requireAllCorrect ? 'Mark as proven' : 'Mark lesson done'}
              </button>
            ) : (
              <>
                <span className="text-sm text-cs-amber" data-testid="checkpoint-not-passed">
                  This checkpoint needs every answer correct.
                </span>
                <button
                  type="button"
                  onClick={retry}
                  data-testid="checkpoint-retry"
                  className="rounded-control border border-cs-border bg-cs-surface px-6 py-3 text-sm transition-colors duration-200 hover:border-cs-accent hover:text-cs-accent"
                >
                  Try again
                </button>
              </>
            )}
          </>
        )}
        {!allAnswered && !graded && (
          <span className="text-sm text-cs-muted">Answer every question to continue.</span>
        )}
      </div>
    </section>
  )
}
