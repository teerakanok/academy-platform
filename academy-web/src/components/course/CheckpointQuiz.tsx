'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AttemptQuestion, AttemptSimulation, PublicCheckpointItem } from '@/lib/content/public-lesson'
import type { CheckpointOutcome } from '@/lib/course/progress-client'
import {
  browserCheckpointDraftStore,
  checkpointDraftKey,
  clearCheckpointDraft,
  loadCheckpointDraft,
  saveCheckpointDraft,
  type CheckpointDraftScope,
} from '@/lib/course/checkpoint-draft'
import { simulationReadiness, type SimulationState } from '@/lib/simulation/types'
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
  onRetry,
  draftScope,
}: {
  /** ด่านท้ายบท — MCQ และ/หรือโจทย์จำลอง (W1) */
  items: PublicCheckpointItem[]
  /** true เมื่อเป็น capstone หรือ test-out — ข้อความบอกผู้เรียนว่าต้องถูกทุกข้อ */
  requireAllCorrect: boolean
  /** ส่งสิ่งที่ผู้เรียนทำให้เซิร์ฟเวอร์ตรวจ · null = ตรวจไม่สำเร็จ */
  onSubmit: (submission: {
    answers: Record<string, string[]>
    simulations: Record<string, SimulationState>
  }, controls: { discardDraft: () => void }) => Promise<CheckpointOutcome | { validationError: 'simulation-incomplete' } | null>
  /** ผู้เรียนกดไปต่อหลังผ่านแล้ว */
  onPassed: () => void
  /**
   * ผู้เรียนขอลองใหม่ในด่านที่ผูกกับ attempt — เจ้าของ attempt ต้องออกชุดใหม่ให้
   *
   * ไม่ใส่ = ด่านนี้ไม่ได้ผูกกับ attempt (บทสอนทั่วไป) การล้างช่องกรอกก็พอ
   */
  onRetry?: () => void
  /** เก็บ draft ได้เฉพาะโจทย์ที่ server issue แล้ว และแยกตาม attempt เสมอ */
  draftScope?: CheckpointDraftScope
}) {
  // เฉพาะข้อที่มีโจทย์จริงจาก attempt — ด่านที่ผูกกับ attempt จะส่งมาแค่รายชื่องาน
  const questions = useMemo(
    () => items.filter((item): item is AttemptQuestion => item.kind === 'mcq' && item.choices !== undefined),
    [items],
  )
  const simulations = useMemo(
    () =>
      items.filter(
        // เฉพาะด่านที่มีโจทย์จริงจาก attempt — ของในไฟล์เป็นแม่แบบที่ยังไม่ได้แทนค่า
        (item): item is AttemptSimulation => item.kind === 'simulation' && item.challenge !== undefined,
      ),
    [items],
  )
  const draftSimulations = useMemo(
    () => simulations.map(({ id, challenge }) => ({ id, surface: challenge.surface, initial: challenge.initial })),
    [simulations],
  )
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  // สถานะหน้าจอจำลองต่อด่าน — ตั้งต้นจาก `initial` ของโจทย์แต่ละตัว
  const [simStates, setSimStates] = useState<Record<string, SimulationState>>(() =>
    Object.fromEntries(simulations.map((s) => [s.id, { ...s.challenge.initial }])),
  )
  const [grading, setGrading] = useState(false)
  const [outcome, setOutcome] = useState<CheckpointOutcome | null>(null)
  const [failed, setFailed] = useState(false)
  const [validationError, setValidationError] = useState(false)
  const draftKey = draftScope ? checkpointDraftKey(draftScope) : null
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null)
  const [persistDraft, setPersistDraft] = useState(true)
  const hydrating = Boolean(draftScope && hydratedDraftKey !== draftKey)

  function discardDraft() {
    const store = browserCheckpointDraftStore()
    if (draftScope && store) clearCheckpointDraft(store, draftScope)
    setPersistDraft(false)
  }

  // Hydrate หลัง mount เพื่อไม่ให้ SSR กับ browser localStorage ให้ markup เริ่มต้นต่างกัน.
  // เมื่อ attempt เปลี่ยน LessonView จะ remount component ด้วย key ของ attempt นั้น.
  useEffect(() => {
    if (!draftScope || !draftKey) {
      setHydratedDraftKey(null)
      return
    }
    if (hydratedDraftKey === draftKey) return
    const store = browserCheckpointDraftStore()
    const saved = store ? loadCheckpointDraft(store, draftScope, questions, draftSimulations) : null
    setAnswers(saved?.answers ?? {})
    setSimStates(
      saved?.simulations ?? Object.fromEntries(simulations.map((s) => [s.id, { ...s.challenge.initial }])),
    )
    setHydratedDraftKey(draftKey)
  }, [draftKey, draftScope, draftSimulations, hydratedDraftKey, questions, simulations])

  useEffect(() => {
    if (!draftScope || !persistDraft || hydratedDraftKey !== draftKey) return
    const store = browserCheckpointDraftStore()
    if (store) saveCheckpointDraft(store, draftScope, questions, draftSimulations, { answers, simulations: simStates })
  }, [answers, draftKey, draftScope, draftSimulations, hydratedDraftKey, persistDraft, questions, simStates])

  // โจทย์จำลองไม่มี "ยังไม่ตอบ" — หน้าจอมีค่าตั้งต้นเสมอ จึงนับเฉพาะ MCQ
  const allQuestionsAnswered = questions.every((q) => (answers[q.id]?.length ?? 0) > 0)
  const allSimulationsReady = simulations.every((item) =>
    simulationReadiness(
      item.challenge.surface,
      item.challenge.initial,
      simStates[item.id] ?? item.challenge.initial,
      item.challenge.requiredFields,
    ).ready,
  )
  const allAnswered = allQuestionsAnswered && allSimulationsReady
  const results = outcome?.results
  const explanations = outcome?.explanations

  function toggle(question: Extract<PublicCheckpointItem, { kind: 'mcq' }>, letter: string) {
    if (hydrating || grading || outcome) return
    setValidationError(false)
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
    if (hydrating) return
    setGrading(true)
    setFailed(false)
    setValidationError(false)
    const next = await onSubmit({ answers, simulations: simStates }, { discardDraft })
    setGrading(false)
    if (!next) {
      setFailed(true)
      return
    }
    if ('validationError' in next) {
      setValidationError(true)
      return
    }
    if (next.passed) discardDraft()
    setOutcome(next)
  }

  function retry() {
    discardDraft()
    setAnswers({})
    setSimStates(Object.fromEntries(simulations.map((s) => [s.id, { ...s.challenge.initial }])))
    setOutcome(null)
    setFailed(false)
    setValidationError(false)
    // ด่านที่ผูกกับ attempt: การส่งคำตอบหนึ่งครั้ง = ใช้ attempt นั้นไปแล้ว (ตรวจซ้ำ
    // ด้วย attempt เดิมถูกปฏิเสธ 409) · การล้างช่องกรอกอย่างเดียวจึงเป็นทางตัน —
    // ผู้เรียนกรอกใหม่ทั้งชุดแล้วกดส่งก็ได้แต่ error (RIL cross-model รอบ W1 จับ)
    // ต้องขอโจทย์ชุดใหม่จริงๆ ซึ่ง LessonView เป็นคนถือ attempt จึงเป็นคนขอ
    onRetry?.()
  }

  return (
    <section
      className="card-feature p-6 sm:p-8"
      aria-labelledby="checkpoint-heading"
      aria-busy={hydrating || grading}
      data-testid="checkpoint"
    >
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
          ? 'This one is required. Answer every question correctly to pass it. You can try again with a fresh task.'
          : 'Getting one wrong is fine. The explanations are the point.'}
      </p>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="checkpoint-status">
        {hydrating
          ? 'Restoring your saved answers.'
          : grading
            ? 'Checking your answers.'
            : outcome?.passed
              ? 'Checkpoint passed.'
              : outcome
                ? 'Checkpoint not passed. You can try again with a fresh task.'
                : ''}
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
                        disabled={hydrating || grading || outcome !== null}
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
                onChange={(next) => {
                  if (hydrating) return
                  setValidationError(false)
                  setSimStates((prev) => ({ ...prev, [item.id]: next }))
                }}
                readOnly={hydrating || grading || outcome !== null}
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
              disabled={!allAnswered || hydrating || grading}
              data-testid="checkpoint-submit"
              className="rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent shadow-card transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              {hydrating ? 'Restoring…' : grading ? 'Checking…' : 'Check my answers'}
            </button>
            {/* ระหว่างรอ ห้ามประกาศผลล่วงหน้า — หน้าจอต้องบอกว่ากำลังตรวจ (W0-2) */}
            {(hydrating || grading) && (
              <span className="text-sm text-cs-muted" data-testid="checkpoint-grading">
                {hydrating ? 'Restoring your saved answers…' : 'Checking your answers…'}
              </span>
            )}
            {failed && (
              <span role="alert" className="text-sm text-cs-amber" data-testid="checkpoint-grade-failed">
                We could not check your answers just now. Try again in a moment.
              </span>
            )}
            {validationError && (
              <span role="alert" className="text-sm text-cs-amber" data-testid="checkpoint-validation-error">
                Finish every hands-on field and apply the settings, then check again. Your answers are still here.
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
                    ? onRetry
                      ? 'This checkpoint needs every answer correct. Try again gives you a fresh task — the details change each time.'
                      : 'This checkpoint needs every answer correct.'
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
          <span className="text-sm text-cs-muted">
            {allQuestionsAnswered && !allSimulationsReady
              ? 'Finish and apply each hands-on task before checking.'
              : 'Answer every question to continue.'}
          </span>
        )}
      </div>

      {outcome && requireAllCorrect && (
        <p className="mt-5 text-sm leading-relaxed text-cs-muted" data-testid="assessment-appeal-window">
          You can appeal this result within 30 days after it was issued.{' '}
          <a
            href="mailto:contact@cyberskills.co.th?subject=Academy%20result%20appeal"
            className="text-cs-accent underline underline-offset-4"
          >
            Contact CYBERSKILLS
          </a>{' '}
          and include your account email, course, and approximate attempt time.
        </p>
      )}
    </section>
  )
}
