import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  identityControlLocalFixtureAllowedForRequest,
  identityControlLocalFixtureEnabled,
} from '@/lib/identity/local-fixture'

describe('Identity Control local browser fixture guard', () => {
  it('requires the explicit flag, non-production mode, and the exact loopback app origin', () => {
    const enabled = {
      NODE_ENV: 'test',
      ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE: '1',
      ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN: 'http://localhost:3000',
    }
    expect(identityControlLocalFixtureEnabled(enabled)).toBe(true)
    expect(identityControlLocalFixtureAllowedForRequest(
      new Request('http://localhost:3000/dashboard'),
      enabled,
    )).toBe(true)

    expect(identityControlLocalFixtureEnabled({ ...enabled, NODE_ENV: 'production' })).toBe(false)
    expect(identityControlLocalFixtureEnabled({ ...enabled, ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE: '0' })).toBe(false)
    expect(identityControlLocalFixtureAllowedForRequest(
      new Request('http://127.0.0.1:3000/dashboard'),
      enabled,
    )).toBe(false)
    expect(identityControlLocalFixtureAllowedForRequest(
      new Request('https://academy.cyberskills.co.th/dashboard'),
      enabled,
    )).toBe(false)
  })

  it('binds the supported development server to loopback instead of every interface', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      scripts?: Record<string, unknown>
    }
    expect(manifest.scripts?.dev).toBe('next dev --hostname 127.0.0.1')
  })
})
