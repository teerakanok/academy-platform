import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { CURRENT_CONSENT_VERSION } from '@/lib/consent'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('@/lib/db/server', () => ({
  academyDb: () => ({ rpc: mocks.rpc }),
}))

vi.mock('@/lib/edge-rate-limit-policy', () => ({
  hasEdgeRateLimitMarker: vi.fn(async () => true),
}))

function waitlistRequest(email = ' Learner@Example.COM '): NextRequest {
  return new NextRequest('https://academy.example.test/api/leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://academy.example.test',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify({ email, consent: true }),
  })
}

describe('pending waitlist request does not grant marketing consent', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('records only a server-versioned pending request', async () => {
    const { POST } = await import('@/app/(site)/api/leads/route')

    const response = await POST(waitlistRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('record_pending_waitlist_request', {
      p_email: 'learner@example.com',
      p_requested_at: expect.any(String),
      p_requested_consent_text_version: CURRENT_CONSENT_VERSION,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
      p_referrer: null,
    })
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_lead_consent', expect.anything())
  })

  it('does not report success when the pending-request write fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'database detail must stay server-side' },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { POST } = await import('@/app/(site)/api/leads/route')

    const response = await POST(waitlistRequest('learner@example.com'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'บันทึกไม่สำเร็จ โปรดลองใหม่ภายหลัง',
    })
    consoleError.mockRestore()
  })
})
