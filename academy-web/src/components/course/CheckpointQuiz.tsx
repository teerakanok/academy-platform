'use client'

import { useState } from 'react'
import type { PublicCheckpointItem } from '@/lib/content/public-lesson'
import type { CheckpointOutcome } from '@/lib/course/progress-client'
import type { SimulationState } from '@/lib/simulation/types'
import { SimulationSurface } from './blocks/SimulationSurface'

// Checkpoint ท้ายบท — **เซิร์ฟเวอร์เป็นคนตรวจ ไม่ใช่หน้านี้**
//
// เดิม component นี้รับ `correct` มากับคำถามแล้วเทียบเอง ซึ่งแปลว่าเฉลยทั้งชุดอยู่ใน
// payload ที่ view-source เห็น — ไม่ต้องปลอมผลก็ผ่านได้ (F1) ตอนนี้มันรับได้แค่
// `PublicCheckpointQuestion` ซึ่งไม่มีเฉลยอยู่ในโครง และผลทุกอย่างมาจาก `onSubmit`
//
// สิ่งที่แสดงได้จึงขึ้นกับสิ่งที่เซิร์ฟเวอร์ยอมบอก:
//   assessed (capstone / test-out) → มีแค่ผ่าน/ไม่ผ่าน
//   learn (บทปกติ) → ผลรายข้อ + คำอธิบาย เพราะเป็นการสอน

