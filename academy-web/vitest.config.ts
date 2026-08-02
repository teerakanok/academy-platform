import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // เทสรันในบริบทเดียวกับฝั่งเซิร์ฟเวอร์ จึงต้องได้ไฟล์ฝั่งเซิร์ฟเวอร์ของ
      // `server-only` (empty.js) · ไฟล์ `default` ของแพ็กเกจ throw ทันทีที่ import
      // ซึ่งเป็นหน้าที่ของมันเมื่อถูกลากเข้า client bundle จริง — แต่ในเทสมันทำให้
      // ไฟล์เทสของโมดูลฝั่งเซิร์ฟเวอร์พังทั้งไฟล์
      //
      // ใช้ alias เจาะจงแทนการเปิด condition `react-server` ทั้งระบบ เพราะ condition
      // นั้นทำให้ `react` resolve ไป shared-subset ที่ React 18 ยังไม่รองรับ แล้ว
      // integration ทั้งชุดพังด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่กำลังทดสอบ
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        // เทสระดับชนิด — พิสูจน์ว่าเส้นแบ่ง "เฉลยห้ามข้ามไป client" ถูกบังคับตอน
        // compile จริง ไม่ใช่แค่ตั้งชื่อ type ไว้เฉยๆ (ดู public-lesson-types.test-d.ts)
        extends: true,
        test: {
          name: 'types',
          include: ['tests/unit/**/*.test-d.ts'],
          typecheck: {
            enabled: true,
            only: true,
            include: ['tests/unit/**/*.test-d.ts'],
          },
        },
      },
      {
        // integration ต้องมี local Supabase รันอยู่ (npx supabase start) —
        // อ่าน env จาก .env.local ผ่าน tests/integration/setup.ts
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
})
