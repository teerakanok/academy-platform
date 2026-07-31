import type { LessonBlock } from '@/lib/content/course-types'

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
              <h2 key={index} className="pt-3 font-display text-xl font-semibold text-cs-text">
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
