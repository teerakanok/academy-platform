import { createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

const apiUrl = process.env.TEST_ACADEMY_RETENTION_API_URL
const signingSecret = process.env.TEST_ACADEMY_RETENTION_API_JWT_SECRET
const testDatabaseId = process.env.TEST_ACADEMY_RETENTION_DATABASE_ID
const destructiveTestOptIn = process.env.TEST_ALLOW_DESTRUCTIVE_RETENTION_API === '1'

function isSafeLocalTestTarget(raw: string | undefined): boolean {
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search && !url.hash
  } catch {
    return false
  }
}

const hasDedicatedApi = Boolean(signingSecret && testDatabaseId && destructiveTestOptIn && isSafeLocalTestTarget(apiUrl))

function tokenFor(role: string): string {
  if (!signingSecret) throw new Error('retention API test configuration is missing')
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const signed = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'academy-retention-api',
    exp: now + 60,
    iat: now,
    role,
  })}`
  return `${signed}.${createHmac('sha256', signingSecret).update(signed).digest('base64url')}`
}

describe('dedicated Academy retention PostgREST contract configuration', () => {
  // skip สงวนไว้เฉพาะ "ไม่ได้ตั้งค่าเลย" — ถ้าตั้ง TEST_ACADEMY_RETENTION_API_URL แล้วแต่
  // ชี้ target ที่ predicate ความปลอดภัยของ suite นี้ปฏิเสธ ต้อง fail ทันที ไม่ใช่ skip เงียบ
  it('fails when TEST_ACADEMY_RETENTION_API_URL is configured to a target the local test safety predicate rejects', () => {
    expect(apiUrl === undefined || isSafeLocalTestTarget(apiUrl)).toBe(true)
  })
})

describe.skipIf(!hasDedicatedApi)('dedicated Academy retention PostgREST contract', () => {
  const request = (path: string, authorization?: string, profile = 'academy') =>
    fetch(`${apiUrl}${path}`, {
      method: path.startsWith('/rpc/') ? 'POST' : 'GET',
      headers: {
        ...(authorization ? { authorization } : {}),
        'accept-profile': profile,
        ...(path.startsWith('/rpc/') ? { 'content-type': 'application/json', 'content-profile': profile } : {}),
      },
      body: path.startsWith('/rpc/') ? '{}' : undefined,
    })

  beforeAll(async () => {
    const response = await request('/rpc/retention_test_database_identity', `Bearer ${tokenFor('academy_retention')}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toBe(testDatabaseId)
  })

  it('allows exactly the five bounded retention RPC capabilities', async () => {
    const retention = `Bearer ${tokenFor('academy_retention')}`
    const jobs = [
      'run_retention_attempts',
      'run_retention_leads',
      'run_retention_inactive_users',
      'run_retention_privacy_requests',
      'run_retention_staff_authorization_history',
    ] as const

    const responses = await Promise.all(jobs.map((rpc) => request(`/rpc/${rpc}`, retention)))
    for (const response of responses) {
      expect(response.status).toBe(200)
      expect(Number.isSafeInteger(await response.json())).toBe(true)
    }
  })

  it('denies anonymous, table access, forged runtime role, and cross-schema access', async () => {
    const retention = `Bearer ${tokenFor('academy_retention')}`
    const [anonymous, directTable, policyBypass, forgedRuntime, crossSchema] = await Promise.all([
      request('/rpc/run_retention_attempts'),
      request('/leads?select=id', retention),
      request('/rpc/purge_expired_attempts', retention),
      request('/rpc/run_retention_attempts', `Bearer ${tokenFor('academy_runtime')}`),
      request('/rpc/run_retention_attempts', retention, 'helm'),
    ])

    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({ code: '42501' })
    expect(directTable.status).toBe(403)
    expect(await directTable.json()).toMatchObject({ code: '42501' })
    expect(policyBypass.status).toBe(403)
    expect(await policyBypass.json()).toMatchObject({ code: '42501' })
    expect(forgedRuntime.status).toBe(403)
    expect(await forgedRuntime.json()).toMatchObject({ code: '42501' })
    expect(crossSchema.status).toBe(406)
    expect(await crossSchema.json()).toMatchObject({ code: 'PGRST106' })
  })
})
