'use client'

import { useEffect, useState } from 'react'
import { useUi } from '@/components/i18n/LocaleProvider'
import { requestConsent } from '@/lib/account/consent-client'
import type { ConsentState, ConsentType, ConsentWithdrawal } from '@/lib/account/consent-contract'

const copy = {
  th: {
    title: 'ความยินยอมของคุณ', intro: 'เลือกความเป็นส่วนตัวแยกตามวัตถุประสงค์ การถอนความยินยอมไม่กระทบบัญชีหรือสิทธิ์เรียนของคุณ',
    research_statistics: 'การวิจัยและสถิติ', researchDescription: 'ใช้เฉพาะสถิติรวมที่ไม่ระบุตัวตน ไม่ใช้ข้อมูลส่วนบุคคลที่ระบุถึงคุณ',
    marketing_email: 'ข่าวสารทางอีเมล', marketingDescription: 'รับข่าวสารผลิตภัณฑ์และการตลาดผ่านอีเมลเท่านั้น',
    granted: 'ยินยอม', withdrawn: 'ถอนแล้ว', not_granted: 'ยังไม่ได้ยินยอม', unknown: 'ยังตรวจสอบสถานะไม่ได้',
    loading: 'กำลังตรวจสอบความยินยอม…', failed: 'ติดต่อระบบความยินยอมไม่ได้ สถานะอาจเปลี่ยนไปแล้ว โปรดลองตรวจสอบอีกครั้ง',
    uncertain: 'ยังยืนยันผลการถอนไม่ได้ คุณลองส่งคำขอเดิมซ้ำหรือตรวจสอบสถานะล่าสุดได้',
    conflict: 'สถานะเปลี่ยนไปแล้ว แสดงข้อมูลล่าสุดให้คุณตรวจสอบ กรุณายืนยันใหม่หากยังต้องการถอน',
    saved: 'ระบบยืนยันสถานะล่าสุดแล้ว', refresh: 'ตรวจสอบสถานะล่าสุด', retry: 'ลองคำขอเดิมอีกครั้ง',
    withdraw: 'ถอนความยินยอม', confirm: 'ยืนยันการถอน', cancel: 'ยกเลิก', question: 'ต้องการถอนความยินยอมนี้หรือไม่?',
    saving: 'กำลังยืนยันการถอน…', notice: 'อ่านประกาศความเป็นส่วนตัว', grantedAt: 'ให้ความยินยอมเมื่อ', withdrawnAt: 'ถอนเมื่อ', version: 'ประกาศฉบับ',
  },
  en: {
    title: 'Your consent preferences', intro: 'Manage each purpose separately. Withdrawing consent does not affect your account or course access.',
    research_statistics: 'Research and statistics', researchDescription: 'Aggregated, de-identified statistics only. No personally identifying information.',
    marketing_email: 'Email updates', marketingDescription: 'Product news and marketing updates by email only.',
    granted: 'Granted', withdrawn: 'Withdrawn', not_granted: 'Not granted', unknown: 'Status not yet verified',
    loading: 'Checking your consent…', failed: 'The consent service is unavailable. Your status may have changed. Please check again.',
    uncertain: 'The withdrawal result is not confirmed. Retry the same request or check the latest status.',
    conflict: 'Your consent changed. Review the latest status below and confirm again if you still want to withdraw.',
    saved: 'Latest status confirmed by the consent service.', refresh: 'Check latest status', retry: 'Retry the same request',
    withdraw: 'Withdraw consent', confirm: 'Confirm withdrawal', cancel: 'Cancel', question: 'Withdraw this consent?',
    saving: 'Confirming withdrawal…', notice: 'Read the privacy notice', grantedAt: 'Granted on', withdrawnAt: 'Withdrawn on', version: 'Notice version',
  },
} as const
const types: ConsentType[] = ['research_statistics', 'marketing_email']
export function ConsentPreferences() {
  const { locale } = useUi()
  const t = copy[locale]
  const [state, setState] = useState<ConsentState | null>(null)
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState<'failed' | 'uncertain' | 'conflict' | 'saved' | null>(null)
  const [confirm, setConfirm] = useState<ConsentType | null>(null)
  const [intent, setIntent] = useState<ConsentWithdrawal | null>(null)
  useEffect(() => {
    let active = true
    void requestConsent().then(result => {
      if (!active) return
      if (result.kind === 'unavailable') setNotice('failed')
      else setState(result.state)
      setBusy(false)
    })
    return () => { active = false }
  }, [])
  async function load() {
    setBusy(true); setConfirm(null); setIntent(null); setNotice(null)
    const result = await requestConsent()
    if (result.kind === 'unavailable') { setState(null); setNotice('failed') }
    else { setState(result.state); setNotice('saved') }
    setBusy(false)
  }
  async function withdraw(type: ConsentType) {
    const row = state?.consents.find(item => item.type === type)
    const request = intent ?? (row ? { type, expectedRevision: row.revision, operationId: crypto.randomUUID() } : null)
    if (!request) return
    setIntent(request); setBusy(true); setConfirm(null); setNotice(null)
    const result = await requestConsent(request)
    if (result.kind === 'unavailable') { setNotice('uncertain') }
    else {
      // Conflict updates only the display. The old operation/revision is never rebased.
      setState(result.state); setIntent(null); setNotice(result.kind === 'conflict' ? 'conflict' : 'saved')
    }
    setBusy(false)
  }
  const unverified = notice === 'failed' || notice === 'uncertain'
  return <section className="mt-12 rounded-2xl border border-cs-border bg-cs-surface p-5 sm:p-8" aria-labelledby="consent-title" aria-busy={busy}>
    <h2 id="consent-title" className="text-xl font-semibold text-cs-text">{t.title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cs-muted">{t.intro}</p>
    <div role="status" aria-live="polite" className="mt-4 text-sm text-cs-text">{busy ? (intent ? t.saving : t.loading) : notice ? t[notice] : null}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {types.map(type => {
        const row = state?.consents.find(item => item.type === type)
        return <article key={type} className="rounded-xl border border-cs-border p-4" aria-labelledby={`consent-${type}`}>
          <h3 id={`consent-${type}`} className="font-semibold text-cs-text">{t[type]}</h3>
          <p className="mt-2 text-sm leading-relaxed text-cs-muted">{type === 'research_statistics' ? t.researchDescription : t.marketingDescription}</p>
          <p className="mt-4 font-medium text-cs-text" data-testid={`consent-status-${type}`}>{row && !unverified ? t[row.status] : t.unknown}</p>
          {row && !unverified && <div className="mt-2 space-y-1 text-xs leading-relaxed text-cs-muted">
            <p>{t.version}: {row.documentVersion}</p>
            {row.grantedAt && <p>{t.grantedAt}: <time dateTime={row.grantedAt}>{new Date(row.grantedAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB')}</time></p>}
            {row.withdrawnAt && <p>{t.withdrawnAt}: <time dateTime={row.withdrawnAt}>{new Date(row.withdrawnAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB')}</time></p>}
          </div>}
          {confirm === type ? <div className="mt-4">
            <p className="text-sm text-cs-text">{t.question}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => void withdraw(type)} className="rounded-lg border border-cs-accent px-3 py-2 text-sm text-cs-accent">{t.confirm}</button>
              <button disabled={busy} onClick={() => setConfirm(null)} className="rounded-lg border border-cs-border px-3 py-2 text-sm text-cs-text">{t.cancel}</button>
            </div>
          </div> : row?.status === 'granted' && !unverified && <button disabled={busy || !!intent} onClick={() => setConfirm(type)} className="mt-4 rounded-lg border border-cs-border px-3 py-2 text-sm text-cs-text disabled:opacity-50">{t.withdraw}</button>}
        </article>
      })}
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-4">
      {intent && notice === 'uncertain' && <button disabled={busy} onClick={() => void withdraw(intent.type)} className="rounded-lg border border-cs-accent px-3 py-2 text-sm text-cs-accent">{t.retry}</button>}
      <button disabled={busy} onClick={() => void load()} className="rounded-lg border border-cs-border px-3 py-2 text-sm text-cs-text disabled:opacity-50">{t.refresh}</button>
      <a href={`https://accounts.cyberskills.co.th/legal/privacy?lang=${locale}`} className="text-sm text-cs-accent underline underline-offset-4">{t.notice}</a>
    </div>
  </section>
}
