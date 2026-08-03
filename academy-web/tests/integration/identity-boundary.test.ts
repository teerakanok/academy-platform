import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { createHash, randomBytes } from 'node:crypto'
import { requiredEnv } from './setup'
import { FakeIdentityAdapter } from '@/lib/identity/fake-adapter'
import type { AuthorizationRequest } from '@/lib/identity/adapter'
import { findOrCreateUser } from '@/lib/account/users'
import {
  getActivation,
  grantCourseEntitlement,
  hasCourseEntitlement,
  isServiceUsable,
  revokeCourseEntitlement,
  syncActivation,
} from '@/lib/account/access'
import { getCourseAccess } from '@/lib/account/course-access'

// ทิศทาง Identity Control: account exists → service activation → product entitlement
// → resource authorization และ **ชั้นก่อนหน้าไม่เคยแปลว่าได้ชั้นถัดไป**
//
// เทสชุดนี้คือด่านที่ทำให้กฎนั้นเป็นจริงในโค้ด ไม่ใช่แค่ในเอกสาร

const ISS = 'https://accounts.cyberskills.co.th'

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function cleanup() {
  await withDb(async (db) => {
    await db.query(
      `delete from academy.course_entitlement where user_id in (select id from academy.users where issuer = $1)`,
      [ISS],
    )
    await db.query(
      `delete from academy.service_activation where user_id in (select id from academy.users where issuer = $1)`,
      [ISS],
    )
    await db.query(`delete from academy.users where issuer = $1`, [ISS])
  })
}

beforeAll(cleanup)
afterAll(cleanup)

function request(): AuthorizationRequest {
  const verifier = randomBytes(48).toString('base64url')
  return {
    clientId: 'academy-web',
    redirectUri: 'http://localhost:3000/auth/callback',
    stateRef: randomBytes(16).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    serviceId: 'academy',
  }
}

function verifierFor(req: AuthorizationRequest, verifier: string) {
  return { clientId: req.clientId, redirectUri: req.redirectUri, codeVerifier: verifier }
}

describe('adapter ต้องบังคับกฎเดียวกับของจริง (ไม่ใช่ stub ที่ตอบ ok เสมอ)', () => {
  it('code ใช้ได้ครั้งเดียว', async () => {
    const a = new FakeIdentityAdapter(ISS)
    const verifier = randomBytes(48).toString('base64url')
    const req = { ...request(), codeChallenge: createHash('sha256').update(verifier).digest('base64url') }
    const code = a.issueCodeForTest(req, { subject: 'sub-once', verifiedEmail: 'once@example.com' })

    await expect(a.exchangeCode({ ...verifierFor(req, verifier), code })).resolves.toMatchObject({
      subject: 'sub-once',
    })
    await expect(a.exchangeCode({ ...verifierFor(req, verifier), code })).rejects.toThrow()
  })

  it('PKCE verifier ผิด แลกไม่ได้', async () => {
    const a = new FakeIdentityAdapter(ISS)
    const verifier = randomBytes(48).toString('base64url')
    const req = { ...request(), codeChallenge: createHash('sha256').update(verifier).digest('base64url') }
    const code = a.issueCodeForTest(req, { subject: 'sub-pkce', verifiedEmail: 'p@example.com' })
    await expect(
      a.exchangeCode({ ...verifierFor(req, randomBytes(48).toString('base64url')), code }),
    ).rejects.toThrow(/PKCE/)
  })

  it('redirect_uri ไม่ตรงกับตอนเริ่ม แลกไม่ได้', async () => {
    const a = new FakeIdentityAdapter(ISS)
    const verifier = randomBytes(48).toString('base64url')
    const req = { ...request(), codeChallenge: createHash('sha256').update(verifier).digest('base64url') }
    const code = a.issueCodeForTest(req, { subject: 'sub-uri', verifiedEmail: 'u@example.com' })
    await expect(
      a.exchangeCode({ clientId: req.clientId, redirectUri: 'http://evil.example/cb', codeVerifier: verifier, code }),
    ).rejects.toThrow()
  })

  it('adapter ปลอมต้องประกาศตัวว่าใช้บน production ไม่ได้', () => {
    expect(new FakeIdentityAdapter().productionSafe).toBe(false)
  })
})

