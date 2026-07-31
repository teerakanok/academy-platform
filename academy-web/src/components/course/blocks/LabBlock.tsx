'use client'

import { useEffect, useState } from 'react'

// ช่อง lab — เป็นของที่ผู้เรียนต้อง "ลงมือ" จึงเป็นกรณีเดียวที่เราฝังของที่รันอยู่
// ข้างในหน้าเรา และต้องขยายเต็มจอได้จริง (terminal ในกล่องเล็กใช้งานไม่ได้)
//
// ตอนนี้ยังเป็นโครงว่าง: lab plane จริงมาใน M4 (reuse ของ Crux) — สิ่งที่ทำไว้แล้ว
// คือ "รูปทรงและพฤติกรรม" ของช่องนี้ เพื่อให้เสียบของจริงทีหลังโดยไม่ต้องรื้อ UX

export function LabBlock({
  title,
  description,
  estimatedMinutes,
  status,
}: {
  title: string
  description: string
  estimatedMinutes: number
  status: 'coming-soon' | 'ready'
}) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [fullscreen])

  const panel = (
    <div
      className={`flex items-center justify-center border border-dashed border-cs-accent-2-border bg-cs-surface-2 text-center ${
        fullscreen ? 'min-h-0 flex-1 rounded-2xl' : 'aspect-[16/9] rounded-xl'
      }`}
    >
      <div className="px-6">
        <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent-2">Browser lab</p>
        <p className="mt-2 text-sm text-cs-muted">
          {status === 'coming-soon'
            ? 'The hands-on environment loads here. Nothing to install — it runs in this tab.'
            : 'Starting your environment…'}
        </p>
      </div>
    </div>
  )

  return (
    <section
      className="not-prose rounded-2xl border border-cs-accent-2-border bg-cs-surface p-5 shadow-card"
      data-testid="lab-block"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent-2">
            Hands-on · about {estimatedMinutes} minutes
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-cs-text">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-cs-body">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          data-testid="lab-expand"
          className="shrink-0 rounded-xl border border-cs-accent-2-border bg-cs-accent-2-dim px-4 py-2 text-sm font-medium text-cs-accent-2 transition-opacity hover:opacity-90"
        >
          Expand to full screen
        </button>
      </div>

      {panel}

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-cs-bg p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-testid="lab-fullscreen"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="min-w-0 truncate font-display text-base font-semibold text-cs-text">{title}</p>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              data-testid="lab-fullscreen-close"
              autoFocus
              className="shrink-0 rounded-xl border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
            >
              Exit full screen (Esc)
            </button>
          </div>
          {panel}
        </div>
      )}
    </section>
  )
}
