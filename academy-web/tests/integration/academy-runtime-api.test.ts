import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAcademyDb, isSafeAcademyDataApiUrl } from '@/lib/db/server'
import { ACADEMY_RUNTIME_AUDIENCE, ACADEMY_RUNTIME_ROLE } from '@/lib/db/runtime-token'

const apiUrl = process.env.ACADEMY_DATA_API_URL
const signingSecret = process.env.ACADEMY_DATA_API_JWT_SECRET
// raw fetch ด้านล่างไม่ผ่าน createAcademyDb — กัน env ที่ตั้งผิดทำให้เทสส่ง bearer
// ที่เซ็นด้วย secret ไปหา origin ที่ตัว production client เองปฏิเสธ จึง pin ด้วย
// rule เดียวกับ src/lib/db/server.ts (HTTPS หรือ HTTP loopback 127.0.0.1, origin เปล่า)
const hasDedicatedApi = Boolean(apiUrl && signingSecret && isSafeAcademyDataApiUrl(apiUrl))

function tokenFor(role: string): string {
  if (!signingSecret) throw new Error('dedicated API test configuration is missing')
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const signed = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: ACADEMY_RUNTIME_AUDIENCE,
    exp: now + 60,
    iat: now,
    role,
  })}`
  return `${signed}.${createHmac('sha256', signingSecret).update(signed).digest('base64url')}`
}

describe('dedicated Academy PostgREST contract configuration', () => {
  // skip สงวนไว้เฉพาะ "ไม่ได้ตั้งค่าเลย" — ถ้าตั้ง ACADEMY_DATA_API_URL แล้วแต่
  // ชี้ origin ที่ production client ปฏิเสธ ต้อง fail ทันที ไม่ใช่ skip เงียบ
  it('fails when ACADEMY_DATA_API_URL is configured to an origin the app client rejects', () => {
    expect(apiUrl === undefined || isSafeAcademyDataApiUrl(apiUrl)).toBe(true)
  })
})

describe.skipIf(!hasDedicatedApi)('dedicated Academy PostgREST contract', () => {
  it('accepts the runtime JWT through the application client', async () => {
    const { data, error } = await createAcademyDb({ url: apiUrl!, signingSecret: signingSecret! })
      .from('users')
      .select('id')
      .limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('denies anonymous, malformed, forged shared-role, and cross-schema requests', async () => {
    const request = (path: string, profile: string, authorization?: string) =>
      fetch(`${apiUrl}${path}`, {
        headers: {
          ...(authorization ? { authorization } : {}),
          'accept-profile': profile,
        },
      })

    const [anonymous, malformed, forgedSharedRole, crossSchema] = await Promise.all([
      request('/users?select=id', 'academy'),
      request('/users?select=id', 'academy', 'Bearer not-a-jwt'),
      request('/users?select=id', 'academy', `Bearer ${tokenFor('service_role')}`),
      request('/users?select=id', 'helm', `Bearer ${tokenFor(ACADEMY_RUNTIME_ROLE)}`),
    ])

    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({ code: '42501' })
    expect(malformed.status).toBe(401)
    expect(await malformed.json()).toMatchObject({ code: 'PGRST301' })
    expect(forgedSharedRole.status).toBe(403)
    expect(await forgedSharedRole.json()).toMatchObject({ code: '42501' })
    expect(crossSchema.status).toBe(406)
    expect(await crossSchema.json()).toMatchObject({ code: 'PGRST106' })
  })
})
