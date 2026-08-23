'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { normalizeWaitlistEmail, submitWaitlistRequest } from '@/lib/waitlist-client'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const EMAIL_ERROR_MESSAGE = 'Enter an email address in this format: name@example.com.'
const CONSENT_ERROR_MESSAGE = 'Accept the privacy notice to continue.'

export function WaitlistForm({ consentSummary }: { consentSummary: string }) {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [emailError, setEmailError] = useState('')
  const [consentError, setConsentError] = useState('')
  const [requestError, setRequestError] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)
  const consentInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = normalizeWaitlistEmail(email)
    const nextEmailError = normalizedEmail === null ? EMAIL_ERROR_MESSAGE : ''
    const nextConsentError = consent ? '' : CONSENT_ERROR_MESSAGE

    setEmailError(nextEmailError)
    setConsentError(nextConsentError)
    setRequestError('')

    if (normalizedEmail === null) {
      setStatus('error')
      emailInputRef.current?.focus()
      return
    }
    if (!consent) {
      setStatus('error')
      consentInputRef.current?.focus()
      return
    }

    setStatus('submitting')
    try {
      const params = new URLSearchParams(window.location.search)
      const result = await submitWaitlistRequest({
        email: normalizedEmail,
        consent,
        utmSource: params.get('utm_source') ?? undefined,
        utmMedium: params.get('utm_medium') ?? undefined,
        utmCampaign: params.get('utm_campaign') ?? undefined,
        referrer: document.referrer || undefined,
      })
      if (result.status === 'success') {
        setStatus('success')
      } else {
        setStatus('error')
        setRequestError(
          result.status === 'network-error'
            ? 'Could not reach the server. Please try again.'
            : 'Could not save that. Please try again.',
        )
      }
    } catch {
      setStatus('error')
      setRequestError('Could not reach the server. Please try again.')
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="waitlist-email" className="sr-only">
            Email
          </label>
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            aria-invalid={emailError !== ''}
            aria-describedby={emailError ? 'waitlist-email-error' : undefined}
            ref={emailInputRef}
            onChange={(event) => {
              const value = event.target.value
              setEmail(value)
              if (value.trim() === '' || normalizeWaitlistEmail(value) !== null) {
                setEmailError('')
                if (status === 'error') setStatus('idle')
              }
            }}
            className={`w-full rounded-xl border bg-cs-surface px-4 py-3 text-cs-text placeholder:text-cs-faint focus:outline-none focus:ring-1 ${
              emailError
                ? 'border-cs-amber focus:border-cs-amber focus:ring-cs-amber'
                : 'border-cs-border focus:border-cs-accent focus:ring-cs-accent'
            }`}
          />
          {emailError && (
            <p
              id="waitlist-email-error"
              role="alert"
              data-testid="waitlist-email-error"
              className="mt-2 text-sm text-cs-amber"
            >
              {emailError}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="rounded-xl bg-cs-accent-fill px-6 py-3 font-semibold text-cs-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving…' : 'Notify me'}
        </button>
      </div>

      <div className="min-w-0">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-cs-body">
          <span className="relative mt-0.5 inline-flex shrink-0">
            <input
              id="waitlist-consent"
              type="checkbox"
              required
              checked={consent}
              aria-invalid={consentError !== ''}
              aria-describedby={consentError ? 'waitlist-consent-error' : undefined}
              ref={consentInputRef}
              onChange={(event) => {
                setConsent(event.target.checked)
                if (event.target.checked) {
                  setConsentError('')
                  if (status === 'error') setStatus('idle')
                }
              }}
              data-testid="consent-checkbox"
              className={`peer h-5 w-5 appearance-none rounded-md border-2 bg-cs-surface checked:border-cs-accent checked:bg-cs-accent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-cs-accent ${
                consentError ? 'border-cs-amber' : 'border-cs-border'
              }`}
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-cs-on-accent opacity-0 peer-checked:opacity-100"
            >
              <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="min-w-0 whitespace-pre-line">
            {consentSummary}{' '}
            <Link href="/privacy" className="text-cs-accent underline underline-offset-4">
              Read the privacy notice
            </Link>
          </span>
        </label>

        {consentError && (
          <p
            id="waitlist-consent-error"
            role="alert"
            data-testid="waitlist-consent-error"
            className="mt-2 text-sm text-cs-amber"
          >
            {consentError}
          </p>
        )}
      </div>

      {status === 'error' && requestError && (
        <p role="alert" data-testid="waitlist-error" className="text-sm text-cs-amber">
          {requestError}
        </p>
      )}
    </form>
  )
}
