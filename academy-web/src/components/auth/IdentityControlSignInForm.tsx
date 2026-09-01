import React from 'react'

export function IdentityControlSignInForm({
  next,
  transport,
}: {
  next: string
  transport: 'form' | 'navigation'
}) {
  const startUrl = `/api/auth/identity/start?next=${encodeURIComponent(next)}`
  return (
    <div className="card-feature p-6 sm:p-8" data-testid="identity-control-sign-in">
      <h2 className="font-display text-xl font-semibold text-cs-text">Continue with your CYBERSKILLS Account</h2>
      <p className="mt-3 text-sm leading-relaxed text-cs-body">
        Sign in at the shared Account Center, then return here to continue in Academy.
      </p>
      {transport === 'form' ? (
        <form action="/api/auth/identity/start" method="post" className="mt-6">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            data-testid="identity-control-continue"
            className="w-full rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5"
          >
            Continue to CYBERSKILLS Account
          </button>
        </form>
      ) : (
        <a
          href={startUrl}
          data-testid="identity-control-continue"
          className="mt-6 block w-full rounded-control bg-cs-accent-fill px-6 py-3 text-center text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5"
        >
          Continue to CYBERSKILLS Account
        </a>
      )}
    </div>
  )
}
