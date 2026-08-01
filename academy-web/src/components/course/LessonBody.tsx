import type { LessonBlock } from '@/lib/content/course-types'
import { ImageBlock } from './blocks/ImageBlock'
import { LabBlock } from './blocks/LabBlock'

const FILE_LABEL: Record<'pdf' | 'zip' | 'other', string> = {
  pdf: 'PDF',
  zip: 'ZIP',
  other: 'File',
}

// เรนเดอร์เนื้อหาบทเรียนจากบล็อกที่มีชนิดชัดเจน — ไม่รับ HTML ดิบจากเนื้อหา
// จึงไม่มีช่องทาง XSS จากฝั่ง content และคุมหน้าตาได้สม่ำเสมอทุกบท

const CALLOUT_TONE = {
  info: { wrap: 'border-cs-accent-2-border bg-cs-accent-2-dim', label: 'text-cs-accent-2' },
  tip: { wrap: 'border-cs-accent-border bg-cs-accent-dim', label: 'text-cs-accent' },
  warning: { wrap: 'border-cs-amber-border bg-cs-amber-dim', label: 'text-cs-amber' },
} as const

export function LessonBody({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="prose-lesson space-y-5 text-cs-body">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2 key={index} className="pt-6 font-display text-2xl font-semibold leading-snug text-cs-text">
                {block.text}
              </h2>
            )

          case 'paragraph':
            return <p key={index}>{block.text}</p>

          case 'list':
            return block.ordered ? (
              <ol key={index} className="list-decimal space-y-1.5 pl-6 leading-relaxed">
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            ) : (
              <ul key={index} className="list-disc space-y-1.5 pl-6 leading-relaxed">
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )

          case 'code':
            return (
              <figure key={index} className="not-prose">
                {block.caption && (
                  <figcaption className="mb-1.5 font-mono text-xs text-cs-muted">{block.caption}</figcaption>
                )}
                <pre className="overflow-x-auto rounded-xl border border-cs-border bg-cs-surface-2 px-4 py-3 font-mono text-[13px] leading-relaxed text-cs-text">
                  <code>{block.lines.join('\n')}</code>
                </pre>
              </figure>
            )

          case 'callout': {
            const tone = CALLOUT_TONE[block.tone]
            return (
              <aside key={index} className={`rounded-2xl border px-5 py-4 ${tone.wrap}`}>
                {block.title && (
                  <p className={`mb-1 font-display text-sm font-semibold ${tone.label}`}>{block.title}</p>
                )}
                <p className="text-sm leading-relaxed text-cs-body">{block.text}</p>
              </aside>
            )
          }

          case 'try':
            return (
              <section
                key={index}
                className="rounded-2xl border-2 border-dashed border-cs-accent-border bg-cs-surface px-5 py-4"
                data-testid="try-block"
              >
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-cs-accent">Try it yourself</p>
                <p className="mb-3 font-display text-base font-semibold text-cs-text">{block.title}</p>
                <ol className="list-decimal space-y-1.5 pl-5 font-mono text-[13px] leading-relaxed text-cs-body">
                  {block.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {block.expected && (
                  <p className="mt-3 border-t border-cs-border pt-3 text-sm leading-relaxed text-cs-muted">
                    <span className="font-semibold text-cs-text">What you should see: </span>
                    {block.expected}
                  </p>
                )}
              </section>
            )

          case 'image':
            return <ImageBlock key={index} src={block.src} alt={block.alt} caption={block.caption} />

          case 'lab':
            return (
              <LabBlock
                key={index}
                title={block.title}
                description={block.description}
                estimatedMinutes={block.estimatedMinutes}
                status={block.status}
                scale={block.scale}
              />
            )

          case 'attachment':
            // เอกสารแนบเป็น "ของแถมให้เก็บไป" ไม่ใช่ตัวเนื้อหาหลัก — เปิดแท็บใหม่
            // เพื่อให้ผู้อ่านได้ตัวอ่าน PDF เต็มรูปของเบราว์เซอร์ (ซูม/ค้น/พิมพ์ได้)
            // แทนที่จะยัดลงกล่องที่มี scroll ซ้อน scroll
            return (
              <a
                key={index}
                href={block.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="attachment-block"
                className="not-prose flex items-start gap-4 rounded-2xl border border-cs-border bg-cs-surface p-5 shadow-card transition-colors hover:border-cs-accent"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 rounded-lg border border-cs-border bg-cs-surface-2 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-cs-muted"
                >
                  {FILE_LABEL[block.fileType]}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-cs-text">{block.title}</span>
                  {block.description && (
                    <span className="mt-1 block text-sm leading-relaxed text-cs-body">{block.description}</span>
                  )}
                  <span className="mt-1.5 block font-mono text-[11px] text-cs-muted">
                    Opens in a new tab{block.sizeLabel ? ` · ${block.sizeLabel}` : ''}
                  </span>
                </span>
              </a>
            )

          case 'externalLink':
            // ของคนอื่น = ลิงก์ที่พาออกไป และต้องบอกให้ชัดว่ากำลังออกจาก Academy
            // (ไม่ iframe: เว็บส่วนใหญ่บล็อกอยู่แล้ว และการฝังทำให้ของคนอื่นดูเหมือนของเรา)
            return (
              <a
                key={index}
                href={block.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="external-link-block"
                className="not-prose flex items-start gap-4 rounded-2xl border border-cs-border bg-cs-surface-2 p-5 transition-colors hover:border-cs-accent"
              >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-cs-muted">
                  ↗
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-cs-text">{block.title}</span>
                  {block.description && (
                    <span className="mt-1 block text-sm leading-relaxed text-cs-body">{block.description}</span>
                  )}
                  <span className="mt-1.5 block font-mono text-[11px] text-cs-muted">
                    Leaves Academy · {block.sourceLabel}
                  </span>
                </span>
              </a>
            )

          case 'table':
            return (
              <div key={index} className="not-prose overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-cs-border-2 text-left">
                      {block.headers.map((header, i) => (
                        <th key={i} className="py-2 pr-4 font-display text-[13px] font-semibold text-cs-text">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, i) => (
                      <tr key={i} className="border-b border-cs-border/70 align-top last:border-0">
                        {row.map((cell, j) => (
                          <td key={j} className="py-2 pr-4 leading-relaxed text-cs-body">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </div>
  )
}
