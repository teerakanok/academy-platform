'use client'

import { useState } from 'react'

// เข้าสู่ระบบด้วยรหัสทางอีเมล — สองขั้นในหน้าเดียว
//
// เลือกรหัส 6 หลักแทน magic link เพราะลิงก์บังคับให้ออกจากแท็บที่กำลังอ่านอยู่ ไปเปิด
// อีเมล แล้วกลับมาในแท็บใหม่ ซึ่งทำให้เสียที่ที่กำลังเรียนอยู่ — รหัสพิมพ์กลับมาที่เดิมได้

type Phase = 'email' | 'code'

export function SignInForm({ next, identityControl = false }: { next: string; identityControl?: boolean }) {
  const [phase, setPhase] = useState<Phase>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (identityControl) {
    return (
      <div className="card-feature p-6 sm:p-8" data-testid="identity-control-sign-in">
        <h2 className="font-display text-xl font-semibold text-cs-text">Continue with your CYBERSKILLS Account</h2>
        <p className="mt-3 text-sm leading-relaxed text-cs-body">
          Sign in at the shared Account Center, then return here to continue in Academy.
        </p>
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
      </div>
    )
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) throw new Error(body.error ?? 'ส่งรหัสไม่สำเร็จ')
      setPhase('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, token: code, next }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string; next?: string }
      if (!body.ok) throw new Error(body.error ?? 'ยืนยันไม่สำเร็จ')
      // full reload โดยตั้งใจ — session cookie เพิ่งถูกตั้ง หน้าที่ render ไว้แล้ว
      // ยังไม่รู้จักผู้ใช้คนนี้
      window.location.assign(body.next ?? '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="card-feature p-6 sm:p-8" data-testid="sign-in-card">
      {phase === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4" data-testid="sign-in-email-form">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-cs-text">
              Email address
            </label>
            <p className="mt-1 text-sm text-cs-muted">
              We send a six-digit code. There is no password to set.
            </p>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="sign-in-email"
              className="mt-3 w-full rounded-control border border-cs-border bg-cs-surface px-4 py-3 text-cs-text outline-none transition-colors focus:border-cs-accent"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            data-testid="sign-in-submit"
            className="w-full rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" data-testid="sign-in-code-form">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-cs-text">
              Enter the code
            </label>
            <p className="mt-1 text-sm text-cs-muted">
              Sent to <span className="font-medium text-cs-text">{email}</span>. It expires in an hour.
            </p>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              data-testid="sign-in-code"
              className="mt-3 w-full rounded-control border border-cs-border bg-cs-surface px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-cs-text outline-none transition-colors focus:border-cs-accent"
              placeholder="000000"
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            data-testid="sign-in-verify"
            className="w-full rounded-control bg-cs-accent-fill px-6 py-3 text-sm font-semibold text-cs-on-accent transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('email')
              setCode('')
              setError(null)
            }}
            className="w-full text-sm text-cs-muted underline underline-offset-4 hover:text-cs-accent"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          data-testid="sign-in-error"
          className="mt-4 rounded-control border border-cs-amber-border bg-cs-amber-dim px-4 py-3 text-sm text-cs-body"
        >
          {error}
        </p>
      )}
    </div>
  )
}
