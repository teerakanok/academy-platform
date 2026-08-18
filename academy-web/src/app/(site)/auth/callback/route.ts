import { NextResponse } from 'next/server'
import { IdentityAdapterUnavailableError, getIdentityRuntimeBrowserFlow } from '@/lib/identity/registry'
import { IdentityTransactionError, parseIdentityCallback } from '@/lib/identity/transaction'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import {
  createIdentityLocalRuntime,
  createLocalAcademySession,
  expireLocalIdentityBrowserBindingCookie,
  readLocalIdentityBrowserBinding,
} from '@/lib/identity/local-runtime'
import { completeSignedIdentityCallback } from '@/lib/identity/transaction'

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

  if (identityControlLocalFixtureAllowedForRequest(request)) {
    let callback
    try {
      callback = parseIdentityCallback(url)
    } catch (error) {
      if (error instanceof IdentityTransactionError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }
      throw error
    }
    let stateCookie: string | undefined
    try {
      const local = createIdentityLocalRuntime(request)
      stateCookie = expireLocalIdentityBrowserBindingCookie(callback.state)
      const browserBinding = readLocalIdentityBrowserBinding(request.headers.get('cookie'), callback.state)
      if (!browserBinding) throw new IdentityTransactionError('ไม่พบ browser binding', 'browser_mismatch')
      const completed = await completeSignedIdentityCallback({
        adapter: local.codeExchangePort,
        store: local.transactionStore,
        client: local.client,
        callback,
        browserBinding,
        clientAssertionProvider: local.clientAssertionProvider,
        resultVerifier: local.resultVerifier,
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

  let browserFlow
  try {
    browserFlow = getIdentityRuntimeBrowserFlow()
  } catch (error) {
    if (error instanceof IdentityAdapterUnavailableError) {
      return NextResponse.json(
        { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
        { status: 503 },
      )
    }
    throw error
  }
  if (browserFlow) {
    const result = await browserFlow.complete(request)
    if (result.kind === 'error') {
      const response = NextResponse.json({ ok: false, error: result.error }, { status: result.status })
      for (const cookie of result.cookies) response.headers.append('set-cookie', cookie)
      return response
    }
    const response = NextResponse.redirect(new URL(result.location, request.url), result.status)
    for (const cookie of result.cookies) response.headers.append('set-cookie', cookie)
    return response
  }

  try {
    parseIdentityCallback(url)
  } catch (error) {
    if (error instanceof IdentityTransactionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }
    throw error
  }

  // ยังไม่ได้ต่อ Identity Control — ตอบตามจริง ไม่ใช่ทำเป็นว่าใช้ได้
  return NextResponse.json(
    { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
    { status: 503 },
  )
}
