import { describe, expect, it, vi } from 'vitest'
import {
  acceptsAuthTransport,
  authCookieOptions,
  isSecureRequest,
  isSecureServerContext,
} from '@/lib/auth/cookie-policy'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

function request(
  url = 'https://academy.cyberskills.co.th/api/progress',
  init: RequestInit = {},
): Request {
  return new Request(url, { method: 'POST', ...init })
}

describe('auth cookie policy', () => {
  it('กัน JavaScript อ่าน token และจำกัด cookie ไว้ที่ HTTPS ใน production request', () => {
    expect(authCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('ใช้ protocol ของ request/proxy เป็นข้อเท็จจริง ไม่เดาจาก NODE_ENV', () => {
    expect(isSecureRequest(request())).toBe(true)
    expect(isSecureRequest(request('http://127.0.0.1:3000/api/auth/verify'))).toBe(false)
    expect(
      isSecureRequest(
        request('http://academy.internal/api/auth/verify', {
          headers: { 'x-forwarded-proto': 'https' },
        }),
      ),
    ).toBe(true)
  })

  it('header ที่อ้างว่าเป็น HTTP downgrade HTTPS URL ไม่ได้', () => {
    expect(isSecureRequest(request(undefined, { headers: { 'x-forwarded-proto': 'http' } }))).toBe(true)
  })

  it('production non-local fail-secure และปฏิเสธ auth mutation ที่ไม่ผ่าน HTTPS edge', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const insecure = request('http://academy.cyberskills.co.th/api/auth/verify', {
        headers: { 'x-forwarded-proto': 'http' },
      })
      expect(isSecureRequest(insecure)).toBe(true)
      expect(isSecureServerContext(insecure.headers)).toBe(true)
      expect(acceptsAuthTransport(insecure)).toBe(false)
      expect(acceptsAuthTransport(request())).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('mutation request boundary', () => {
  it('รับ JSON จาก origin เดียวกัน', () => {
    const result = validateMutationRequest(
      request(undefined, {
        headers: {
          origin: 'https://academy.cyberskills.co.th',
          'content-type': 'application/json; charset=utf-8',
        },
      }),
      { requireJson: true },
    )
    expect(result).toEqual({ ok: true })
  })

  it('ปฏิเสธ sibling origin แม้ยังเป็น same-site', () => {
    const result = validateMutationRequest(
      request(undefined, {
        headers: {
          origin: 'https://evil.cyberskills.co.th',
          'content-type': 'application/json',
        },
      }),
      { requireJson: true },
    )
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('ปฏิเสธ request ที่ไม่มี origin และไม่มี Fetch Metadata', () => {
    expect(validateMutationRequest(request())).toMatchObject({ ok: false, status: 403 })
  })

  it('รับ browser request ที่ Fetch Metadata ยืนยัน same-origin แม้ไม่มี Origin', () => {
    expect(
      validateMutationRequest(request(undefined, { headers: { 'sec-fetch-site': 'same-origin' } })),
    ).toEqual({ ok: true })
  })

  it('ใช้ public host และ forwarded protocol เมื่อ app อยู่หลัง TLS proxy', () => {
    const result = validateMutationRequest(
      request('http://worker.internal/api/progress', {
        headers: {
          origin: 'https://academy.cyberskills.co.th',
          host: 'academy.cyberskills.co.th',
          'x-forwarded-proto': 'https',
        },
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('X-Forwarded-Host ที่ client ปลอมมาเปลี่ยน expected origin ไม่ได้', () => {
    const result = validateMutationRequest(
      request('http://worker.internal/api/progress', {
        headers: {
          origin: 'https://evil.cyberskills.co.th',
          host: 'academy.cyberskills.co.th',
          'x-forwarded-host': 'evil.cyberskills.co.th',
          'x-forwarded-proto': 'https',
        },
      }),
    )
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('ปฏิเสธ simple content type ก่อนอ่าน JSON body', () => {
    const result = validateMutationRequest(
      request(undefined, {
        headers: {
          origin: 'https://academy.cyberskills.co.th',
          'content-type': 'text/plain',
        },
      }),
      { requireJson: true },
    )
    expect(result).toMatchObject({ ok: false, status: 415 })
  })
})

describe('bounded JSON', () => {
  it('parse JSON ที่อยู่ในเพดาน', async () => {
    await expect(
      readBoundedJson(request(undefined, { body: JSON.stringify({ ok: true }) }), 128),
    ).resolves.toEqual({ ok: true, value: { ok: true } })
  })

  it('แยก malformed JSON ออกจาก body ที่ใหญ่เกิน', async () => {
    await expect(readBoundedJson(request(undefined, { body: '{' }), 128)).resolves.toEqual({
      ok: false,
      reason: 'invalid-json',
    })
    await expect(
      readBoundedJson(request(undefined, { body: JSON.stringify({ value: 'x'.repeat(200) }) }), 32),
    ).resolves.toEqual({ ok: false, reason: 'too-large' })
  })
})
