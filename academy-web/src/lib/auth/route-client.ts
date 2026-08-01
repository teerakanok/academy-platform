import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// client สำหรับ route handler — ต้องเขียน cookie ได้จริง (ต่างจากฝั่ง Server Component
// ที่เขียนไม่ได้ จึงต้องให้ middleware เป็นคนต่ออายุ session)
export async function routeAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('ตัวแปร Supabase ฝั่ง public ยังไม่ถูกตั้งค่า (ดู .env.example)')
  const store = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) store.set(name, value, options)
      },
    },
  })
}

/**
 * ปลายทางหลังล็อกอิน — รับเฉพาะ path ภายในเว็บเรา
 *
 * ถ้าไม่ตรวจ ใครก็ส่ง ?next=https://evil.example มาได้ แล้วหน้าล็อกอินของเราจะกลาย
 * เป็นเครื่องมือพาเหยื่อไปเว็บปลอมที่ดูน่าเชื่อเพราะลิงก์ออกมาจากโดเมนเรา
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/')) return '/dashboard'
  // `//host` และ `/\host` ถูกเบราว์เซอร์ตีความเป็น URL ข้ามโดเมน
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard'
  return raw
}
