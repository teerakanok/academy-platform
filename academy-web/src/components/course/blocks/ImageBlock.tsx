'use client'

import { useEffect, useRef, useState } from 'react'
import { trapDialogFocus } from '@/components/course/dialog-focus'

// ภาพในบทเรียน — อยู่ในหน้าแบบพอดีสายตา แล้วคลิกขยายเต็มจอเมื่อต้องเพ่งรายละเอียด
// (ไดอะแกรม/สกรีนช็อตมักเล็กเกินอ่านในความกว้างคอลัมน์อ่าน)

export function ImageBlock({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus()
    // กันหน้าเลื่อนอยู่ข้างหลังตอนเปิดเต็มจอ
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

  return (
    <figure className="not-prose" data-testid="image-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="image-expand"
        aria-label={`Expand image: ${alt}`}
        className="group block w-full overflow-hidden rounded-2xl border border-cs-border bg-cs-surface transition-colors hover:border-cs-accent"
      >
        {/* ภาพจากคลังเนื้อหาไม่ได้ประกาศขนาดมาด้วย จึงใช้ img ธรรมดา + lazy
            (next/image ต้องรู้สัดส่วนล่วงหน้าถึงจะไม่ทำ layout กระตุก) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="block h-auto w-full" />
        <span className="flex items-center justify-end gap-1.5 px-3 py-2 font-mono text-[11px] text-cs-muted transition-colors group-hover:text-cs-accent">
          <span aria-hidden="true">⤢</span> Click to expand
        </span>
      </button>

      {caption && <figcaption className="mt-2 text-sm leading-relaxed text-cs-muted">{caption}</figcaption>}

      {expanded && (
        <dialog
          ref={dialogRef}
          aria-label={alt}
          data-testid="image-lightbox"
          onClose={finishClosing}
          onKeyDown={trapDialogFocus}
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-cs-bg/[0.985] p-4 text-cs-text backdrop-blur-md open:flex open:flex-col sm:p-8"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="min-w-0 truncate text-sm text-cs-muted">{caption ?? alt}</p>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              data-testid="image-lightbox-close"
              className="shrink-0 rounded-xl border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
            >
              <span className="sm:hidden">Close</span>
              <span className="hidden sm:inline">Close (Esc)</span>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
          </div>
        </dialog>
      )}
    </figure>
  )
}
