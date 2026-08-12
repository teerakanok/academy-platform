import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { internalSurfacesEnabled, isInternalSurface } from '@/lib/internal-surface'
import { authCookieOptions, isSecureRequest } from '@/lib/auth/cookie-policy'
import { legacyDirectOtpFixtureAllowedForRequest } from '@/lib/auth/legacy-direct-otp'
import {
  hasSyntacticallyValidLocalAcademySession,
  identityControlLocalFixtureAllowedForRequest,
} from '@/lib/identity/local-fixture'

// ประตูเดียวของทั้งเว็บ — ตัดสินว่าเส้นทางไหนเปิด เส้นทางไหนต้องมีบัญชี
//
// มติ founder 2026-08-01: **ต้องสมัครถ้าจะใช้** (ค่า infra ต่อหัวไม่ใช่ศูนย์ โดยเฉพาะ
// lab ที่เป็น compute จริง + การสมัครเป็น filter ของความตั้งใจ)
// แต่ "หน้าร้าน" ยังเปิดสาธารณะ เพราะเป็นสิ่งที่ทำให้คนอยากสมัคร ไม่ใช่สิ่งที่คนมาใช้
// และเป็นสิ่งเดียวที่ search engine กับการแชร์ลิงก์เข้าถึงได้ ซึ่งเป็นช่องทางหลัก
//
// รายการนี้เป็น **allowlist ของสิ่งที่เปิด** ไม่ใช่ denylist ของสิ่งที่ปิด —
// เพราะหน้าใหม่ที่ลืมใส่ต้องถูกปิดไว้ก่อน ไม่ใช่หลุดออกไปโดยไม่มีใครรู้

const PUBLIC_EXACT = new Set([
  '/',
  '/courses',
  '/privacy',
  '/unsubscribe',
  '/sign-in',
  '/sign-in/sent',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
])

// หน้าแนะนำคอร์ส (`/courses/<slug>`) เปิด — แต่บทเรียนข้างใน (`/courses/<slug>/lessons/...`) ปิด
const COURSE_OVERVIEW = /^\/courses\/[^/]+$/
const COURSE_LOCALIZED_OVERVIEW = /^\/courses\/[^/]+\/(?:en|th)$/
const COURSE_THREE_SEGMENT = /^\/courses\/[^/]+\/[^/]+$/
const COURSE_LEARNER_OVERVIEW = /^\/courses\/[^/]+\/learn$/
const COURSE_OG_IMAGE = /^\/courses\/[^/]+\/opengraph-image$/
// ปล่อยให้ static route ตอบ 404 กับ locale ที่ไม่ได้ enumerate; ถ้าปิดตรงนี้ก่อน
// middleware จะพาคนดูภาพแชร์ที่พิมพ์ locale ผิดไปหน้า sign-in แทน.
const COURSE_SHARE_IMAGE = /^\/courses\/[^/]+\/share\/[^/]+$/

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (COURSE_OVERVIEW.test(pathname)) return true
  if (COURSE_LOCALIZED_OVERVIEW.test(pathname)) return true
  if (COURSE_OG_IMAGE.test(pathname)) return true
  if (COURSE_SHARE_IMAGE.test(pathname)) return true
  // เส้นทางของระบบ auth เอง ต้องเข้าได้ตอนยังไม่ล็อกอิน ไม่งั้นล็อกอินไม่ได้เลย
  // (เจอตอนเทส: ลืมข้อนี้แล้ว /api/auth/otp ถูกเด้งไปหน้า sign-in = ล็อกอินไม่ได้เลย)
  if (pathname.startsWith('/auth/') || pathname.startsWith('/api/auth/')) return true
  // ฟอร์ม waitlist อยู่บนหน้าร้านซึ่งเปิดสาธารณะ — ถ้าปิดตรงนี้ ฟอร์มจะพังเงียบๆ
  // สำหรับคนที่ยังไม่มีบัญชี ซึ่งคือคนทั้งหมดที่ฟอร์มนี้มีไว้รับ
  if (pathname === '/api/leads') return true
  if (pathname === '/api/leads/unsubscribe') return true
  // Brand assets are public. Lesson MP4/VTT/PDF use path-scoped delivery cookies
  // and must never be added to this allowlist or public ASSETS.
  if (pathname.startsWith('/brand/')) return true
  return false
}

