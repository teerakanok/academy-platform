'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUi } from '@/components/i18n/LocaleProvider'
import { submitUnsubscribeRequest } from '@/lib/unsubscribe-client'
import { unsubscribeTokenFromFragment } from '@/lib/unsubscribe-token'

type Phase = 'ready' | 'submitting' | 'done' | 'failed'

const COPY = {
  en: {
    eyebrow: 'EMAIL PREFERENCES',
    title: 'Stop Academy marketing emails',
    body: 'This stops launch, course, and promotional email from CyberSkills Academy. Your account and learning record stay unchanged.',
    invalid: 'This unsubscribe link is incomplete. Contact us and include the email address that received the message.',
    action: 'Unsubscribe',
    working: 'Updating…',
    done: 'If this address was subscribed, Academy marketing email is now stopped.',
    failed: 'We could not update your preference just now. Try again or contact us directly.',
    contact: 'Contact privacy support',
    back: 'Back to Academy',
  },
  th: {
    eyebrow: 'การตั้งค่าอีเมล',
    title: 'หยุดรับอีเมลการตลาดจาก Academy',
    body: 'การยกเลิกนี้หยุดอีเมลข่าวเปิดตัว คอร์ส และโปรโมชั่นจาก CyberSkills Academy โดยไม่กระทบบัญชีหรือประวัติการเรียนของคุณ',
    invalid: 'ลิงก์ยกเลิกนี้ไม่สมบูรณ์ โปรดติดต่อเราและระบุอีเมลที่ได้รับข้อความ',
    action: 'ยกเลิกรับอีเมล',
    working: 'กำลังอัปเดต…',
    done: 'หากอีเมลนี้เคยสมัครไว้ ระบบได้หยุดอีเมลการตลาดจาก Academy แล้ว',
    failed: 'ยังอัปเดตการตั้งค่าไม่ได้ โปรดลองอีกครั้งหรือติดต่อเราโดยตรง',
    contact: 'ติดต่อเรื่องข้อมูลส่วนบุคคล',
    back: 'กลับไป Academy',
  },
} as const

export function UnsubscribeForm({ requestedLocale }: { requestedLocale: 'th' | 'en' | null }) {
  const { locale, setLocale } = useUi()
  const copy = COPY[requestedLocale ?? locale]
  const [phase, setPhase] = useState<Phase>('ready')
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (requestedLocale) setLocale(requestedLocale)
  }, [requestedLocale, setLocale])

  useEffect(() => {
    setToken(unsubscribeTokenFromFragment(window.location.hash))
    // Do not keep a bearer token in browser history after this single read.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [])

  async function unsubscribe() {
    if (!token || phase === 'submitting' || phase === 'done') return
    setPhase('submitting')
    try {
      const succeeded = await submitUnsubscribeRequest(token)
      setPhase(succeeded ? 'done' : 'failed')
    } catch {
      setPhase('failed')
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="mb-3 font-mono text-sm text-cs-accent">{copy.eyebrow}</p>
      <h1 className="font-display text-3xl font-bold text-cs-text">{copy.title}</h1>
      <p className="mt-4 leading-relaxed text-cs-body">{copy.body}</p>

      <div className="mt-8 border-y border-cs-border py-6">
        {token === undefined ? null : !token ? (
          <p role="alert" className="text-sm leading-relaxed text-cs-amber">{copy.invalid}</p>
        ) : phase === 'done' ? (
          <p role="status" className="text-sm leading-relaxed text-cs-text" data-testid="unsubscribe-result">
            {copy.done}
          </p>
        ) : (
          <div className="space-y-4">
            {phase === 'failed' && <p role="alert" className="text-sm text-cs-amber">{copy.failed}</p>}
            <button
              type="button"
              onClick={unsubscribe}
              disabled={phase === 'submitting'}
              className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent disabled:opacity-50"
            >
              {phase === 'submitting' ? copy.working : copy.action}
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <a
          href="mailto:contact@cyberskills.co.th?subject=Unsubscribe%20CyberSkills%20Academy"
          className="text-cs-accent underline underline-offset-4"
        >
          {copy.contact}
        </a>
        <Link href="/" className="text-cs-muted underline underline-offset-4 hover:text-cs-text">
          {copy.back}
        </Link>
      </div>
    </main>
  )
}
