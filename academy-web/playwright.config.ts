import { defineConfig, devices } from '@playwright/test'

// โหลด env สำหรับ test-side DB assertions (service role/anon keys) จาก .env.local
// — Node ≥20.12 มี loadEnvFile ในตัว ไม่ต้องพึ่ง dotenv
try {
  process.loadEnvFile('.env.local')
} catch {
  // ไม่มีไฟล์ = ปล่อยให้ spec ที่ต้องใช้ env fail พร้อมข้อความชัดเจนเอง
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // production serve (next start) — ต้อง `npm run build` ก่อน (อยู่ใน acceptance chain แล้ว)
    // reuse=false: fail-closed ถ้ามี server ค้างบน port — กัน acceptance เขียว
    // กับ build เก่า (finding review lane)
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