export async function middleware(request: NextRequest) {
  // พื้นผิวภายในถูกปิดก่อนทุกอย่าง — ก่อนแม้แต่จะดูว่าใครล็อกอินอยู่
  //
  // ต้องอยู่ก่อนชั้น auth เพราะปัญหาที่แก้คือ "ผู้เรียนที่ล็อกอินแล้วก็เข้าไม่ได้"
  // ไม่ใช่แค่ผู้ไม่ล็อกอิน · ตอบ 404 ไม่ใช่ 403 เพื่อไม่ประกาศว่ามีอะไรอยู่ตรงนี้
  if (isInternalSurface(request.nextUrl.pathname) && !internalSurfacesEnabled()) {
    return new NextResponse(null, { status: 404 })
  }

  // locale ของ overview สาธารณะเป็น enum ที่แคบ. รูปสาม segment อื่นต้องตายที่
  // middleware เพื่อไม่ถูกพาไป sign-in และไม่ขยาย allowlist ไปชน lesson.
  const requestPath = request.nextUrl.pathname
  if (
    COURSE_THREE_SEGMENT.test(requestPath) &&
    !COURSE_LOCALIZED_OVERVIEW.test(requestPath) &&
    !COURSE_OG_IMAGE.test(requestPath) &&
    !COURSE_LEARNER_OVERVIEW.test(requestPath)
  ) {
    return new NextResponse(null, { status: 404 })
  }

  // ต่ออายุ session ทุก request — ถ้าไม่ทำ cookie จะหมดอายุกลางคันแล้วผู้เรียน
  // ถูกเด้งออกระหว่างทำ quiz ซึ่งเสียงานที่ยังไม่ได้บันทึก
  let response = NextResponse.next({ request })

  const allowIdentityFixture = identityControlLocalFixtureAllowedForRequest(request)
  if (allowIdentityFixture) {
    const { pathname, search } = request.nextUrl
    const hasLocalSession = hasSyntacticallyValidLocalAcademySession(request.headers.get('cookie'))
    if (!hasLocalSession && !isPublic(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
      }
      const signIn = new URL('/sign-in', request.url)
      signIn.searchParams.set('next', pathname + search)
      return NextResponse.redirect(signIn)
    }
    // A syntactically valid cookie is only a coarse middleware prefilter. The
    // Node routes own durable session validation, so sign-in must stay reachable
    // when the file-backed session expired, was revoked, or cannot be read.
    return response
  }

  const allowLegacyFixture = legacyDirectOtpFixtureAllowedForRequest(request)
  const url = allowLegacyFixture ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined
  const anonKey = allowLegacyFixture ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined
  if (!url || !anonKey) {
    // ตั้ง env ไม่ครบ = ตัดสินสิทธิ์ไม่ได้ → ปิดไว้ก่อน ไม่ใช่ปล่อยผ่าน
    return isPublic(request.nextUrl.pathname)
      ? response
      : NextResponse.redirect(new URL('/sign-in', request.url))
  }

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions(isSecureRequest(request)),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    // API ต้องตอบ 401 เป็น JSON ไม่ใช่ redirect — ถ้า redirect fetch() จะตามไปได้
    // HTML ของหน้า sign-in กลับมา แล้ว JSON.parse พังด้วย error ที่อ่านไม่รู้เรื่อง
    // แทนที่จะบอกตรงๆ ว่า "ยังไม่ได้เข้าสู่ระบบ"
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
    }
    const signIn = new URL('/sign-in', request.url)
    // จำที่ที่เขากำลังจะไป — ล็อกอินเสร็จต้องกลับมาที่เดิม ไม่ใช่โยนไปหน้าแรก
    signIn.searchParams.set('next', pathname + search)
    return NextResponse.redirect(signIn)
  }

  // ล็อกอินแล้วยังเปิดหน้าเข้าสู่ระบบ = เดินวนเปล่าๆ พาไปที่เรียนเลย
  if (user && (pathname === '/sign-in' || pathname === '/sign-in/sent')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  // ข้าม asset ของ Next เอง — ไม่มีอะไรให้ตัดสินสิทธิ์ และเรียก getUser() ทุกไฟล์
  // จะเพิ่ม latency ให้ทุกหน้าโดยเปล่าประโยชน์
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|mp4|pdf|ico)$).*)'],
}
