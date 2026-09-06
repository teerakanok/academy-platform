import { describe, expect, it } from 'vitest'
import {
  edgeRateLimitAdmission,
  edgeRateLimitObjectName,
  edgeRateLimitRule,
  edgeClientAddress,
  edgeRateLimitTargetObjectName,
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

  it('preserves valid encoded public paths while rejecting protected-route disguises', () => {
    const origin = 'https://academy.cyberskills.co.th'
    expect(edgeRateLimitAdmission(new Request(`${origin}/courses/%E0%B9%84%E0%B8%97%E0%B8%A2`)))
      .toEqual({ kind: 'public' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/assets/course%20guide.pdf`)))
      .toEqual({ kind: 'public' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth/callback%2F`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/%61uth/callback`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth/%63allback`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/%25%61uth/callback`))).toEqual({ kind: 'invalid' })
  })

  it('protects each Identity entry method and canonical path without ambiguous variants', () => {
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
    expect(edgeRateLimitRule(new Request(`${origin}/api/auth/identity/start/`))).toMatchObject({
      operation: 'identity-start-get',
    })
    expect(edgeRateLimitRule(new Request(`${origin}/auth/callback/?code=x&state=y`))).toMatchObject({
      operation: 'identity-callback-get',
    })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth%2Fcallback`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth//callback`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth/callback/..`))).toEqual({ kind: 'public' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth/callback%00`))).toEqual({ kind: 'invalid' })
    expect(edgeRateLimitAdmission(new Request(`${origin}/auth/callback?next=%2Fdashboard`))).toMatchObject({
      kind: 'protected',
      rule: { operation: 'identity-callback-get' },
    })
    expect(new URL(`${origin}/auth/callback/..`).pathname).toBe('/auth/')
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

  it('aggregates IPv6 actors by /64 without exposing the address', async () => {
    const input = {
      operation: 'leads' as const,
      secret: 'test-secret-at-least-32-bytes-long',
    }
    const same64First = await edgeRateLimitObjectName({
      ...input,
      clientAddress: '2001:db8:aaaa:bbbb::1',
    })
    const same64Second = await edgeRateLimitObjectName({
      ...input,
      clientAddress: '2001:0DB8:AAAA:BBBB:0009:0008:0007:0006',
    })
    const other64 = await edgeRateLimitObjectName({
      ...input,
      clientAddress: '2001:db8:aaaa:bbbc::1',
    })
    const malformed = await edgeRateLimitObjectName({ ...input, clientAddress: '2001:db8:::' })

    expect(same64First).toBe(same64Second)
    expect(same64First).not.toBe(other64)
    expect(malformed).toBeNull()
    expect(same64First).not.toContain('2001')
  })

  it('derives keyed target names from actual recipients only', async () => {
    const input = {
      operation: 'otp' as const,
      target: 'person@example.com',
      secret: 'test-secret-at-least-32-bytes-long',
    }
    const first = await edgeRateLimitTargetObjectName(input)
    const equivalent = await edgeRateLimitTargetObjectName({
      ...input,
      target: 'PERSON@EXAMPLE.COM',
    })
    const otherTarget = await edgeRateLimitTargetObjectName({ ...input, target: 'other@example.com' })

    expect(first).toBe(equivalent)
    expect(first).not.toBe(otherTarget)
    expect(first).not.toContain('person')
    expect(first).not.toContain('example.com')
    expect(await edgeRateLimitTargetObjectName({ ...input, target: '' })).toBeNull()
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
