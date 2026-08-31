import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { findOrCreateUser, type AcademyUser } from '@/lib/account/users'
import { createAcademyIdentityProductionSessionStore } from '@/lib/identity/production-runtime'
import type { IdentityDurableSessionPort } from '@/lib/identity/postgres-session-store'
import { parseAcademySessionCookie } from '@/lib/identity/session-store'
import { authCookieOptions, isSecureServerContext } from './cookie-policy'
import { legacyDirectOtpFixtureEnabled } from './legacy-direct-otp'

// Production learners use Identity Control's HttpOnly opaque Academy session.
// The GoTrue client below remains only for the explicitly gated local fixture.
//
// ⚠️ ตัวแปรเหล่านี้เป็น NEXT_PUBLIC_ โดยเจตนา ต่างจาก SUPABASE_SERVICE_ROLE_KEY:
//    anon key ออกแบบมาให้เปิดเผยได้ และ RLS ของเราคือ default deny อยู่แล้ว
//    (ตารางทั้งหมดไม่มี policy — ทางเขียนเดียวคือ service_role ฝั่ง server)

function authEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ยังไม่ถูกตั้งค่า (ดู .env.example)')
  }
  return { url, anonKey }
}

/** client ที่อ่าน/เขียน cookie ของ session — ใช้ได้เฉพาะฝั่ง server */
export async function authClient() {
  const { url, anonKey } = authEnv()
  const store = await cookies()
  const requestHeaders = await headers()
  return createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions(isSecureServerContext(requestHeaders)),
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // เรียกจาก Server Component ที่เขียน cookie ไม่ได้ — ปล่อยผ่าน
          // การต่ออายุ session เกิดใน middleware อยู่แล้ว
        }
      },
    },
  })
}

export interface SessionUser {
  account: AcademyUser
  /** อีเมลที่ issuer ยืนยัน — ใช้แสดงผล ไม่ใช่ตัวตน */
  email: string
}

type IdentityAccountResolver = typeof findOrCreateUser

export async function resolveIdentitySessionUser({
  sessionId,
  sessionStore,
  resolveAccount = findOrCreateUser,
}: {
  sessionId: string
  sessionStore: Pick<IdentityDurableSessionPort, 'get'>
  resolveAccount?: IdentityAccountResolver
}): Promise<SessionUser | null> {
  try {
    const claims = await sessionStore.get(sessionId)
    if (!claims) return null
    const account = await resolveAccount({
      issuer: claims.issuer,
      subject: claims.subject,
      email: claims.verifiedEmail,
    })
    return { account, email: claims.verifiedEmail }
  } catch {
    return null
  }
}

/**
 * ผู้ใช้ปัจจุบัน หรือ null ถ้ายังไม่ล็อกอิน
 *
 * ใช้ getUser() ไม่ใช่ getSession() โดยเจตนา — getSession อ่านจาก cookie ตรงๆ
 * โดยไม่ตรวจลายเซ็น ซึ่งเชื่อไม่ได้สำหรับการตัดสินสิทธิ์
 *
 * เงื่อนไขที่ห้ามผ่อน: **ต้องเป็นอีเมลที่ยืนยันแล้วเท่านั้น** เพราะบัญชีนี้จะถูกใช้
 * ออกใบรับรอง (และในอนาคตคือ certification) ใบรับรองที่ออกให้อีเมลที่ไม่เคยยืนยัน
 * คือใบที่อ้างถึงคนที่เราไม่รู้ว่ามีตัวตนจริงไหม
 */
export async function currentUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers()
  const sessionId = parseAcademySessionCookie(requestHeaders.get('cookie'))
  if (sessionId) {
    const sessionStore = createAcademyIdentityProductionSessionStore()
    if (!sessionStore) return null
    return resolveIdentitySessionUser({ sessionId, sessionStore })
  }

  // Direct GoTrue sessions are retained only for the explicit local fixture.
  if (!legacyDirectOtpFixtureEnabled()) return null
  const supabase = await authClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  const user = data.user
  const email = user.email
  if (!email) return null
  if (!user.email_confirmed_at && !user.confirmed_at) return null

  const account = await findOrCreateUser({
    issuer: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unknown-issuer',
    subject: user.id,
    email,
  })
  return { account, email }
}

export async function signOut(): Promise<void> {
  const supabase = await authClient()
  await supabase.auth.signOut()
}
