'use client'

import Link from 'next/link'

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16" role="alert">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-cs-accent">Temporarily unavailable</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-cs-text">We could not check your Academy access</h1>
      <p className="mt-4 leading-relaxed text-cs-body">
        Your account and learning record are unchanged. Try the access check again, or return to My learning.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-control bg-cs-accent-fill px-5 py-3 text-sm font-semibold text-cs-on-accent"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-control border border-cs-border bg-cs-surface px-5 py-3 text-sm text-cs-body hover:border-cs-accent"
        >
          Return to My learning
        </Link>
      </div>
    </main>
  )
}
