import { describe, expect, it } from 'vitest'
import {
  EDGE_RATE_LIMIT_MARKER,
  edgeRateLimitObjectName,
  edgeRateLimitRule,
  edgeClientAddress,
  hasEdgeRateLimitMarker,
} from '@/lib/edge-rate-limit-policy'

describe('edge rate-limit policy', () => {
  it.each([
    ['/api/leads', 'leads'],
    ['/api/leads/unsubscribe', 'unsubscribe'],
    ['/api/auth/otp', 'otp'],
    ['/api/auth/verify', 'verify'],
  ])('protects POST %s as %s', (path, operation) => {
    const rule = edgeRateLimitRule(new Request(`https://academy.cyberskills.co.th${path}`, { method: 'POST' }))
    expect(rule?.operation).toBe(operation)
    expect(rule?.limit).toBe(10)
    expect(rule?.windowMs).toBe(60_000)
  })

  it('does not limit GET or an unlisted API mutation at the edge', () => {
    expect(edgeRateLimitRule(new Request('https://academy.cyberskills.co.th/api/leads'))).toBeNull()
    expect(edgeRateLimitRule(new Request('https://academy.cyberskills.co.th/api/progress', { method: 'POST' }))).toBeNull()
  })

  it('uses only Cloudflare-provided client IP at the edge', () => {
    expect(edgeClientAddress(new Request('https://academy.cyberskills.co.th', {
      headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' },
    }))).toBe('203.0.113.7')
    expect(edgeClientAddress(new Request('https://academy.cyberskills.co.th', {
      headers: { 'x-forwarded-for': '198.51.100.9' },
    }))).toBeNull()
  })

  it('derives a stable opaque object name without embedding the client address', async () => {
    const input = {
      operation: 'leads' as const,
      clientAddress: '203.0.113.7',
      secret: 'test-secret-at-least-32-bytes-long',
    }
    const first = await edgeRateLimitObjectName(input)
    const second = await edgeRateLimitObjectName(input)
    const changedOperation = await edgeRateLimitObjectName({ ...input, operation: 'unsubscribe' })
    const changedSecret = await edgeRateLimitObjectName({ ...input, secret: 'another-test-secret-at-least-32-bytes' })

    expect(first).toBe(second)
    expect(first).not.toContain(input.clientAddress)
    expect(first).not.toBe(changedOperation)
    expect(first).not.toBe(changedSecret)
  })

  it('accepts only the exact marker written by the outer Worker', () => {
    expect(hasEdgeRateLimitMarker(new Headers({ 'x-cyberskills-edge-rate-limit': EDGE_RATE_LIMIT_MARKER }))).toBe(true)
    expect(hasEdgeRateLimitMarker(new Headers({ 'x-cyberskills-edge-rate-limit': 'true' }))).toBe(false)
    expect(hasEdgeRateLimitMarker(new Headers())).toBe(false)
  })
})
