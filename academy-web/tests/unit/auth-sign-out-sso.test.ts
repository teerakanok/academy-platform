import { describe, expect, it } from 'vitest'
import {
  projectSignOutResponse,
  projectSignOutResponseWithSso,
} from '@/lib/auth/account-response-client'

// F-1: production sign-out ต้องส่ง ssoSignoutUrl กลับมาให้ browser ไปจบ SSO กลาง
// fixture สาม branch ไม่ส่ง จึงต้อง accept ทั้งสองรูป — และปฏิเสธ URL ที่ไม่ใช่
// https หรือยาวเกิน bound เพราะ URL นี้จะถูก fetch โดย client ของเราเอง
describe('projectSignOutResponseWithSso', () => {
  it('accepts the legacy fixture shape without ssoSignoutUrl', () => {
    expect(projectSignOutResponseWithSso({ ok: true, scope: 'local', revocation: 'confirmed' }))
      .toEqual({ revocation: 'confirmed' })
  })

  it('accepts the production shape and returns the URL', () => {
    expect(projectSignOutResponseWithSso({
      ok: true,
      scope: 'local',
      revocation: 'not-confirmed',
      ssoSignoutUrl: 'https://accounts.cyberskills.co.th/v1/sessions/signout',
    })).toEqual({
      revocation: 'not-confirmed',
      ssoSignoutUrl: 'https://accounts.cyberskills.co.th/v1/sessions/signout',
    })
  })

  it('rejects a non-https or oversized URL', () => {
    expect(projectSignOutResponseWithSso({
      ok: true, scope: 'local', revocation: 'confirmed', ssoSignoutUrl: 'http://insecure.test/out',
    })).toBeNull()
    expect(projectSignOutResponseWithSso({
      ok: true, scope: 'local', revocation: 'confirmed', ssoSignoutUrl: `https://x.test/${'a'.repeat(300)}`,
    })).toBeNull()
  })

  it('rejects unexpected keys', () => {
    expect(projectSignOutResponseWithSso({
      ok: true, scope: 'local', revocation: 'confirmed', extra: 1,
    })).toBeNull()
  })

  it('keeps the strict legacy projector unchanged for fixture branches', () => {
    expect(projectSignOutResponse({ ok: true, scope: 'local', revocation: 'confirmed' }))
      .toEqual({ revocation: 'confirmed' })
    expect(projectSignOutResponse({
      ok: true, scope: 'local', revocation: 'confirmed', ssoSignoutUrl: 'https://x.test/',
    })).toBeNull()
  })
})
