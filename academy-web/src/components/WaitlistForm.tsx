'use client'

import Link from 'next/link'
import { useState } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function WaitlistForm({ consentSummary }: { consentSummary: string }) {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!consent) {
      setStatus('error')
      setErrorMessage('Please accept the privacy notice before signing up.')
      return
    }
    setStatus('submitting')
    setErrorMessage('')
    try {
      const params = new URLSearchParams(window.location.search)
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          utmSource: params.get('utm_source') ?? undefined,
          utmMedium: params.get('utm_medium') ?? undefined,
          utmCampaign: params.get('utm_campaign') ?? undefined,
          referrer: document.referrer || undefined,
        }),
      })
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (response.ok && data?.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMessage(data?.error ?? 'Could not save that. Please try again.')
      }
    } catch {
      setStatus('error')
      setErrorMessage('Could not reach the server. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        data-testid="waitlist-success"
        className="rounded-xl border border-cs-accent-border bg-cs-accent-dim px-5 py-4 text-cs-text"
      >
        <p className="font-semibold">You are on the list.</p>
        <p className="text-sm text-cs-body mt-1">We will email you when the next course opens.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-cs-border bg-cs-surface px-4 py-3 text-cs-text placeholder:text-cs-faint focus:border-cs-accent focus:outline-none focus:ring-1 focus:ring-cs-accent"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="rounded-xl bg-cs-accent-fill px-6 py-3 font-semibold text-cs-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving…' : 'Notify me'}
        </button>
      </div>

      <label className="flex items-start gap-3 text-sm text-cs-body cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          data-testid="consent-checkbox"
          className="mt-1 h-4 w-4 accent-cs-accent"
        />
        <span className="whitespace-pre-line">
          {consentSummary}{' '}
          <Link href="/privacy" className="text-cs-accent underline underline-offset-4">
            Read the privacy notice
          </Link>
        </span>
      </label>

      {status === 'error' && (
        <p role="alert" data-testid="waitlist-error" className="text-sm text-cs-amber">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
