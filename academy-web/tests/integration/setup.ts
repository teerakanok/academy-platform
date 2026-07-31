// Integration tests คุยกับ local Supabase จริง (npx supabase start ก่อน)
// env มาจาก .env.local — Node ≥20.12 มี loadEnvFile ในตัว
import { join } from 'node:path'

try {
  process.loadEnvFile(join(__dirname, '..', '..', '.env.local'))
} catch {
  // ปล่อยให้ test ที่ต้องใช้ env รายงาน missing เองแบบชัดเจน
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} ยังไม่ถูกตั้งค่า — รัน npx supabase start แล้วคัดค่าลง .env.local ตาม .env.example`,
    )
  }
  return value
}
