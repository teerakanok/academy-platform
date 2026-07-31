'use client'

import { useEffect, useState } from 'react'

// Timer แบบ deadline-based: อ่านจาก endsAt timestamp เสมอ — reload/สลับ tab
// แล้วเวลาไม่เพี้ยน (แผน §4-M2-2); การหมดเวลา = auto-submit ผ่าน onExpire

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function Timer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const remaining = endsAt - now

  useEffect(() => {
    if (remaining <= 0) onExpire()
  }, [remaining <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const low = remaining <= 5 * 60_000

  return (
    <div
      data-testid="exam-timer"
      role="timer"
      aria-label="เวลาที่เหลือ"
      className={`font-mono text-lg tabular-nums ${low ? 'text-cs-amber' : 'text-cs-text'}`}
    >
      {formatRemaining(remaining)}
    </div>
  )
}
