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
  searchParams: Promise<{ next?: string; notice?: string; reason?: string }>
}) {
  const { next, notice, reason } = await searchParams
  const target = safeNextPath(next)
  const requestHeaders = await headers()
  const requestHost = requestHeaders.get('host') ?? ''
  const accountAccessOpen = accountsEnabled(requestHost)
  const localIdentityControl = identityControlLocalFixtureAllowedForHost(requestHost)
  const identityControl = localIdentityControl || productionIdentityControlAvailable()

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      {reason === 'reauthentication-required' && (
        <p role="alert" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Your sign-in verification expired. Please sign in again to continue.
        </p>
      )}
      {notice === 'local-only' && (
        <p role="status" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Signed out of this browser. Academy session revocation could not be confirmed; sessions already open on other devices were not changed.
        </p>
      )}
      {(notice === 'sso-unconfirmed' || notice === 'sign-out-unconfirmed') && (
        <p role="alert" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          {notice === 'sso-unconfirmed'
            ? 'Signed out of Academy in this browser. CYBERSKILLS single sign-on could not be confirmed as ended.'
            : 'Academy cookies were cleared, but Academy session revocation and ending CYBERSKILLS single sign-on could not be confirmed.'}
          {' '}Before leaving a shared device, open your CYBERSKILLS account and sign out there. Sessions already open in other products or devices were not changed.
          {' '}<a href="https://accounts.cyberskills.co.th" className="underline underline-offset-4">Open CYBERSKILLS account</a>
        </p>
      )}
      {notice === 'identity-unavailable' && (
        <p role="alert" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Sign-in could not be completed. Please start again.
        </p>
      )}
      {notice === 'identity-start-failed' && (
        <p role="alert" className="mb-6 border-l-2 border-cs-amber py-2 pl-4 text-sm text-cs-body">
          Sign-in could not be started right now. Please try again in a moment.
        </p>
      )}
      <div className="hero-bleed pb-6 text-center">
        <Image
          src="/brand/logo-academy.svg"
          alt=""
          width={56}
          height={56}
          priority
          className="mx-auto"
        />
        <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight text-cs-text">
          One CYBERSKILLS account
        </h1>
        <p className="mx-auto mt-3 max-w-md text-cs-body">
          Your CYBERSKILLS account keeps your Academy learning record with you across devices.
        </p>
        {/* ประโยชน์แบบย่อ — บอกคุณค่าของบัญชีเดียวก่อนถึงปุ่ม (audit 2026-09-11) */}
        <p className="mt-4 text-sm font-semibold text-cs-accent">
          One account for all CYBERSKILLS courses
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
