'use client'

import { useEffect, useState } from 'react'

// สถานะบัญชีบน header — ดึงหลัง hydrate เพื่อให้หน้าร้านยังเป็น static ได้
//
// ระหว่างยังไม่รู้สถานะ จะไม่แสดงอะไรเลย ไม่ใช่แสดง "Sign in" ไว้ก่อน — เพราะการ
// สลับจาก "Sign in" เป็นอีเมลของผู้ใช้ทำให้หน้ากระตุกและอ่านผิดว่ายังไม่ได้ล็อกอิน

type State = { loading: true } | { loading: false; signedIn: boolean; email?: string }

export function AccountMenu() {
  const [state, setState] = useState<State>({ loading: true })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { signedIn: boolean; email?: string }) => {
        if (alive) setState({ loading: false, signedIn: d.signedIn, email: d.email })
      })
      .catch(() => {
        if (alive) setState({ loading: false, signedIn: false })
      })
    return () => {
      alive = false
    }
  }, [])

  if (state.loading) return <span className="w-16" aria-hidden="true" />

  if (!state.signedIn) {
    return (
      <a
        href="/sign-in"
        data-testid="header-sign-in"
        className="whitespace-nowrap rounded-control border border-cs-accent px-3 py-1.5 text-[13px] font-medium text-cs-accent transition-colors hover:bg-cs-accent-dim sm:px-4 sm:text-sm"
      >
        Sign in
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-[14rem] truncate font-mono text-xs text-cs-muted lg:inline"
        title={state.email}
        data-testid="header-account-email"
      >
        {state.email}
      </span>
      {/* จอเล็กเหลือแค่ไอคอน — ที่ 390px มี logo + ชื่อ + สองลิงก์ + ปุ่มออก + ปุ่มธีม
          ใส่คำว่า "Sign out" เต็มแล้วล้นขอบจอ ซึ่งไปดันการ์ดคอร์สให้กว้างตามทั้งหน้า
          (gate มือถือจับได้ตอนเทสรันแบบล็อกอินแล้ว ส่วนตอนไม่ล็อกอินไม่เจอ) */}
      <button
        type="button"
        data-testid="header-sign-out"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true)
          setSignOutError(null)
          try {
            const response = await fetch('/api/auth/sign-out', { method: 'POST' })
            if (!response.ok) throw new Error('sign-out failed')
            const result = (await response.json()) as { revocation?: 'confirmed' | 'not-confirmed' }
            // reload เต็ม — หน้าที่ render ไว้ยังคิดว่าล็อกอินอยู่
            window.location.assign(result.revocation === 'not-confirmed' ? '/sign-in?notice=local-only' : '/')
          } catch {
            setSignOutError('Could not sign out. Your session may still be active. Try again.')
            setSigningOut(false)
          }
        }}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-control border border-cs-border px-2.5 py-2 text-[13px] text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:py-1.5 sm:text-sm"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 sm:hidden"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.5 6.5V4.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2" />
          <path d="M16.5 10H8m8.5 0-2.5-2.5M16.5 10 14 12.5" />
        </svg>
        <span className="sr-only sm:not-sr-only">{signingOut ? 'Signing out…' : 'Sign out'}</span>
      </button>
      {signOutError && (
        <span
          role="alert"
          className="fixed right-4 top-20 z-50 max-w-xs border-l-2 border-cs-amber bg-cs-surface px-4 py-3 text-sm text-cs-body shadow-card"
          data-testid="sign-out-error"
        >
          {signOutError}
        </span>
      )}
    </div>
  )
}
