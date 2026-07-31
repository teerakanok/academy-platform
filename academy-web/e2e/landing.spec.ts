import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// M1 e2e — landing + lead capture บน local Supabase จริง
// Verify row เกิดจริงด้วย query ฝั่ง test (service role) — ไม่เชื่อ response อย่างเดียว

const ARTIFACT_DIR = join(__dirname, '..', '..', 'artifacts', 'oneshot-2026-07-31', 'm1')

function serviceDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('ต้องมี SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local (ดู .env.example)')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
}

test.describe('landing', () => {
  test('render brand + waitlist form + ลิงก์ privacy โดยไม่ประกาศ course ใดๆ', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'CyberSkills Academy' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'อีเมล' })).toBeVisible()
    await expect(page.getByTestId('consent-checkbox')).not.toBeChecked()
    await expect(page.getByRole('link', { name: 'อ่านนโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy')

    // ข้อความ consent ที่ผู้ใช้เห็นต้องเป็นฉบับเดียวกับไฟล์ versioned ที่ API บันทึก
    // (กัน copy แยกร่างจาก v1.md — หลักฐาน consent ผิดฉบับ)
    const consentFileText = readFileSync(
      join(__dirname, '..', 'src', 'content', 'consent', 'v1.md'),
      'utf8',
    ).trim()
    await expect(page.locator('label').filter({ has: page.getByTestId('consent-checkbox') })).toContainText(
      consentFileText.slice(0, 60),
    )

    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await page.screenshot({ path: join(ARTIFACT_DIR, 'landing-desktop-1440.png'), fullPage: true })
  })

  test('หน้า /privacy render สาระ PDPA ครบ (วัตถุประสงค์ / ระยะเก็บ / ช่องทางถอน consent)', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('นโยบายความเป็นส่วนตัว')
    await expect(page.getByText('ระยะเวลาเก็บรักษา')).toBeVisible()
    await expect(page.getByText('การถอนความยินยอม', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'contact@cyberskills.co.th' }).first()).toBeVisible()

    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await page.screenshot({ path: join(ARTIFACT_DIR, 'privacy-desktop-1440.png'), fullPage: true })
  })
})

test.describe('lead capture ผ่าน UI', () => {
  test('ติ๊ก consent + submit → success และ row เกิดจริงใน DB พร้อม consent version', async ({ page }) => {
    const email = `e2e-ui-${Date.now()}@example.com`
    await page.goto('/')
    await page.getByRole('textbox', { name: 'อีเมล' }).fill(email)
    await page.getByTestId('consent-checkbox').check()
    await page.getByRole('button', { name: 'ลงทะเบียนรอเปิดตัว' }).click()
    await expect(page.getByTestId('waitlist-success')).toBeVisible()

    const db = serviceDb()
    const { data, error } = await db.from('leads').select('email, consent_text_version, consent_at').eq('email', email)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].consent_text_version).toBe('v1')
    expect(data![0].consent_at).toBeTruthy()

    await db.from('leads').delete().eq('email', email)
  })

  test('ไม่ติ๊ก consent → ถูกปฏิเสธ ไม่มี row เกิด', async ({ page }) => {
    const email = `e2e-noconsent-${Date.now()}@example.com`
    await page.goto('/')
    await page.getByRole('textbox', { name: 'อีเมล' }).fill(email)
    await page.getByRole('button', { name: 'ลงทะเบียนรอเปิดตัว' }).click()
    await expect(page.getByTestId('waitlist-error')).toBeVisible()

    const db = serviceDb()
    const { data } = await db.from('leads').select('email').eq('email', email)
    expect(data).toEqual([])
  })
})

test.describe('lead API — security + honesty', () => {
  test('consent=false ที่ระดับ API → 400 และไม่มี row', async ({ request }) => {
    const email = `e2e-api-noconsent-${Date.now()}@example.com`
    const res = await request.post('/api/leads', {
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.50.1.1' },
      data: { email, consent: false },
    })
    expect(res.status()).toBe(400)

    const db = serviceDb()
    const { data } = await db.from('leads').select('email').eq('email', email)
    expect(data).toEqual([])
  })

  test('email ซ้ำ = idempotent: ตอบสำเร็จทั้งสองครั้ง แต่ row มีแค่ 1', async ({ request }) => {
    const email = `e2e-idem-${Date.now()}@example.com`
    const first = await request.post('/api/leads', {
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.50.2.1' },
      data: { email, consent: true },
    })
    expect(first.status()).toBe(200)
    const second = await request.post('/api/leads', {
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.50.2.2' },
      data: { email: `  ${email.toUpperCase()}  `, consent: true },
    })
    expect(second.status()).toBe(200)
    // กัน enumeration: response ของ email ใหม่และ email ซ้ำต้องแยกไม่ออก
    expect(await second.json()).toEqual(await first.json())
    expect(second.status()).toBe(first.status())

    const db = serviceDb()
    const { data } = await db.from('leads').select('email').eq('email', email)
    expect(data).toHaveLength(1)

    await db.from('leads').delete().eq('email', email)
  })

  test('content-type ไม่ใช่ JSON → 415', async ({ request }) => {
    const res = await request.post('/api/leads', {
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': '10.50.3.1' },
      data: 'email=x@example.com',
    })
    expect(res.status()).toBe(415)
  })

  test('body เกิน limit → 413', async ({ request }) => {
    const res = await request.post('/api/leads', {
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.50.4.1' },
      data: { email: 'big@example.com', consent: true, referrer: 'x'.repeat(11_000) },
    })
    expect(res.status()).toBe(413)
  })

  test('ยิงเกิน rate limit → 429', async ({ request }) => {
    const ip = '10.50.5.1'
    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      const res = await request.post('/api/leads', {
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        data: { email: `rate-${i}@example.com`, consent: false },
      })
      lastStatus = res.status()
    }
    expect(lastStatus).toBe(429)
  })
})
