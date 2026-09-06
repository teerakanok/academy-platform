import { describe, expect, it } from 'vitest'
import { CANONICAL_HOST, isServedHost, servedHosts, unservedHostResponse } from '@/lib/edge-host-policy'

describe('edge host policy', () => {
  it('serves the canonical host and loopback, and nothing else by default', () => {
    expect(isServedHost(new Request(`https://${CANONICAL_HOST}/sign-in`), {})).toBe(true)
    expect(isServedHost(new Request('http://localhost:3000/'), {})).toBe(true)
    expect(isServedHost(new Request('http://127.0.0.1:8787/'), {})).toBe(true)
    expect(isServedHost(new Request('https://cyberskills-academy.songpon-te.workers.dev/'), {})).toBe(false)
    expect(isServedHost(new Request('https://academy.cyberskills.co.th.evil.example/'), {})).toBe(false)
  })

  it('admits an explicitly declared host, trimmed and case-folded, only while it is declared', () => {
    const env = { ACADEMY_SERVED_HOSTS: ' Cyberskills-Academy.songpon-te.workers.dev , ' }
    expect(isServedHost(new Request('https://cyberskills-academy.songpon-te.workers.dev/'), env)).toBe(true)
    expect(isServedHost(new Request('https://cyberskills-academy.songpon-te.workers.dev/'), {})).toBe(false)
    expect(servedHosts(env).has('')).toBe(false)
  })

  it('answers an unserved host with an empty, uncacheable 404', async () => {
    const response = unservedHostResponse()
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
  })
})