export function CheckpointQuiz({
  items,
  requireAllCorrect,
  onSubmit,
  onPassed,
}: {
  /** ด่านท้ายบท — MCQ และ/หรือโจทย์จำลอง (W1) */
  items: PublicCheckpointItem[]
  /** true เมื่อเป็น capstone หรือ test-out — ข้อความบอกผู้เรียนว่าต้องถูกทุกข้อ */
  requireAllCorrect: boolean
  /** ส่งสิ่งที่ผู้เรียนทำให้เซิร์ฟเวอร์ตรวจ · null = ตรวจไม่สำเร็จ */
  onSubmit: (submission: {
    answers: Record<string, string[]>
    simulations: Record<string, SimulationState>
  }) => Promise<CheckpointOutcome | null>
  /** ผู้เรียนกดไปต่อหลังผ่านแล้ว */
  onPassed: () => void
}) {
  const questions = items.filter((item): item is Extract<PublicCheckpointItem, { kind: 'mcq' }> => item.kind === 'mcq')
  const simulations = items.filter(
    (item): item is Extract<PublicCheckpointItem, { kind: 'simulation' }> => item.kind === 'simulation',
  )
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  // สถานะหน้าจอจำลองต่อด่าน — ตั้งต้นจาก `initial` ของโจทย์แต่ละตัว
  const [simStates, setSimStates] = useState<Record<string, SimulationState>>(() =>
    Object.fromEntries(simulations.map((s) => [s.id, { ...s.challenge.initial }])),
  )
  const [grading, setGrading] = useState(false)
  const [outcome, setOutcome] = useState<CheckpointOutcome | null>(null)
  const [failed, setFailed] = useState(false)

  // โจทย์จำลองไม่มี "ยังไม่ตอบ" — หน้าจอมีค่าตั้งต้นเสมอ จึงนับเฉพาะ MCQ
  const allAnswered = questions.every((q) => (answers[q.id]?.length ?? 0) > 0)
  const results = outcome?.results
  const explanations = outcome?.explanations

  function toggle(question: Extract<PublicCheckpointItem, { kind: 'mcq' }>, letter: string) {
    if (grading || outcome) return
    setAnswers((prev) => {
      const current = prev[question.id] ?? []
      // `multiple` มาจากเซิร์ฟเวอร์ — เดิมหน้านี้ดูจาก `correct.length > 1` ซึ่งคือ
      // การอ่านเฉลยเพื่อตัดสินรูปแบบการเลือก
      if (!question.multiple) {
        return { ...prev, [question.id]: current[0] === letter ? [] : [letter] }
      }
      const set = new Set(current)
      if (!set.delete(letter)) set.add(letter)
      return { ...prev, [question.id]: [...set].sort() }
    })
  }

  async function grade() {
    setGrading(true)
    setFailed(false)
    const next = await onSubmit({ answers, simulations: simStates })
    setGrading(false)
    if (!next) {
      setFailed(true)
      return
    }
    setOutcome(next)
  }

  function retry() {
    setAnswers({})
    setSimStates(Object.fromEntries(simulations.map((s) => [s.id, { ...s.challenge.initial }])))
    setOutcome(null)
    setFailed(false)
  }

  return (
    <section className="card-feature p-6 sm:p-8" aria-labelledby="checkpoint-heading" data-testid="checkpoint">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checkpoint-heading" className="font-display text-2xl font-semibold text-cs-text">
          {requireAllCorrect ? 'Required checkpoint' : 'Check yourself'}
        </h2>
        <span className="font-mono text-xs text-cs-muted">
          {items.length} {items.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>
      <p className="mb-6 text-sm text-cs-muted">
        {requireAllCorrect
          ? 'This one is required. Answer every question correctly to pass it — you can retry as many times as you like.'
          : 'Getting one wrong is fine. The explanations are the point.'}
      </p>

      <div className="space-y-7">
        {questions.map((question, index) => {
          const picked = answers[question.id] ?? []
          const isCorrect = results?.[question.id]
          const explanation = explanations?.[question.id]
          return (
            <div key={question.id} data-testid={`checkpoint-q-${question.id}`}>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cs-muted">
                Question {index + 1}
                {question.multiple ? ' · select all that apply' : ''}
              </p>
              <p className="mb-3 leading-relaxed text-cs-text">{question.prompt}</p>
              <div className="space-y-2">
                {Object.entries(question.choices).map(([letter, text]) => {
                  const isPicked = picked.includes(letter)
                  // ระบายสีได้เฉพาะเมื่อเซิร์ฟเวอร์บอกผลรายข้อมา (โหมด learn)
                  // โหมด assessed ไม่มี results จึงไม่มีสีที่แปรตามความถูกผิด — ถ้ามี
                  // มันจะกลายเป็นเครื่องเฉลยที่ดูออกจากหน้าจอโดยไม่ต้องอ่าน response
                  const tone =
                    isCorrect !== undefined && isPicked
                      ? isCorrect
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
                        type={question.multiple ? 'checkbox' : 'radio'}
                        name={`q-${question.id}`}
                        value={letter}
                        checked={isPicked}
                        disabled={grading || outcome !== null}
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
              {explanation && (
                <p
                  className="mt-2.5 rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-3 text-sm leading-relaxed text-cs-body"
                  data-testid={`checkpoint-explanation-${question.id}`}
                >
                  <span className={`font-semibold ${isCorrect ? 'text-cs-accent' : 'text-cs-amber'}`}>
                    {isCorrect ? 'Correct. ' : 'Not quite. '}
                  </span>
                  {explanation}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {simulations.length > 0 && (
        <div className="mt-8 space-y-6 border-t border-cs-border pt-7">
          {simulations.map((item) => (
            <div key={item.id} data-testid={`checkpoint-sim-${item.id}`}>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cs-muted">
                Hands-on · set it up
              </p>
              <h3 className="mb-2 font-display text-lg font-semibold text-cs-text">{item.challenge.title}</h3>
              <p className="mb-4 max-w-2xl text-[0.95rem] leading-relaxed text-cs-body">{item.challenge.brief}</p>
              {/* หน้าจอเดียวกับโหมดฝึก — ต่างกันแค่ว่าผลถูกส่งไปพร้อม checkpoint
                  และเซิร์ฟเวอร์ตรวจทีเดียวทั้งด่าน ไม่มีปุ่มตรวจแยกของตัวเอง */}
              <SimulationSurface
                surface={item.challenge.surface}
                state={simStates[item.id] ?? item.challenge.initial}
                onChange={(next) => setSimStates((prev) => ({ ...prev, [item.id]: next }))}
                readOnly={grading || outcome !== null}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-cs-border pt-5">
        {!outcome ? (
          <>
            <button
              type="button"
              onClick={grade}
              disabled={!allAnswered || grading}
              data-testid="checkpoint-submit"
              className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              {grading ? 'Checking…' : 'Check my answers'}
            </button>
            {/* ระหว่างรอ ห้ามประกาศผลล่วงหน้า — หน้าจอต้องบอกว่ากำลังตรวจ (W0-2) */}
            {grading && (
              <span className="text-sm text-cs-muted" data-testid="checkpoint-grading">
                Checking your answers…
              </span>
            )}
            {failed && (
              <span className="text-sm text-cs-amber" data-testid="checkpoint-grade-failed">
                We could not check your answers just now. Try again in a moment.
              </span>
            )}
          </>
        ) : (
          <>
            {outcome.correctCount !== undefined && outcome.total !== undefined && (
              <span className="font-mono text-sm text-cs-muted" data-testid="checkpoint-score">
                {outcome.correctCount}/{outcome.total} correct
              </span>
            )}
            {outcome.passed ? (
              <button
                type="button"
                onClick={onPassed}
                data-testid="checkpoint-continue"
                className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              >
                {requireAllCorrect ? 'Mark checkpoint passed' : 'Mark lesson done'}
              </button>
            ) : (
              <>
                <span className="text-sm text-cs-amber" data-testid="checkpoint-not-passed">
                  {requireAllCorrect
                    ? 'This checkpoint needs every answer correct.'
                    : 'Answer every question to finish the lesson.'}
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
        {!allAnswered && !outcome && !grading && (
          <span className="text-sm text-cs-muted">Answer every question to continue.</span>
        )}
      </div>
    </section>
  )
}
