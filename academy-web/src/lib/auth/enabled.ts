import { legacyDirectOtpFixtureAllowedForHost } from './legacy-direct-otp'
import { identityControlLocalFixtureAllowedForHost } from '@/lib/identity/local-fixture'
import { projectAcademyIdentityProductionRuntimeConfig } from '@/lib/identity/production-runtime'

// ระบบบัญชีเปิดใช้งานได้จริงหรือยัง
//
// ตัวชี้วัดคือ "ตั้งค่าครบไหม" ไม่ใช่ flag แยกต่างหาก — flag ที่ต้องตั้งเองมักถูกลืม
// แล้วหน้าเข้าสู่ระบบจะโชว์ฟอร์มที่กดแล้ว error ซึ่งแย่กว่าบอกตรงๆ ว่ายังไม่เปิด
//
// ⚠️ กับดักที่โดนมาแล้วจริง (2026-08-01): NEXT_PUBLIC_* ถูก **ฝังตอน build**
// ไม่ใช่อ่านตอนรัน และ `.env.local` มีสิทธิ์เหนือทุกไฟล์ env เสมอ → build บนเครื่อง
// dev แล้ว deploy ขึ้น production จะได้ค่าของ local ติดไปด้วย ผลคือหน้า production
// โชว์ฟอร์มที่กดแล้วพังทุกครั้ง ทั้งที่โค้ดตั้งใจให้ขึ้นว่า "ยังไม่เปิด"
// ทางแก้: build ผ่าน `npm run build:cf` ซึ่ง set ค่าว่างที่ shell (สิทธิ์สูงสุด)
// อย่า build ด้วย opennextjs-cloudflare ตรงๆ เวลาจะ deploy
export function accountsEnabled(requestHost: string): boolean {
  // Account Center ไม่พร้อมใช้งานจริงจนกว่า Identity Control จะ release. เส้นทาง
  // Supabase เดิมมีไว้ให้ local E2E fixture เท่านั้นและต้องเปิดแบบ explicit.
  return identityControlLocalFixtureAllowedForHost(requestHost)
    || legacyDirectOtpFixtureAllowedForHost(requestHost)
    || productionIdentityControlAvailable()
}

export function productionIdentityControlAvailable(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.IDENTITY_ADAPTER?.trim() === 'identity-control'
    && projectAcademyIdentityProductionRuntimeConfig(environment) !== null
}
