'use client'

import { useState } from 'react'
import { gradeSimulation, type SimulationChallenge, type SimulationState, type SimulationVerdict } from '@/lib/simulation/types'
import { NetworkInterfaceSim } from './NetworkInterfaceSim'

// โจทย์จำลอง — โจทย์ + หน้าจอ + ปุ่มตรวจ
//
// สองโหมด ต่างกันที่ "ผู้เรียนได้อะไรกลับมา" ไม่ใช่ต่างที่หน้าจอ:
//   practice — ตรวจกี่ครั้งก็ได้ บอกทีละข้อว่าอะไรยังไม่ผ่าน (แต่ไม่เฉลยค่า)
//   assessed — ตรวจครั้งเดียว บอกแค่ผ่าน/ไม่ผ่าน ใช้ตอนวัดผลจริง
//
// ที่ไม่เฉลยค่าที่ถูกแม้ในโหมดฝึก เพราะจุดประสงค์คือให้กลับไปคิดจากโจทย์
// ถ้าเฉลยเลขให้ ผู้เรียนก็แค่ก๊อปลงช่อง แล้วไม่ได้อะไรติดตัวไป

const SURFACES = {
  'network-interface': NetworkInterfaceSim,
} as const

export function SimulationBlock({
  challenge,
  mode = 'practice',
  onResult,
}: {
  challenge: SimulationChallenge
  mode?: 'practice' | 'assessed'
  onResult?: (verdict: SimulationVerdict) => void
}) {
  const [state, setState] = useState<SimulationState>(() => ({ ...challenge.initial }))
  const [verdict, setVerdict] = useState<SimulationVerdict | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [showHints, setShowHints] = useState(false)

  const Surface = SURFACES[challenge.surface]
  const locked = mode === 'assessed' && verdict !== null

  function check() {
    const next = gradeSimulation(challenge, state)
    setVerdict(next)
    setAttempts((n) => n + 1)
    onResult?.(next)
  }

  function reset() {
    setState({ ...challenge.initial })
    setVerdict(null)
  }

  return (
    <section
      className="not-prose card-feature card-takeaway p-6 sm:p-7"
      data-testid="simulation-block"
      data-challenge={challenge.id}
      data-mode={mode}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">
        {mode === 'assessed' ? 'Prove it · hands-on' : 'Set it up yourself'}
      </p>
      <h3 className="mt-1.5 font-display text-xl font-semibold text-cs-text">{challenge.title}</h3>
      <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-cs-body" data-testid="simulation-brief">
        {challenge.brief}
      </p>

      <div className="mt-5">
        <Surface state={state} onChange={setState} readOnly={locked} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={check}
          disabled={locked}
          data-testid="simulation-check"
          className="rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {mode === 'assessed' ? 'Submit' : 'Check my setup'}
        </button>
        {mode === 'practice' && (
          <button
            type="button"
            onClick={reset}
            data-testid="simulation-reset"
            className="rounded-control border border-cs-border px-4 py-2.5 text-sm text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent"
          >
            Start over
          </button>
        )}
        {mode === 'practice' && challenge.hints && challenge.hints.length > 0 && attempts >= 2 && !verdict?.passed && (
          // คำใบ้โผล่หลังลองเองสองครั้ง — ให้เร็วกว่านี้คือชิงคิดแทน
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            data-testid="simulation-hint-toggle"
            className="text-sm text-cs-accent underline underline-offset-4 hover:text-cs-text"
          >
            {showHints ? 'Hide the nudge' : 'Give me a nudge'}
          </button>
        )}
      </div>

      {showHints && challenge.hints && (
        <ul className="mt-4 space-y-1.5 border-l-2 border-cs-accent pl-4" data-testid="simulation-hints">
          {challenge.hints.map((h, i) => (
            <li key={i} className="text-sm leading-relaxed text-cs-body">
              {h}
            </li>
          ))}
        </ul>
      )}

      {verdict && (
        <div className="mt-5 border-t border-cs-border pt-5" data-testid="simulation-verdict" data-passed={verdict.passed}>
          {verdict.passed ? (
            <>
              <p className="font-display text-base font-semibold text-cs-text">
                That configuration meets the brief.
              </p>
              {challenge.debrief && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-body">{challenge.debrief}</p>
              )}
            </>
          ) : mode === 'assessed' ? (
            <p className="font-display text-base font-semibold text-cs-text">
              {verdict.metCount} of {verdict.total} requirements met.
            </p>
          ) : (
            <>
              <p className="text-sm text-cs-body">
                <span className="font-medium text-cs-text">
                  {verdict.metCount} of {verdict.total}
                </span>{' '}
                requirements met. The ones still open:
              </p>
              <ul className="mt-3 space-y-2">
                {verdict.results.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5 text-sm leading-relaxed" data-testid={`req-${r.id}`} data-met={r.met}>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 ${
                        r.met ? 'border-cs-accent bg-cs-accent text-cs-on-accent' : 'border-cs-border-2'
                      }`}
                    >
                      {r.met && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M2 6.2 4.7 9 10 3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={r.met ? 'text-cs-muted' : 'text-cs-text'}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
