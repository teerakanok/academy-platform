import { describe, expect, it, vi } from 'vitest'
import { enforceEdgeRateLimit } from '@/lib/edge-rate-limit-enforcement'
import { edgeRateLimitAdmission, edgeRateLimitRule } from '@/lib/edge-rate-limit-policy'

const origin = 'https://academy.cyberskills.co.th'
const request = (path: string, method = 'GET') => new Request(`${origin}${path}`, {
  method, headers: { 'cf-connecting-ip': '203.0.113.7' },
})

describe('costly resource admission', () => {
  it.each([
    ['/api/attempts', 'POST', 'learner-attempt'],
    ['/api/courses/example/certificate', 'GET', 'certificate-status'],
    ['/api/courses/example/certificate', 'POST', 'certificate-issue'],
    ['/api/courses/example/certificate/pdf', 'GET', 'certificate-pdf'],
    ['/api/certificate/verify', 'GET', 'certificate-verify'],
    ['/course-media/os-video-en', 'GET', 'private-media'],
    ['/course-media/os-video-en', 'HEAD', 'private-media'],
  ])('gates %s %s before downstream work', async (path, method, operation) => {
    expect(edgeRateLimitRule(request(path, method))).toMatchObject({ operation })
    const response = await enforceEdgeRateLimit(request(path, method), {})
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(503)
  })

  it('aggregates certificate requests across course IDs and emits a retryable denial', async () => {
    const names: string[] = []
    const check = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    const env = {
      RATE_LIMIT_KEY_SECRET: 'fixture-rate-limit-key-with-enough-length',
      EDGE_RATE_LIMITER: { getByName: (name: string) => { names.push(name); return { check } } },
    }
    expect(await enforceEdgeRateLimit(request('/api/courses/first/certificate/pdf'), env)).toBeInstanceOf(Request)
    const firstNames = [...names]
    names.length = 0
    expect(await enforceEdgeRateLimit(request('/api/courses/second/certificate/pdf'), env)).toBeInstanceOf(Request)
    expect(names).toEqual(firstNames)
    expect(names).toHaveLength(2)
    check.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 })
    const denied = await enforceEdgeRateLimit(request('/api/courses/third/certificate/pdf'), env) as Response
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('42')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it('keeps normal media range playback within a larger actor allowance', async () => {
    const check = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    const req = request('/course-media/os-video-en')
    req.headers.set('range', 'bytes=1000-1999')
    const admitted = await enforceEdgeRateLimit(req, {
      RATE_LIMIT_KEY_SECRET: 'fixture-rate-limit-key-with-enough-length',
      EDGE_RATE_LIMITER: { getByName: () => ({ check }) },
    }) as Request
    expect(admitted.headers.get('range')).toBe('bytes=1000-1999')
    expect(check.mock.calls.map(([rule]) => rule.limit)).toEqual([300, 6000])
  })

  it.each(['/api/%61ttempts', '/%63ourse-media/os-video-en', '/api/%63ertificate/verify'])
    ('rejects encoded endpoint aliases: %s', (path) => {
      expect(edgeRateLimitAdmission(request(path, path.includes('ttempts') ? 'POST' : 'GET')))
        .toEqual({ kind: 'invalid' })
    })
})

