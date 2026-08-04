import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'

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
  globalTeardown: './e2e/global.teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // APIRequestContext ไม่ได้สร้าง Origin ให้เหมือน browser fetch เอง แต่ production
    // mutation boundary บังคับ origin จริง จึงระบุ origin ของ test server ตรงๆ
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3000' },
    trace: 'retain-on-failure',
  },
  projects: [
    // ตั้งแต่ M3 บทเรียน/quiz/lab/dashboard ต้องมีบัญชี — spec ทั้งหมดจึงต้องมี
    // session ก่อน ไม่งั้นจะถูกเด้งไปหน้า sign-in แล้ว assertion พังแบบงงๆ
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'test-results/.auth/learner.json',
      },
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
    env: {
      // ค่าตั้งต้นของ e2e = เหมือน production คือ **พื้นผิวภายในปิด** (`/player`)
      // อยากทดสอบพื้นผิวภายในให้รัน `INTERNAL_SURFACES=on npm run test:e2e`
      // ซึ่งจะเปิดทั้งเซิร์ฟเวอร์และปลดล็อก spec ที่ข้ามอยู่
      INTERNAL_SURFACES: process.env.INTERNAL_SURFACES ?? '',
      // โควตา attempt ของ production คือ 3 ครั้ง/30 นาที ต่อ (user, node) · ชุด e2e
      // เดินเส้นทาง capstone ซ้ำหลายสิบครั้งในไม่กี่นาที จึงตั้งเพดานสูงไว้ที่นี่
      //
      // ทางที่ **ห้าม** ใช้: ให้ผู้ใช้ล้างสมุดนับโควตาเองผ่าน endpoint (เคยทำแล้ว
      // RIL จับว่าลบ speed bump ทิ้งทั้งหมด) · พฤติกรรมของโควตาเองถูกทดสอบใน
      // tests/integration/attempt-db.test.ts ซึ่งกำหนดค่าเองอย่างชัดเจน
      ATTEMPT_MAX_PER_WINDOW: process.env.ATTEMPT_MAX_PER_WINDOW ?? '500',
      MEDIA_SIGNING_SECRET: 'playwright-only-media-signing-secret-32-bytes-minimum',
      MEDIA_LOCAL_ROOT: join(process.cwd(), 'private-media'),
    },
  },
})
