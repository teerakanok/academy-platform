'use client'

import Link from 'next/link'
import { useUi } from '@/components/i18n/LocaleProvider'
import { PRIVACY } from '@/lib/i18n/privacy'

// เนื้อหานโยบายตามภาษาของเว็บ
//
// เดิมหน้านี้เป็นไทยล้วน คนที่เปิดเว็บเป็นภาษาอังกฤษจึงเจอหน้าที่อ่านไม่ออกทั้งหน้า
// ทั้งที่เป็นเรื่องข้อมูลของตัวเอง

export function PrivacyContent({ version }: { version: string }) {
  const { locale } = useUi()
  const doc = PRIVACY[locale]

  return (
    <article className="mx-auto max-w-3xl px-6 py-16" data-testid="privacy-content" data-locale={locale}>
      <p className="mb-3 font-mono text-sm text-cs-accent">{doc.eyebrow}</p>
      <h1 className="mb-2 font-display text-3xl font-bold text-cs-text">{doc.title}</h1>
      <p className="mb-4 text-sm text-cs-muted">{doc.meta(version)}</p>
      {doc.translationNote && (
        <p className="mb-10 rounded-control border border-cs-border bg-cs-surface-2 px-4 py-3 text-sm text-cs-body">
          {doc.translationNote}
        </p>
      )}

      <div className="space-y-8 leading-relaxed">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-3 font-display text-xl font-semibold text-cs-text">{section.heading}</h2>
            {section.body.map((line, i) => (
              <p key={i} className={i > 0 ? 'mt-3' : ''}>
                {line}
                {/* ที่อยู่ติดต่ออยู่ท้ายย่อหน้าที่พูดถึงมัน ไม่ใช่ลอยอยู่ท้ายหน้า */}
                {section.body.length === i + 1 && /reach us at|ติดต่อได้ที่อีเมล|email us at the address below/.test(line) ? (
                  <>
                    {' '}
                    <a
                      href={`mailto:${doc.contactEmail}`}
                      className="text-cs-accent underline underline-offset-4"
                    >
                      {doc.contactEmail}
                    </a>
                  </>
                ) : null}
              </p>
            ))}
            {section.bullets && (
              <ul className="mt-3 list-disc space-y-2 pl-6">
                {section.bullets.map((b) => (
                  <li key={b.term}>
                    <span className="text-cs-text">{b.term}</span> — {b.text}
                  </li>
                ))}
              </ul>
            )}
            {section.after && <p className="mt-3">{section.after}</p>}
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-cs-border pt-6">
        <Link href="/" className="font-mono text-sm text-cs-accent underline-offset-4 hover:underline">
          {doc.back}
        </Link>
      </div>
    </article>
  )
}
