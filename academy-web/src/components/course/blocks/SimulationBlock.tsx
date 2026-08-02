'use client'

import { useState } from 'react'
import type { PublicSimulationChallenge } from '@/lib/content/public-lesson'
import type { SimulationState } from '@/lib/simulation/types'
import { NetworkInterfaceSim } from './NetworkInterfaceSim'

// โจทย์จำลอง — โจทย์ + หน้าจอ + ปุ่มตรวจ · **เซิร์ฟเวอร์เป็นคนตรวจ**
//
// เดิม component นี้ได้ `requirements[].operator/value` มาทั้งชุดแล้วตรวจเอง และโชว์
// `hints` ให้เองหลังลองสองครั้งโดยไม่ผ่านเซิร์ฟเวอร์เลย — แปลว่ากติกาการตรวจกับคำใบ้
// อยู่ใน payload ที่ view-source เห็น และคนอ่านจากโหมดฝึกเอาไปตอบโหมดวัดผลได้
// ตอนนี้ทั้งการตรวจและการตัดสินว่า "ถึงเวลาให้คำใบ้หรือยัง" อยู่ที่ `/api/practice/simulation`
//
// สองโหมดต่างกันที่ "ผู้เรียนได้อะไรกลับมา" ไม่ใช่ต่างที่หน้าจอ:
//   practice — ตรวจกี่ครั้งก็ได้ · บทปกติบอกได้ว่าข้อไหนยังไม่ผ่าน · ด่านของ capstone
//              ปิดเท่าโหมดวัดผล (เซิร์ฟเวอร์เป็นคนเลือกให้ ไม่ใช่หน้านี้)
//   assessed — ใช้ตอนวัดผลจริง บอกแค่ผ่าน/ไม่ผ่าน (ต่อเข้า checkpoint ใน W1)

const SURFACES = {
  'network-interface': NetworkInterfaceSim,
} as const

interface PracticeVerdict {
  passed: boolean
  results?: { id: string; label: string; met: boolean }[]
  metCount?: number
  total?: number
  debrief?: string
  hints?: string[]
}

export function SimulationBlock({
  challenge,
  slug,
  nodeId,
  mode = 'practice',
}: {
  // ⚠️ PublicSimulationChallenge — ไม่มี operator/value/hints อยู่ในโครงเลย
  challenge: PublicSimulationChallenge
  slug: string
  nodeId: string
  mode?: 'practice' | 'assessed'
}) {
  const [state, setState] = useState<SimulationState>(() => ({ ...challenge.initial }))
  const [verdict, setVerdict] = useState<PracticeVerdict | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)
  // คำใบ้ที่ขอมาแล้วจะแสดงทันที — สถานะนี้มีไว้ให้พับเก็บได้เท่านั้น
  const [hintsHidden, setHintsHidden] = useState(false)

  const Surface = SURFACES[challenge.surface]
  const locked = mode === 'assessed' && verdict !== null

  async function check(wantHint = false) {
    if (checking) return
    setAttempts((n) => n + 1)
    setChecking(true)
    setFailed(false)
    try {
      const res = await fetch('/api/practice/simulation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, nodeId, challengeId: challenge.id, state, wantHint }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean } & PracticeVerdict
      if (!res.ok || !body.ok) {
        setFailed(true)
        return
      }
      setVerdict(body)
    } catch {
      setFailed(true)
    } finally {
      setChecking(false)
    }
  }

  function reset() {
    setState({ ...challenge.initial })
    setVerdict(null)
    setHintsHidden(false)
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
          onClick={() => check()}
          disabled={locked || checking}
          data-testid="simulation-check"
          className="rounded-control bg-cs-accent-fill px-5 py-2.5 text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {checking ? 'Checking…' : mode === 'assessed' ? 'Submit' : 'Check my setup'}
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
        {/* คำใบ้ต้องขอจากเซิร์ฟเวอร์ — เดิมหน้านี้ถือคำใบ้ไว้เองแล้วนับครั้งเอง
            ซึ่งเปิด devtools ก็อ่านได้ตั้งแต่วินาทีแรก · เสนอปุ่มหลังลองเองสองครั้ง
            (จังหวะของ UI) แต่ตัวคำใบ้มาจากเซิร์ฟเวอร์เสมอ */}
        {mode === 'practice' && attempts >= 2 && verdict && !verdict.passed && (
          <button
            type="button"
            onClick={() => (verdict.hints ? setHintsHidden((v) => !v) : check(true))}
            disabled={checking}
            data-testid="simulation-hint-toggle"
            className="text-sm text-cs-accent underline underline-offset-4 hover:text-cs-text"
          >
            {verdict.hints && !hintsHidden ? 'Hide the nudge' : 'Give me a nudge'}
          </button>
        )}
        {failed && (
          <span className="text-sm text-cs-amber" data-testid="simulation-check-failed">
            We could not check your setup just now. Try again in a moment.
          </span>
        )}
      </div>

      {verdict?.hints && !hintsHidden && (
        <ul className="mt-4 space-y-1.5 border-l-2 border-cs-accent pl-4" data-testid="simulation-hints">
          {verdict.hints.map((h, i) => (
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
              {verdict.debrief && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-body">{verdict.debrief}</p>
              )}
            </>
          ) : !verdict.results ? (
            // เซิร์ฟเวอร์ไม่ส่งผลรายข้อมา (ด่านของ capstone) — บอกได้แค่ว่ายังไม่ผ่าน
            <p className="font-display text-base font-semibold text-cs-text" data-testid="simulation-passed-only">
              Not yet. Read the brief again and adjust the setup.
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
