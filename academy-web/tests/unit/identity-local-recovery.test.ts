import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const originalEnvironment = { ...process.env }

function enableLocalFixture() {
  process.env = {
    ...originalEnvironment,
    NODE_ENV: 'test',
    ACADEMY_IDENTITY_CONTROL_LOCAL_FIXTURE: '1',
    ACADEMY_IDENTITY_CONTROL_LOCAL_APP_ORIGIN: 'http://localhost:3000',
  }
}

afterEach(() => {
  process.env = { ...originalEnvironment }
  vi.restoreAllMocks()
})

describe('Academy local Identity Control recovery', () => {
  it('never redirects sign-in away solely because a stale-looking cookie is present', async () => {
    enableLocalFixture()
    const response = await middleware(new NextRequest('http://localhost:3000/sign-in', {
      headers: { cookie: `academy_session=${'A'.repeat(32)}` },
    }))

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