describe('ชั้นสถานะต้องแยกจากกันจริง', () => {
  it('เปิดใช้บริการสำเร็จ ไม่ได้ให้สิทธิ์เข้าคอร์สใดเลย', async () => {
    // นี่คือข้อที่ทิศทางย้ำที่สุด และเป็นข้อที่ระบบเดิมทำผิด
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-act-1', email: 'act1@example.com' })
    await syncActivation(user.id, {
      issuer: ISS,
      subject: 'sub-act-1',
      verifiedEmail: 'act1@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: 'n',
      activation: { status: 'active', revision: 3 },
    })

    const activation = await getActivation(user.id)
    expect(isServiceUsable(activation)).toBe(true)
    expect(activation?.revision).toBe(3)

    // เปิดใช้บริการแล้ว แต่ยังไม่มีสิทธิ์คอร์สไหนเลย
    expect(await hasCourseEntitlement(user.id, 'basic-os-linux')).toBe(false)
    expect(await hasCourseEntitlement(user.id, 'content-formats-demo')).toBe(false)
    expect(await getCourseAccess(user.id, 'basic-os-linux')).toEqual({
      allowed: false,
      reason: 'not-entitled',
    })
  })

  it('มีบัญชีอย่างเดียว ยังไม่นับว่าเปิดใช้บริการ', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-act-2', email: 'act2@example.com' })
    expect(await getActivation(user.id)).toBeNull()
    expect(isServiceUsable(null)).toBe(false)
  })

  it('สิทธิ์ที่ถูกเพิกถอนแล้วใช้ไม่ได้ แต่ยังตอบได้ว่าเคยมี', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-ent', email: 'ent@example.com' })
    await grantCourseEntitlement(user.id, 'basic-os-linux', 'purchase')
    expect(await hasCourseEntitlement(user.id, 'basic-os-linux')).toBe(true)

    await revokeCourseEntitlement(user.id, 'basic-os-linux')
    expect(await hasCourseEntitlement(user.id, 'basic-os-linux')).toBe(false)

    const rows = await withDb((db) =>
      db.query(`select source, revoked_at from academy.course_entitlement where user_id = $1`, [user.id]),
    )
    expect(rows.rows[0].source).toBe('purchase')
    expect(rows.rows[0].revoked_at).not.toBeNull()
  })

  it('สิทธิ์ที่หมดอายุแล้วใช้ไม่ได้', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-exp', email: 'exp@example.com' })
    await grantCourseEntitlement(user.id, 'basic-os-linux', 'invitation', new Date(Date.now() - 1000))
    expect(await hasCourseEntitlement(user.id, 'basic-os-linux')).toBe(false)
  })

  it('สถานะ suspended ใช้บริการไม่ได้ แม้จะเคยมีสิทธิ์คอร์สอยู่', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-susp', email: 'susp@example.com' })
    await grantCourseEntitlement(user.id, 'basic-os-linux', 'free')
    await syncActivation(user.id, {
      issuer: ISS,
      subject: 'sub-susp',
      verifiedEmail: 'susp@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: 'n',
      activation: { status: 'suspended', revision: 9 },
    })
    expect(isServiceUsable(await getActivation(user.id))).toBe(false)
    // สิทธิ์คอร์สยังอยู่ (คนละชั้น) — การกันเข้าเว็บเป็นหน้าที่ของชั้น activation
    expect(await hasCourseEntitlement(user.id, 'basic-os-linux')).toBe(true)
    expect(await getCourseAccess(user.id, 'basic-os-linux')).toEqual({
      allowed: false,
      reason: 'inactive',
    })
  })

  it('เข้า course content ได้เมื่อ activation และ entitlement ผ่านพร้อมกันเท่านั้น', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-access', email: 'access@example.com' })
    await syncActivation(user.id, {
      issuer: ISS,
      subject: 'sub-access',
      verifiedEmail: 'access@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: 'n',
      activation: { status: 'active', revision: 1 },
    })
    await grantCourseEntitlement(user.id, 'basic-os-linux', 'free')

    expect(await getCourseAccess(user.id, 'basic-os-linux')).toEqual({ allowed: true })
  })

  it('activation revision เก่าที่มาช้าห้ามทับสถานะ revision ใหม่', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-revision', email: 'revision@example.com' })
    const result = (status: 'active' | 'suspended', revision: number) => ({
      issuer: ISS,
      subject: 'sub-revision',
      verifiedEmail: 'revision@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: `revision-${revision}`,
      activation: { status, revision },
    })

    await syncActivation(user.id, result('suspended', 9))
    await syncActivation(user.id, result('active', 8))

    expect(await getActivation(user.id)).toEqual({ status: 'suspended', revision: 9 })
  })

  it('activation revision เท่ากันแต่สถานะขัดกันต้อง reject ไม่ใช่ last-write-wins', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-conflict', email: 'conflict@example.com' })
    const base = {
      issuer: ISS,
      subject: 'sub-conflict',
      verifiedEmail: 'conflict@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: 'same-revision',
    }
    await syncActivation(user.id, { ...base, activation: { status: 'suspended', revision: 4 } })

    await expect(
      syncActivation(user.id, { ...base, activation: { status: 'active', revision: 4 } }),
    ).rejects.toThrow(/revision|สถานะ/i)
    expect(await getActivation(user.id)).toEqual({ status: 'suspended', revision: 4 })
  })

  it('activation events ต่าง revision ที่มาพร้อมกันต้องจบที่ revision สูงสุด', async () => {
    const user = await findOrCreateUser({ issuer: ISS, subject: 'sub-race', email: 'race@example.com' })
    const base = {
      issuer: ISS,
      subject: 'sub-race',
      verifiedEmail: 'race@example.com',
      audience: 'academy-web',
      serviceId: 'academy',
      nonce: 'race',
    }
    await Promise.all([
      syncActivation(user.id, { ...base, activation: { status: 'active', revision: 10 } }),
      syncActivation(user.id, { ...base, activation: { status: 'suspended', revision: 11 } }),
    ])
    expect(await getActivation(user.id)).toEqual({ status: 'suspended', revision: 11 })
  })
})

describe('RLS ของตารางใหม่', () => {
  it.each(['service_activation', 'course_entitlement'])('%s default deny และไม่ให้สิทธิ์ anon', async (table) => {
    const res = await withDb((db) =>
      db.query(
        `select c.relrowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
                (select count(*) from information_schema.role_table_grants g
                  where g.table_schema='academy' and g.table_name=$1 and g.grantee in ('anon','authenticated')) as loose
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname='academy' and c.relname=$1`,
        [table],
      ),
    )
    expect(res.rows[0].relrowsecurity).toBe(true)
    expect(Number(res.rows[0].policies)).toBe(0)
    expect(Number(res.rows[0].loose)).toBe(0)
  })
})
