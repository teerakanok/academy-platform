import { describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { requiredEnv } from './setup'

// RLS hardening — assert จาก pg_catalog ตรงๆ (ไม่เชื่อคำประกาศใน migration)
// นโยบายที่ migration ประกาศ: RLS เปิด + policy = 0 (default deny) +
// ไม่มี grant ให้ anon/authenticated บน schema academy

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('TEST_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

describe('RLS hardening — academy.leads', () => {
  it('relrowsecurity = true บน academy.leads', async () => {
    const rows = await withDb(async (db) => {
      const res = await db.query(
        `select c.relrowsecurity
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = 'leads'`,
      )
      return res.rows
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('จำนวน policy บน academy.leads = 0 ตามที่ migration ประกาศ (default deny)', async () => {
    const count = await withDb(async (db) => {
      const res = await db.query(
        `select count(*)::int as n from pg_policies
          where schemaname = 'academy' and tablename = 'leads'`,
      )
      return res.rows[0].n as number
    })
    expect(count).toBe(0)
  })

  it('anon/authenticated ไม่มีสิทธิ์ใดๆ บน academy.leads และไม่มี usage บน schema', async () => {
    const { tablePrivs, schemaUsage } = await withDb(async (db) => {
      const t = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'academy' and table_name = 'leads'
            and grantee in ('anon', 'authenticated')`,
      )
      const s = await db.query(
        `select has_schema_privilege('anon', 'academy', 'usage') as anon_usage,
                has_schema_privilege('authenticated', 'academy', 'usage') as auth_usage`,
      )
      return { tablePrivs: t.rows, schemaUsage: s.rows[0] }
    })
    expect(tablePrivs).toEqual([])
    expect(schemaUsage.anon_usage).toBe(false)
    expect(schemaUsage.auth_usage).toBe(false)
  })

  it('consent_text_version นอกลิสต์ → insert ต้อง fail ด้วย CHECK violation (23514)', async () => {
    const error = await withDb(async (db) => {
      try {
        await db.query(
          `insert into academy.leads (email, consent_at, consent_text_version)
           values ($1, now(), 'v999')`,
          [`check-negative-${process.pid}@example.com`],
        )
        return null
      } catch (err) {
        return err as { code?: string }
      }
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('email ที่ไม่ normalized (มี uppercase/ช่องว่าง) → insert ต้อง fail ด้วย CHECK (23514)', async () => {
    const error = await withDb(async (db) => {
      try {
        await db.query(
          `insert into academy.leads (email, consent_at, consent_text_version)
           values ('  Mixed.Case@Example.COM ', now(), 'v1')`,
        )
        return null
      } catch (err) {
        return err as { code?: string }
      }
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })
})

describe('PostgREST access model — schema academy', () => {
  const restHeaders = (key: string) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Profile': 'academy',
    'Content-Profile': 'academy',
  })

  it('anon REST อ่าน leads → ถูกปฏิเสธ', async () => {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('TEST_SUPABASE_ANON_KEY')
    const res = await fetch(`${url}/rest/v1/leads?select=email`, {
      headers: restHeaders(anonKey),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json().catch(() => null)
    expect(Array.isArray(body)).toBe(false)
  })

  it('anon REST เขียน leads → ถูกปฏิเสธ และ row ต้องไม่เกิด', async () => {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('TEST_SUPABASE_ANON_KEY')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const probeEmail = `anon-write-probe-${Date.now()}@example.com`

    const res = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: { ...restHeaders(anonKey), 'content-type': 'application/json' },
      body: JSON.stringify({ email: probeEmail, consent_at: new Date().toISOString(), consent_text_version: 'v1' }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)

    const check = await fetch(`${url}/rest/v1/leads?select=email&email=eq.${probeEmail}`, {
      headers: restHeaders(serviceKey),
    })
    expect(check.status).toBe(200)
    expect(await check.json()).toEqual([])
  })

  it('service-role insert สำเร็จ (positive path — พิสูจน์ว่า negative ข้างบนไม่ใช่ระบบพังเฉยๆ)', async () => {
    const url = requiredEnv('SUPABASE_URL')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const email = `service-positive-${Date.now()}@example.com`

    const res = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: { ...restHeaders(serviceKey), 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ email, consent_at: new Date().toISOString(), consent_text_version: 'v1' }),
    })
    expect(res.status).toBe(201)
    const rows = (await res.json()) as Array<{ email: string }>
    expect(rows[0]?.email).toBe(email)

    // cleanup — กันข้อมูล probe สะสมใน local DB
    await fetch(`${url}/rest/v1/leads?email=eq.${email}`, {
      method: 'DELETE',
      headers: restHeaders(serviceKey),
    })
  })
})
