import { describe, expect, it } from 'vitest'
import {
  projectAccountResponse,
  projectOtpResponse,
  projectSignOutResponse,
  projectVerifyResponse,
  readAccountResponse,
  readOtpResponse,
  readSignOutResponse,
  readVerifyResponse,
} from '@/lib/auth/account-response-client'

function jsonResponse(body: string, status = 200, contentType = 'application/json'): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })
}

describe('account response client', () => {
  it('accepts only the two exact account response shapes', () => {
    expect(projectAccountResponse({ signedIn: false })).toEqual({ signedIn: false })
    expect(projectAccountResponse({ signedIn: true, email: 'learner@example.test' })).toEqual({
      signedIn: true,
      email: 'learner@example.test',
    })

    for (const value of [
      { signedIn: true },
      { signedIn: false, email: 'learner@example.test' },
      { signedIn: true, email: '' },
      { signedIn: true, email: 'x'.repeat(255) },
      { signedIn: true, email: 'learner@example.test', unexpected: true },
      { signedIn: 'true', email: 'learner@example.test' },
      null,
    ]) {
      expect(projectAccountResponse(value)).toBeNull()
    }
  })

  it('reads a bounded duplicate-safe JSON response', async () => {
    await expect(readAccountResponse(jsonResponse('{"signedIn":true,"email":"learner@example.test"}')))
      .resolves.toEqual({ signedIn: true, email: 'learner@example.test' })

    await expect(readAccountResponse(jsonResponse('{"signedIn":false,"signedIn":true,"email":"learner@example.test"}')))
      .resolves.toBeNull()
    await expect(readAccountResponse(jsonResponse('{"signedIn":false}', 200, 'text/plain')))
      .resolves.toBeNull()
    await expect(readAccountResponse(jsonResponse(JSON.stringify({
      signedIn: true,
      email: `${'x'.repeat(4_096)}@example.test`,
    }))))
      .resolves.toBeNull()
  })

  it('does not treat a non-success response as an account state', async () => {
    await expect(readAccountResponse(jsonResponse('{"signedIn":true,"email":"learner@example.test"}', 503)))
      .resolves.toBeNull()
  })

  it('projects only exact sign-out, OTP, and verification results', () => {
    expect(projectSignOutResponse({ ok: true, scope: 'local', revocation: 'confirmed' }))
      .toEqual({ revocation: 'confirmed' })
    expect(projectSignOutResponse({ ok: true, scope: 'local', revocation: 'not-confirmed' }))
      .toEqual({ revocation: 'not-confirmed' })
    expect(projectOtpResponse({ ok: true })).toEqual({ ok: true })
    expect(projectOtpResponse({ ok: false, error: 'ลองใหม่' })).toEqual({ ok: false, error: 'ลองใหม่' })
    expect(projectVerifyResponse({ ok: true, next: '/dashboard' })).toEqual({ ok: true, next: '/dashboard' })
    expect(projectVerifyResponse({ ok: false, error: 'รหัสไม่ถูกต้อง' })).toEqual({
      ok: false,
      error: 'รหัสไม่ถูกต้อง',
    })

    for (const value of [
      { ok: true, scope: 'local', revocation: 'confirmed', extra: true },
      { revocation: 'unknown' },
      { ok: true, error: 'surplus' },
      { ok: false, error: '' },
      { ok: false, error: 'x'.repeat(513) },
      { ok: true, next: 'https://evil.example' },
      { ok: true, next: '/\\evil.example' },
      { ok: true, next: '/\n/evil.example' },
      { ok: true, next: '/dashboard', extra: true },
    ]) {
      expect(projectSignOutResponse(value)).toBeNull()
      expect(projectOtpResponse(value)).toBeNull()
      expect(projectVerifyResponse(value)).toBeNull()
    }
  })

  it('reads auth actions through the same bounded duplicate-safe boundary', async () => {
    await expect(readSignOutResponse(jsonResponse('{"ok":true,"scope":"local","revocation":"confirmed"}')))
      .resolves.toEqual({ revocation: 'confirmed' })
    await expect(readOtpResponse(jsonResponse('{"ok":true}')))
      .resolves.toEqual({ ok: true })
    await expect(readVerifyResponse(jsonResponse('{"ok":true,"next":"/courses/linux/learn"}')))
      .resolves.toEqual({ ok: true, next: '/courses/linux/learn' })

    await expect(readSignOutResponse(jsonResponse('{"ok":true,"scope":"local","revocation":"confirmed","revocation":"not-confirmed"}')))
      .resolves.toBeNull()
    await expect(readOtpResponse(jsonResponse('{"ok":true}', 200, 'text/plain')))
      .resolves.toBeNull()
    await expect(readVerifyResponse(jsonResponse(JSON.stringify({ ok: false, error: 'x'.repeat(4_096) }))))
      .resolves.toBeNull()
  })
})
