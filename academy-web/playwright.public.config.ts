import { defineConfig, devices } from '@playwright/test'

// ชุด browser regression ที่ตั้งใจไม่พึ่ง Identity, Supabase หรือ DB. ใช้ port ใน
// test zone ตาม registry เพื่อพิสูจน์ public surface ด้วย server build จริง.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['course-experience.spec.ts', 'public-a11y.spec.ts'],
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:61001',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'public-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'public-mobile',
      // ผู้ก่อตั้งตัดสิน 2026-08-16: mobile profile ทางการของ three-product pilot คือ Pixel 7
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 61001',
    url: 'http://127.0.0.1:61001',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // ปิด legacy fixture ใน process ของ test server แม้เครื่องมี .env.local.
      ACADEMY_LEGACY_DIRECT_OTP_LOCAL_FIXTURE: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    },
  },
})
