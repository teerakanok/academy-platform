'use client'

import { useEffect, useRef, useState } from 'react'
import { trapDialogFocus } from '@/components/course/dialog-focus'

// ช่อง lab — เป็นของที่ผู้เรียนต้อง "ลงมือ" จึงเป็นกรณีเดียวที่เราฝังของที่รันอยู่
// ข้างในหน้าเรา
//
// scale กำหนด "ท่าตั้งต้น" ไม่ใช่ "ท่าเดียวที่ทำได้":
//   inline — แบบฝึกสั้น เริ่มต้นอยู่ในสายการอ่าน ไม่ตัดจังหวะ
//   full   — สถานการณ์จริง เริ่มต้นเป็นพื้นที่ทำงานเต็มการ์ด
// ทั้งสองแบบขยายได้เสมอ เพราะความถนัดของแต่ละคนและขนาดจอไม่เท่ากัน การล็อกให้
// เล็กอย่างเดียวขัดกับหลักของ product เองที่ผู้เรียน override ได้ทุกจุด
//
// แต่ขยายคนละท่าโดยตั้งใจ:
//   inline → กล่องใหญ่กลางจอ ยังเห็นหน้าบทเรียนจางๆ ข้างหลัง = "ยังอยู่ในบทเรียน
//            แค่ใหญ่ขึ้น" เหมาะกับงานสองนาที
//   full   → เต็มจอจริง = เข้าโหมดทำงาน เหมาะกับงานสิบนาทีขึ้นไป
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
      {/* พูดตรงๆ บนจอเล็กแทนที่จะยัด terminal ให้พิมพ์ด้วยคีย์บอร์ดมือถือ — และ
          ไม่ปิดกั้น เพราะการอ่านทั้งบทยังทำบนมือถือได้ครบ ปัญหาอยู่ที่ "พิมพ์"
          ไม่ใช่ที่ "หน้าจอ" (M4: เมื่อมี lab ที่ไม่ต้องพิมพ์ ให้ทำบรรทัดนี้เป็นเงื่อนไข) */}
      <p className="mt-2 text-xs text-cs-muted sm:hidden">
        Labs need typing, so they go better on a computer. The rest of the lesson reads fine here.
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
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const isInline = scale === 'inline'

  useEffect(() => {
    if (!expanded) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  function close() {
    dialogRef.current?.close()
  }

  function finishClosing() {
    setExpanded(false)
    triggerRef.current?.focus()
  }

  const overlay = expanded && (
    <dialog
      ref={dialogRef}
      className={
        isInline
          ? 'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-cs-text/40 p-4 text-cs-text backdrop-blur-sm open:flex open:items-center open:justify-center sm:p-8'
          : 'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-cs-bg p-4 text-cs-text open:flex open:flex-col sm:p-6'
      }
      aria-label={title}
      data-testid="lab-fullscreen"
      data-mode={isInline ? 'dialog' : 'fullscreen'}
      onClose={finishClosing}
      onKeyDown={trapDialogFocus}
      onClick={
        isInline
          ? (event) => {
              if (event.target === event.currentTarget) close()
            }
          : undefined
      }
    >
      <div
        className={
          isInline
            ? 'flex max-h-[85vh] w-full max-w-5xl flex-col rounded-feature border border-cs-border bg-cs-surface p-5 shadow-feature'
            : 'flex min-h-0 flex-1 flex-col'
        }
        onClick={isInline ? (e) => e.stopPropagation() : undefined}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="min-w-0 truncate font-display text-base font-semibold text-cs-text">{title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            data-testid="lab-fullscreen-close"
            className="shrink-0 rounded-control border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
          >
            {/* บนมือถือไม่มีปุ่ม Escape จะบอกให้กดก็ไร้ความหมาย — และคำเต็มยาวเกิน
                จนล้นขอบจอ ปุ่มปิดที่มองเห็นได้จึงเป็นทางออกหลัก ส่วน Esc เป็นทางลัด
                ของคนใช้คีย์บอร์ด */}
            <span className="sm:hidden">Done</span>
            <span className="hidden sm:inline">{isInline ? 'Done (Esc)' : 'Exit full screen (Esc)'}</span>
          </button>
        </div>
        <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-xl border border-dashed border-cs-accent-border bg-cs-surface-sunken">
          <Placeholder status={status} compact={false} />
        </div>
      </div>
    </dialog>
  )

  // ---------- แบบฝึกสั้น: อยู่ในสายการอ่าน ----------
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
        {/* min-h ไม่ใช่ h ตายตัว — ความสูงคงที่เคยทำให้ข้อความล้นออกไปทับย่อหน้า
              ข้างบนบนจอแคบ กล่องต้องยืดตามเนื้อหา ไม่ใช่ให้เนื้อหาไหลออกนอกกล่อง */}
          <div className="relative mx-5 mb-4 flex min-h-[9rem] items-center justify-center rounded-xl bg-cs-surface-sunken py-4 pt-10 sm:pt-4">
          <Placeholder status={status} compact />
          {/* ปุ่มขยายเบาๆ ไม่แย่งความสนใจจากการอ่าน แต่เข้าถึงด้วยคีย์บอร์ดได้เสมอ
              (ไม่ซ่อนไว้ให้โผล่ตอน hover เพราะทัชสกรีนกับคีย์บอร์ดจะหาไม่เจอ) */}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded(true)}
            data-testid="lab-expand"
            className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg border border-cs-border bg-cs-surface px-3 py-2 font-mono text-[11px] text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent sm:px-2.5 sm:py-1"
          >
            <span aria-hidden="true">⤢</span> Bigger
          </button>
        </div>
        {overlay}
      </section>
    )
  }

  // ---------- สถานการณ์เต็ม: ต้องมีพื้นที่ทำงานจริง ----------
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
          ref={triggerRef}
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="lab-expand"
          className="shrink-0 rounded-control border-2 border-cs-accent bg-cs-surface px-4 py-2 text-sm font-medium text-cs-accent transition-colors hover:bg-cs-accent-dim"
        >
          Expand to full screen
        </button>
      </div>

      <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-cs-accent-border bg-cs-surface-sunken">
        <Placeholder status={status} compact={false} />
      </div>

      {overlay}
    </section>
  )
}
