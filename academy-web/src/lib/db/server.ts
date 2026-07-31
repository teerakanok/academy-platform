import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client — service role เท่านั้น (env ไม่มี NEXT_PUBLIC_ prefix
// โดยเจตนา: browser ห้ามคุย DB ตรง; access model = insert ผ่าน server route เท่านั้น)
// ห้ามชี้ prod เด็ดขาด — local Supabase เท่านั้นใน phase นี้ (ดู .env.example)
export function academyDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ยังไม่ถูกตั้งค่า (ดู .env.example)')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
}
