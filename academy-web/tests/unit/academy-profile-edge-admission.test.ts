import { afterEach, expect, it, vi } from 'vitest'

const { publicShare } = vi.hoisted(() => ({ publicShare: vi.fn() }))
vi.mock('@/lib/profile/core-host-client', () => ({ createCoreHostClient: () => ({ publicShare }) }))
import { enforceEdgeRateLimit } from '@/lib/edge-rate-limit-enforcement'
import { POST } from '@/app/(site)/api/profile/public/read/route'

afterEach(() => vi.unstubAllEnvs())

it('requires the real edge admission marker before a public share read', async () => {
  const secret = 'synthetic-rate-limit-key-for-test-only'
  vi.stubEnv('RATE_LIMIT_KEY_SECRET', secret)
  const input = () => new Request('https://academy.example.test/api/profile/public/read', {
    method: 'POST', headers: { origin: 'https://academy.example.test', 'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.7' },
    body: JSON.stringify({ shareId: `shr_${'a'.repeat(32)}`, secret: 'b'.repeat(64) }),
  })
  publicShare.mockResolvedValue({ synthetic: true })
  expect((await POST(input())).status).toBe(503)
  expect(publicShare).not.toHaveBeenCalled()
  const admitted = await enforceEdgeRateLimit(input(), {
    RATE_LIMIT_KEY_SECRET: secret,
    EDGE_RATE_LIMITER: { getByName: () => ({ check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }) },
  })
  expect(admitted).toBeInstanceOf(Request)
  expect((await POST(admitted as Request)).status).toBe(200)
  expect(publicShare).toHaveBeenCalledTimes(1)
  const failed = await enforceEdgeRateLimit(input(), {})
  expect(failed).toBeInstanceOf(Response)
  expect((failed as Response).status).toBe(503)
})
