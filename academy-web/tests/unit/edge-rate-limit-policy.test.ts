import { describe, expect, it } from 'vitest'
import {
  edgeRateLimitObjectName,
  edgeRateLimitRule,
  edgeClientAddress,
  hasEdgeRateLimitMarker,
  withEdgeRateLimitMarker,
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

  it('protects each Identity entry method and path without path variants', () => {
    const origin = 'https://academy.cyberskills.co.th'
    expect(edgeRateLimitRule(new Request(`${origin}/api/auth/identity/start`))).toMatchObject({
      operation: 'identity-start-get',
    })
    expect(edgeRateLimitRule(new Request(`${origin}/api/auth/identity/start`, { method: 'POST' }))).toMatchObject({
      operation: 'identity-start-post',
    })
    expect(edgeRateLimitRule(new Request(`${origin}/auth/callback`))).toMatchObject({
      operation: 'identity-callback-get',
    })
    expect(edgeRateLimitRule(new Request(`${origin}/api/auth/identity/start`, { method: 'PUT' }))).toBeNull()
    expect(edgeRateLimitRule(new Request(`${origin}/api/auth/identity/start/`))).toBeNull()
    expect(edgeRateLimitRule(new Request(`${origin}/auth/callback/`))).toBeNull()
    expect(edgeRateLimitRule(new Request(`${origin}/auth%2Fcallback`))).toBeNull()
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

  it('accepts only a fresh signed marker bound to the outer Worker request', async () => {
    const secret = 'test-secret-at-least-32-bytes-long'
    const request = new Request('https://academy.cyberskills.co.th/api/auth/verify', { method: 'POST' })
    const marked = await withEdgeRateLimitMarker(request, { secret, now: () => 1_000_000 })

    expect(await hasEdgeRateLimitMarker(marked, { secret, now: () => 1_000_000 })).toBe(true)
    expect(await hasEdgeRateLimitMarker(new Request(marked, {
      method: 'GET',
    }), { secret, now: () => 1_000_000 })).toBe(false)
    expect(await hasEdgeRateLimitMarker(new Request('https://academy.cyberskills.co.th/api/auth/verify', {
      method: 'POST',
      headers: { 'x-cyberskills-edge-rate-limit': 'v1' },
    }), { secret, now: () => 1_000_000 })).toBe(false)
    expect(await hasEdgeRateLimitMarker(request, { secret, now: () => 1_000_000 })).toBe(false)
  })
})
