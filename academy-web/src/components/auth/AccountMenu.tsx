'use client'

import { useEffect, useState } from 'react'

// สถานะบัญชีบน header — ดึงหลัง hydrate เพื่อให้หน้าร้านยังเป็น static ได้
//
// ระหว่างยังไม่รู้สถานะ จะไม่แสดงอะไรเลย ไม่ใช่แสดง "Sign in" ไว้ก่อน — เพราะการ
// สลับจาก "Sign in" เป็นอีเมลของผู้ใช้ทำให้หน้ากระตุกและอ่านผิดว่ายังไม่ได้ล็อกอิน

type State = { loading: true } | { loading: false; signedIn: boolean; email?: string }

export function AccountMenu() {
  const [state, setState] = useState<State>({ loading: true })

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
      <button
        type="button"
        data-testid="header-sign-out"
        onClick={async () => {
          await fetch('/api/auth/sign-out', { method: 'POST' })
          // reload เต็ม — หน้าที่ render ไว้ยังคิดว่าล็อกอินอยู่
          window.location.assign('/')
        }}
        className="whitespace-nowrap rounded-control border border-cs-border px-3 py-1.5 text-[13px] text-cs-muted transition-colors hover:border-cs-accent hover:text-cs-accent sm:text-sm"
      >
        Sign out
      </button>
    </div>
  )
}
