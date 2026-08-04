import { test as setup, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

// สร้าง session ผู้เรียนหนึ่งคนไว้ให้ spec อื่นใช้ร่วมกัน
//
// จำเป็นตั้งแต่ M3 เพราะบทเรียน/quiz/lab/dashboard ต้องมีบัญชีแล้ว (มติ founder
// 2026-08-01) — spec ที่เปิดหน้าเหล่านี้โดยไม่ล็อกอินจะถูกเด้งไปหน้า sign-in
//
// ล็อกอินผ่าน API + อ่านรหัสจากกล่องจดหมายทดสอบของ local Supabase (mailpit)
// ไม่ใช่การ mock — เส้นทางเดียวกับผู้ใช้จริงทุกขั้น

const MAILPIT = 'http://127.0.0.1:54324'
export const STORAGE_STATE = join(__dirname, '..', 'test-results', '.auth', 'learner.json')
/** อีเมลของบัญชีที่ใช้ในรอบนี้ — เทสที่ต้องอ่านของจริงจาก DB ใช้ตัวนี้หาแถวของตัวเอง */
export const LEARNER_EMAIL_FILE = join(__dirname, '..', 'test-results', '.auth', 'learner-email.txt')

setup('เตรียมบัญชีผู้เรียนสำหรับ e2e', async ({ page, baseURL }) => {
  const email = `e2e-learner-${Date.now()}@example.com`

  const res = await page.request.post('/api/auth/otp', { data: { email } })
  expect(res.ok(), 'ขอรหัสเข้าสู่ระบบไม่สำเร็จ').toBeTruthy()

  // รอให้อีเมลถึงกล่องทดสอบ แล้วดึงรหัส 6 หลักจากฉบับล่าสุด
  let token = ''
  for (let attempt = 0; attempt < 60 && !token; attempt++) {
    await new Promise((r) => setTimeout(r, 400))
    const list = await fetch(`${MAILPIT}/api/v1/messages`)
    if (!list.ok) continue
    const body = (await list.json()) as { messages?: { ID: string; To?: { Address: string }[] }[] }
    const found = body.messages?.find((m) => m.To?.some((t) => t.Address === email))
    if (!found) continue
    const detail = await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)
    if (!detail.ok) continue
    const message = (await detail.json()) as { Text?: string; HTML?: string }
    token = /\b(\d{6})\b/.exec(`${message.Text ?? ''}${message.HTML ?? ''}`)?.[1] ?? ''
  }
  expect(token, 'ไม่พบรหัส 6 หลักในอีเมลทดสอบ').toHaveLength(6)

  const verify = await page.request.post('/api/auth/verify', { data: { email, token } })
  expect(verify.ok(), 'ยืนยันรหัสไม่สำเร็จ').toBeTruthy()

  // Cookie ที่ route เขียนจริงต้องอ่านจาก JavaScript ไม่ได้ · local server เป็น HTTP
  // จึงไม่ assert Secure ตรงนี้ (policy ของ HTTPS มี unit test แยก)
  const authCookies = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-'))
  expect(authCookies.length, 'verify สำเร็จแต่ไม่มี auth cookie').toBeGreaterThan(0)
  for (const cookie of authCookies) {
    expect(cookie.httpOnly, `${cookie.name} ต้องเป็น HttpOnly`).toBe(true)
    expect(cookie.sameSite, `${cookie.name} ต้องมี SameSite`).toBe('Lax')
  }

  // currentUser สร้าง academy.users จาก verified issuer subject ก่อน แล้ว setup
  // จึง provision activation/entitlement อย่างชัดเจนเหมือน control plane จริง
  // แทนการทำให้ test ผ่านด้วยกฎ "ล็อกอินแล้วเข้าทุกคอร์ส"
  const beforeProvision = await page.request.get('/api/progress')
  expect(beforeProvision.status(), 'บัญชีใหม่ต้องยังไม่ผ่าน activation').toBe(403)
  await page.goto(`${baseURL}/dashboard`)
  await expect(page.getByTestId('dashboard-access-inactive')).toBeVisible()
  await expect(page.getByTestId('course-card-basic-os-linux')).toHaveCount(0)

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('E2E ต้องมี local Supabase env ตาม .env.example')
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
  const account = await db.from('users').select('id').eq('email', email).single()
  if (account.error || !account.data) throw new Error('ไม่พบบัญชี Academy ที่เพิ่งสร้างสำหรับ E2E')

  const activated = await db.from('service_activation').upsert({
    user_id: account.data.id,
    status: 'active',
    revision: 1,
    synced_at: new Date().toISOString(),
  })
  if (activated.error) throw new Error('provision service activation สำหรับ E2E ไม่สำเร็จ')

  const entitled = await db.from('course_entitlement').upsert(
    ['basic-os-linux', 'content-formats-demo'].map((courseSlug) => ({
      user_id: account.data.id,
      course_slug: courseSlug,
      source: 'free',
      revoked_at: null,
    })),
    { onConflict: 'user_id,course_slug' },
  )
  if (entitled.error) throw new Error('provision course entitlement สำหรับ E2E ไม่สำเร็จ')

  if (process.env.INTERNAL_SURFACES?.trim() === 'on') {
    const databaseUrl = process.env.TEST_DATABASE_URL
    if (!databaseUrl) throw new Error('internal E2E ต้องมี TEST_DATABASE_URL ของ local Supabase')
    const control = new Client({ connectionString: databaseUrl })
    await control.connect()
    try {
      await control.query('begin')
      const fixture = await control.query(
        `insert into academy.users(issuer, subject, email)
         values ('https://e2e-staff-control.invalid', 'owner', 'owner@e2e.invalid')
         on conflict (issuer, subject) do update set last_seen_at = now()
         returning id`,
      )
      const ownerId = fixture.rows[0].id
      await control.query('set local role academy_staff_admin')
      await control.query(`select academy.set_staff_role($1, $1, 'owner', true, 'E2E-STAFF-BOOTSTRAP')`, [ownerId])
      await control.query(`select academy.set_staff_role($1, $2, 'content-ops', true, 'E2E-STAFF-CONTENT')`, [ownerId, account.data.id])
      await control.query('commit')
    } catch (error) {
      await control.query('rollback').catch(() => undefined)
      throw error
    } finally {
      await control.end()
    }
  }

  // Fixture ด้านล่างนี้มีไว้ทดสอบ learner surfaces ที่อยู่หลัง control plane เท่านั้น
  // ก่อน control plane production พร้อม พื้นผิวจริงด้านบนต้องปิดอย่าง truthful เสมอ
  const lockedProgressBefore = await db
    .from('node_progress')
    .select('*')
    .eq('user_id', account.data.id)
    .eq('course_slug', 'content-formats-demo')
    .order('node_id')
  const lockedAttemptsBefore = await db
    .from('attempt')
    .select('*')
    .eq('user_id', account.data.id)
    .eq('course_slug', 'content-formats-demo')
    .order('attempt_id')
  expect(lockedProgressBefore.error).toBeNull()
  expect(lockedAttemptsBefore.error).toBeNull()
  const lockedAttempt = await page.request.post('/api/attempts', {
    data: { slug: 'content-formats-demo', nodeId: 'formats-hands-on' },
  })
  expect(lockedAttempt.status(), 'มี entitlement แต่ยังข้าม prerequisite ไป capstone ไม่ได้').toBe(403)
  await page.goto(`${baseURL}/courses/content-formats-demo/lessons/formats-hands-on`)
  await expect(page).toHaveURL(/\/access-required\?/)
  await expect(page.getByText('This lesson is not unlocked yet')).toBeVisible()
  const lockedProgressAfter = await db
    .from('node_progress')
    .select('*')
    .eq('user_id', account.data.id)
    .eq('course_slug', 'content-formats-demo')
    .order('node_id')
  const lockedAttemptsAfter = await db
    .from('attempt')
    .select('*')
    .eq('user_id', account.data.id)
    .eq('course_slug', 'content-formats-demo')
    .order('attempt_id')
  expect(lockedProgressAfter.error).toBeNull()
  expect(lockedAttemptsAfter.error).toBeNull()
  expect(lockedProgressAfter.data).toEqual(lockedProgressBefore.data)
  expect(lockedAttemptsAfter.data).toEqual(lockedAttemptsBefore.data)

  // ยืนยันว่า session ใช้ได้จริงก่อนบันทึก ไม่ใช่แค่ API ตอบ ok
  await page.goto(`${baseURL}/dashboard`)
  await expect(page.getByTestId('course-card-basic-os-linux')).toBeVisible()

  mkdirSync(join(__dirname, '..', 'test-results', '.auth'), { recursive: true })
  const state = await page.context().storageState()
  writeFileSync(STORAGE_STATE, JSON.stringify(state), 'utf8')
  writeFileSync(LEARNER_EMAIL_FILE, email, 'utf8')
})
