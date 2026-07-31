'use client'

import { useEffect, useRef, useState } from 'react'

// ภาพในบทเรียน — อยู่ในหน้าแบบพอดีสายตา แล้วคลิกขยายเต็มจอเมื่อต้องเพ่งรายละเอียด
// (ไดอะแกรม/สกรีนช็อตมักเล็กเกินอ่านในความกว้างคอลัมน์อ่าน)

export function ImageBlock({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [expanded, setExpanded] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    // กันหน้าเลื่อนอยู่ข้างหลังตอนเปิดเต็มจอ
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  return (
    <figure className="not-prose" data-testid="image-block">
      <button
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          data-testid="image-lightbox"
          className="fixed inset-0 z-50 flex flex-col bg-cs-bg/[0.985] p-4 backdrop-blur-md sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="min-w-0 truncate text-sm text-cs-muted">{caption ?? alt}</p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setExpanded(false)}
              data-testid="image-lightbox-close"
              className="shrink-0 rounded-xl border border-cs-border px-4 py-2 text-sm text-cs-body transition-colors hover:border-cs-accent hover:text-cs-accent"
            >
              Close (Esc)
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </figure>
  )
}
