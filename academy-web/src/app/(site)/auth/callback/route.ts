import { NextResponse } from 'next/server'
import { IdentityAdapterUnavailableError, getIdentityAdapter } from '@/lib/identity/registry'
import { IdentityTransactionError, parseIdentityCallback } from '@/lib/identity/transaction'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import {
  createIdentityLocalRuntime,
  createLocalAcademySession,
  expireLocalIdentityBrowserBindingCookie,
  readLocalIdentityBrowserBinding,
} from '@/lib/identity/local-runtime'
import { completeIdentityCallback } from '@/lib/identity/transaction'

export const runtime = 'nodejs'

// จุดรับกลับจาก Account Center — เตรียมไว้ ยังไม่ต่อ production
//
// ทิศทาง Identity Control (2026-08-01) กำหนดว่า callback ผ่าน browser ได้แค่
// **one-time code + state** เท่านั้น ห้ามมี subject, email, access token, OTP,
// invite code หรือ enrollment code วิ่งผ่าน URL — route นี้จึงปฏิเสธทุกอย่างที่เกินนั้น
// ตั้งแต่ก่อนแลก code เพราะถ้ามีของพวกนั้นมาด้วย แปลว่าอีกฝั่งทำผิดสัญญา
// และเราต้องไม่ทำให้มันดูเหมือนใช้ได้
//
// PKCE verifier อยู่ใน transaction ฝั่ง backend เท่านั้น ไม่เคยออกไปที่ browser.
// Local in-memory transaction contract มีไว้ทดสอบ boundary แล้ว แต่ route นี้ยังห้าม
// wire เข้ากับ runtime จนกว่า Identity Control จะ release registry และ authorization
// สำหรับ durable store/session ของ Academy.

export async function GET(request: Request) {
  const url = new URL(request.url)
  let callback
  try {
    callback = parseIdentityCallback(url)
  } catch (error) {
    if (error instanceof IdentityTransactionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }
    throw error
  }

  if (identityControlLocalFixtureAllowedForRequest(request)) {
    let stateCookie: string | undefined
    try {
      const local = createIdentityLocalRuntime(request)
      stateCookie = expireLocalIdentityBrowserBindingCookie(callback.state)
      const browserBinding = readLocalIdentityBrowserBinding(request.headers.get('cookie'), callback.state)
      if (!browserBinding) throw new IdentityTransactionError('ไม่พบ browser binding', 'browser_mismatch')
      const completed = await completeIdentityCallback({
        adapter: local.codeExchangePort,
        store: local.transactionStore,
        client: local.client,
        callback,
        browserBinding,
        clientAssertionProvider: local.clientAssertionProvider,
      })
      const response = NextResponse.redirect(new URL(completed.returnPath, request.url), 303)
      response.headers.append('set-cookie', createLocalAcademySession(local, completed.exchange))
      response.headers.append('set-cookie', stateCookie)
      return response
    } catch {
      const response = NextResponse.redirect(new URL('/sign-in?notice=identity-unavailable', request.url), 303)
      if (stateCookie) response.headers.append('set-cookie', stateCookie)
      return response
    }
  }

  let adapter
  try {
    adapter = getIdentityAdapter()
  } catch (error) {
    if (error instanceof IdentityAdapterUnavailableError) {
      return NextResponse.json(
        { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
        { status: 503 },
      )
    }
    throw error
  }
  if (!adapter) {
    // ยังไม่ได้ต่อ Identity Control — ตอบตามจริง ไม่ใช่ทำเป็นว่าใช้ได้
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
      { status: 503 },
    )
  }

  // ขั้นตอนที่เหลือ (ทำเมื่อ Identity Control พร้อมต่อจริง):
  //   1. ดึง transaction จาก state ref ฝั่ง backend และตรวจว่ายังไม่หมดอายุ/ยังไม่ถูกใช้
  //   2. adapter.exchangeCode ด้วย PKCE verifier ที่เก็บไว้กับ transaction นั้น
  //   3. ตรวจ nonce ที่ได้กลับมาว่าตรงกับที่ส่งไป
  //   4. findOrCreateUser ด้วย (issuer, subject) เท่านั้น — ห้ามค้นด้วย email
  //   5. syncActivation ตามผลที่ได้
  //   6. ตั้ง session ของ Academy เอง แบบ host-scoped
  return NextResponse.json(
    { ok: false, error: 'ยังไม่เปิดใช้งาน — ยังไม่มี Identity Control runtime ที่ได้รับอนุมัติ' },
    { status: 501 },
  )
}
