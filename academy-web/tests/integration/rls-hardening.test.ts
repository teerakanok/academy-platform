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

  it('consent_events เปิด RLS, default deny และ RPC ไม่เปิดให้ anon/authenticated', async () => {
    const result = await withDb(async (db) => {
      const table = await db.query(
        `select c.relrowsecurity
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = 'consent_events'`,
      )
      const policies = await db.query(
        `select count(*)::int as n from pg_policies
          where schemaname = 'academy' and tablename = 'consent_events'`,
      )
      const grants = await db.query(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'academy' and table_name = 'consent_events'
            and grantee in ('anon', 'authenticated')`,
      )
      const serviceGrants = await db.query(
        `select privilege_type from information_schema.role_table_grants
          where table_schema = 'academy' and table_name = 'consent_events'
            and grantee = 'service_role' order by privilege_type`,
      )
      const execute = await db.query(
        `select has_function_privilege('anon', 'academy.record_lead_consent(text,timestamptz,text,text,text,text,text)', 'execute') as anon,
                has_function_privilege('authenticated', 'academy.record_lead_consent(text,timestamptz,text,text,text,text,text)', 'execute') as authenticated`,
      )
      return {
        table: table.rows,
        policies: policies.rows[0].n,
        grants: grants.rows,
        serviceGrants: serviceGrants.rows.map((row) => row.privilege_type),
        execute: execute.rows[0],
      }
    })
    expect(result.table).toEqual([{ relrowsecurity: true }])
    expect(result.policies).toBe(0)
    expect(result.grants).toEqual([])
    expect(result.serviceGrants).toEqual(['INSERT', 'SELECT'])
    expect(result.execute).toEqual({ anon: false, authenticated: false })
  })

  it('record_lead_consent เก็บ v2 เพิ่มให้ lead v1 โดยไม่ทับหลักฐานเดิมและไม่ซ้ำเมื่อ retry', async () => {
    const email = `consent-history-${Date.now()}@example.com`
    const versions = await withDb(async (db) => {
      try {
        const lead = await db.query(
          `insert into academy.leads (email, consent_at, consent_text_version)
           values ($1, now() - interval '1 day', 'v1') returning id`,
          [email],
        )
        await db.query(
          `insert into academy.consent_events (lead_id, consent_at, consent_text_version)
           values ($1, now() - interval '1 day', 'v1') on conflict do nothing`,
          [lead.rows[0].id],
        )
        for (let i = 0; i < 2; i += 1) {
          await db.query(
            `select academy.record_lead_consent($1, now(), 'v2', null, null, null, null)`,
            [email],
          )
        }
        const result = await db.query(
          `select e.consent_text_version
             from academy.consent_events e join academy.leads l on l.id = e.lead_id
            where l.email = $1 order by e.consent_text_version`,
          [email],
        )
        return result.rows.map((row) => row.consent_text_version)
      } finally {
        await db.query(`delete from academy.leads where email = $1`, [email])
      }
    })
    expect(versions).toEqual(['v1', 'v2'])
  })

  it('unsubscribe หยุด marketing ทันที, retry ไม่เพิ่ม event และ re-consent เปิดใหม่ด้วย token ใหม่', async () => {
    const email = `unsubscribe-${Date.now()}@example.com`
    const result = await withDb(async (db) => {
      try {
        await db.query(`select academy.record_lead_consent($1, now(), 'v3', null, null, null, null)`, [email])
        const before = await db.query(
          `select id, unsubscribe_token, marketing_consent_expires_at
             from academy.leads where email = $1`,
          [email],
        )
        const lead = before.rows[0]
        const activeBefore = await db.query(`select email from academy.active_marketing_leads where id = $1`, [lead.id])
        const first = await db.query(`select academy.withdraw_marketing_consent($1, now()) as changed`, [
          lead.unsubscribe_token,
        ])
        const retry = await db.query(`select academy.withdraw_marketing_consent($1, now()) as changed`, [
          lead.unsubscribe_token,
        ])
        const activeAfter = await db.query(`select email from academy.active_marketing_leads where id = $1`, [lead.id])
        const withdrawn = await db.query(
          `select unsubscribe_token, marketing_withdrawn_at from academy.leads where id = $1`,
          [lead.id],
        )
        const eventsAfterWithdraw = await db.query(
          `select event_type from academy.consent_events where lead_id = $1 order by created_at, id`,
          [lead.id],
        )

        await db.query(`select academy.record_lead_consent($1, now(), 'v3', null, null, null, null)`, [email])
        const reopened = await db.query(
          `select unsubscribe_token, marketing_withdrawn_at from academy.leads where id = $1`,
          [lead.id],
        )
        const eventsAfterRegrant = await db.query(
          `select event_type from academy.consent_events where lead_id = $1 order by created_at, id`,
          [lead.id],
        )
        return {
          activeBefore: activeBefore.rows,
          activeAfter: activeAfter.rows,
          first: first.rows[0].changed,
          retry: retry.rows[0].changed,
          oldToken: lead.unsubscribe_token,
          withdrawn: withdrawn.rows[0],
          reopened: reopened.rows[0],
          afterWithdraw: eventsAfterWithdraw.rows.map((row) => row.event_type),
          afterRegrant: eventsAfterRegrant.rows.map((row) => row.event_type),
          expiresAt: lead.marketing_consent_expires_at,
        }
      } finally {
        await db.query(`delete from academy.leads where email = $1`, [email])
      }
    })

    expect(result.activeBefore).toEqual([{ email }])
    expect(result.first).toBe(true)
    expect(result.retry).toBe(false)
    expect(result.activeAfter).toEqual([])
    expect(result.withdrawn.marketing_withdrawn_at).not.toBeNull()
    expect(result.withdrawn.unsubscribe_token).not.toBe(result.oldToken)
    expect(result.afterWithdraw).toEqual(['granted', 'withdrawn'])
    expect(result.reopened.marketing_withdrawn_at).toBeNull()
    expect(result.reopened.unsubscribe_token).not.toBe(result.withdrawn.unsubscribe_token)
    expect(result.afterRegrant).toEqual(['granted', 'withdrawn', 'granted'])
    expect(new Date(result.expiresAt).getUTCFullYear()).toBe(new Date().getUTCFullYear() + 3)
  })

  it('purge waitlist ใช้ค่า default 3 ปีนับจาก consent หรือ withdrawal ล่าสุด', async () => {
    const oldEmail = `lead-old-${Date.now()}@example.com`
    const recentEmail = `lead-recent-${Date.now()}@example.com`
    const deleted = await withDb(async (db) => {
      try {
        await db.query(`select academy.record_lead_consent($1, now(), 'v3', null, null, null, null)`, [oldEmail])
        await db.query(`select academy.record_lead_consent($1, now(), 'v3', null, null, null, null)`, [recentEmail])
        await db.query(
          `update academy.leads
              set consent_at = now() - interval '4 years',
                  marketing_consent_expires_at = now() - interval '1 year'
            where email = $1`,
          [oldEmail],
        )
        const purge = await db.query(`select academy.purge_expired_leads() as deleted`)
        const remain = await db.query(`select email from academy.leads where email = any($1::text[]) order by email`, [
          [oldEmail, recentEmail],
        ])
        return { count: purge.rows[0].deleted, remain: remain.rows.map((row) => row.email) }
      } finally {
        await db.query(`delete from academy.leads where email = any($1::text[])`, [[oldEmail, recentEmail]])
      }
    })
    expect(deleted.count).toBeGreaterThanOrEqual(1)
    expect(deleted.remain).toEqual([recentEmail])
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

describe('privacy request evidence', () => {
  it('default deny และลบเฉพาะเคสที่ปิดเกิน 3 ปี', async () => {
    const marker = Date.now()
    const result = await withDb(async (db) => {
      await db.query(
        `insert into academy.privacy_request
          (case_reference, subject_email, request_type, status, received_at, completed_at)
         values
          ($1, $3, 'access', 'completed', now() - interval '4 years 1 day', now() - interval '4 years'),
          ($2, $4, 'deletion', 'open', now() - interval '4 years', null)`,
        [`PRIV-OLD-${marker}`, `PRIV-OPEN-${marker}`, `privacy-old-${marker}@example.com`, `privacy-open-${marker}@example.com`],
      )
      await db.query('begin')
      await db.query('set local role service_role')
      const purge = await db.query(`select academy.purge_expired_privacy_requests() as deleted`)
      await db.query('commit')
      const rows = await db.query(
        `select case_reference from academy.privacy_request where case_reference = any($1::text[])`,
        [[`PRIV-OLD-${marker}`, `PRIV-OPEN-${marker}`]],
      )
      const rls = await db.query(
        `select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'academy' and c.relname = 'privacy_request'`,
      )
      const anonExecute = await db.query(
        `select has_function_privilege('anon', 'academy.purge_expired_privacy_requests(integer, integer)', 'execute') as allowed`,
      )
      await db.query(`delete from academy.privacy_request where case_reference = $1`, [`PRIV-OPEN-${marker}`])
      return {
        deleted: Number(purge.rows[0].deleted),
        remain: rows.rows,
        rls: rls.rows[0].relrowsecurity,
        anonExecute: anonExecute.rows[0].allowed,
      }
    })
    expect(result.deleted).toBeGreaterThanOrEqual(1)
    expect(result.remain).toEqual([{ case_reference: `PRIV-OPEN-${marker}` }])
    expect(result.rls).toBe(true)
    expect(result.anonExecute).toBe(false)
  })
})
