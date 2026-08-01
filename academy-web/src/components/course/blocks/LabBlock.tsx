'use client'

import { useEffect, useState } from 'react'

// ช่อง lab — เป็นของที่ผู้เรียนต้อง "ลงมือ" จึงเป็นกรณีเดียวที่เราฝังของที่รันอยู่
// ข้างในหน้าเรา
//
// มีสองขนาดโดยเจตนา:
//   inline — แบบฝึกสั้นๆ ทำคาที่กำลังอ่าน ไม่ต้องเปิดเต็มจอ ไม่ต้องเปลี่ยนบริบท
//   full   — สถานการณ์จริงที่ต้องใช้พื้นที่ทำงาน มีปุ่มขยายเต็มจอ
// เหตุผล: การบังคับให้เปิด cockpit เต็มจอเพื่อทำอะไรสองนาที คือความรำคาญที่ทำให้
// คนข้าม lab ไปเลย ซึ่งแพงกว่าการที่ lab เล็กไปหน่อยมาก
//
// ตอนนี้ยังเป็นโครงว่าง: lab plane จริงมาใน M4 (reuse ของ Crux) — สิ่งที่ทำไว้แล้ว
// คือรูปทรงและพฤติกรรมของช่องนี้ เพื่อให้เสียบของจริงทีหลังโดยไม่ต้องรื้อ UX

function Placeholder({ status, compact }: { status: 'coming-soon' | 'ready'; compact: boolean }) {
  return (
    <div className="px-5 text-center">
      <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">Browser lab</p>
      <p className={`mt-1.5 text-cs-muted ${compact ? 'text-xs' : 'text-sm'}`}>
        {status === 'coming-soon'
          ? 'The hands-on environment loads here. Nothing to install — it runs in this tab.'
          : 'Starting your environment…'}
      </p>
    </div>
  )
}

export function LabBlock({
  title,
  description,
  estimatedMinutes,
  status,
  scale = 'inline',
}: {
  title: string
  description: string
  estimatedMinutes: number
  status: 'coming-soon' | 'ready'
  scale?: 'inline' | 'full'
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const isInline = scale === 'inline'

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

  // ---------- แบบฝึกสั้น: อยู่ในสายการอ่าน ไม่ตัดจังหวะ ----------
  if (isInline) {
    return (
      <section
        className="not-prose overflow-hidden rounded-2xl border-2 border-dashed border-cs-accent-border bg-cs-surface"
        data-testid="lab-block"
        data-scale="inline"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">
            Try it here · {estimatedMinutes} min
          </p>
          <h3 className="font-display text-base font-semibold text-cs-text">{title}</h3>
        </div>
        <p className="px-5 pb-3 pt-1 text-sm leading-relaxed text-cs-body">{description}</p>
        <div className="mx-5 mb-4 flex h-36 items-center justify-center rounded-xl bg-cs-surface-sunken">
          <Placeholder status={status} compact />
        </div>
      </section>
    )
  }

  // ---------- สถานการณ์เต็ม: ต้องมีพื้นที่ทำงานจริง ----------
  const panel = (
    <div
      className={`flex items-center justify-center border border-dashed border-cs-accent-border bg-cs-surface-sunken ${
        fullscreen ? 'min-h-0 flex-1 rounded-feature' : 'aspect-[16/9] rounded-xl'
      }`}
    >
      <Placeholder status={status} compact={false} />
    </div>
  )

  return (
    <section
      className="not-prose rounded-feature border border-cs-border bg-cs-surface p-5 shadow-feature"
      data-testid="lab-block"
      data-scale="full"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wide text-cs-accent">
            Hands-on · about {estimatedMinutes} minutes
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-cs-text">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-cs-body">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          data-testid="lab-expand"
          className="shrink-0 rounded-control border-2 border-cs-accent bg-cs-surface px-4 py-2 text-sm font-medium text-cs-accent transition-colors hover:bg-cs-accent-dim"
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
              className="shrink-0 rounded-control border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
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
