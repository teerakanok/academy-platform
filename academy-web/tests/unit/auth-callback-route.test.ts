import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/auth/callback/route'
import { resetIdentityAdapterForTest } from '@/lib/identity/registry'

afterEach(() => {
  vi.unstubAllEnvs()
  resetIdentityAdapterForTest()
})

describe('GET /auth/callback', () => {
  it('rejects browser-carried identity attributes before it can ask an adapter to exchange a code', async () => {
    const response = await GET(
      new Request('https://academy.cyberskills.co.th/auth/callback?code=aaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbb&email=learner@example.test'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
  })

  it('keeps a syntactically valid callback unavailable until an Identity Control adapter is configured', async () => {
    vi.stubEnv('IDENTITY_ADAPTER', 'none')
    const response = await GET(
      new Request('https://academy.cyberskills.co.th/auth/callback?code=aaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbb'),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ok: false })
  })
})
