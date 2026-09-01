import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import React from 'react'
import { IdentityControlSignInForm } from '@/components/auth/IdentityControlSignInForm'
import { SignInForm } from '@/components/auth/SignInForm'
import { accountsEnabled, productionIdentityControlAvailable } from '@/lib/auth/enabled'
import { safeNextPath } from '@/lib/auth/route-client'
import { identityControlLocalFixtureAllowedForHost } from '@/lib/identity/local-fixture'
import { privatePage } from '@/lib/seo'

// หน้าเข้าสู่ระบบ — พูดในนาม **CYBERSKILLS** ไม่ใช่ Academy
//
// ใช้ชื่อบัญชี CYBERSKILLS แต่อธิบายเฉพาะ capability ของ Academy ที่พิสูจน์ได้แล้ว
// ทุกผลิตภัณฑ์ ซึ่งตรงข้ามกับสิ่งที่เรากำลังสร้าง
//
// noindex เพราะหน้าล็อกอินไม่ใช่หน้าร้าน — ไม่มีอะไรให้ค้นเจอ

export const metadata = privatePage('Sign in')

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>
}) {
  const { next, notice } = await searchParams
  const target = safeNextPath(next)
  const requestHeaders = await headers()
  const requestHost = requestHeaders.get('host') ?? ''
  const accountAccessOpen = accountsEnabled(requestHost)
  const localIdentityControl = identityControlLocalFixtureAllowedForHost(requestHost)
  const identityControl = localIdentityControl || productionIdentityControlAvailable()

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      {notice === 'local-only' && (
        <p role="status" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Signed out of this browser. Refresh-token revocation could not be confirmed; sessions already open on other devices were not changed.
        </p>
      )}
      {notice === 'identity-unavailable' && (
        <p role="alert" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Sign-in could not be completed. Please start again.
        </p>
      )}
      <div className="hero-bleed pb-6 text-center">
        <Image
          src="/brand/logo-academy.svg"
          alt=""
          width={44}
          height={44}
          priority
          className="mx-auto"
        />
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-cs-text">
          One CYBERSKILLS account
        </h1>
        <p className="mx-auto mt-3 max-w-md text-cs-body">
          Your CYBERSKILLS account keeps your Academy learning record with you across devices.
        </p>
      </div>

      {accountAccessOpen ? (
        identityControl ? (
          <IdentityControlSignInForm
            next={target}
            transport={localIdentityControl ? 'form' : 'navigation'}
          />
        ) : <SignInForm next={target} />
      ) : (
        <div className="card-feature p-6 sm:p-8" data-testid="accounts-not-open">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cs-accent">Preview</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-cs-text">Accounts are not open yet</h2>
          <p className="mt-3 text-sm leading-relaxed text-cs-body">
            You can read the course pages in this build. Sign-in opens when the platform launches.
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-cs-muted">
        You can{' '}
        <Link href="/courses" className="underline underline-offset-4 hover:text-cs-accent">
          look through the courses
        </Link>{' '}
        without an account.
      </p>
      {accountAccessOpen && (
        <p className="mx-auto mt-3 max-w-sm text-center text-xs text-cs-muted">
          By continuing you agree to how we handle your data.{' '}
          <Link
            href="/privacy"
            className="whitespace-nowrap underline underline-offset-4 hover:text-cs-accent"
          >
            นโยบายความเป็นส่วนตัว (Privacy)
          </Link>
        </p>
      )}
    </div>
  )
}
