// Host policy for the Academy Worker — ทางเข้าของหน้าร้านมีทางเดียวคือโดเมน canonical
//
// เหตุผล: Worker ทุกตัวได้ route ดิบ `<name>.<account>.workers.dev` ฟรี และ route นั้น
// ไม่ผ่าน Cloudflare Access ที่คุมโดเมน canonical อยู่ (พบใน security review 2026-09-05:
// raw route ตอบ 200 โดยไม่ต้อง auth ขณะที่ canonical ต้อง login) การปิด `workers_dev`
// ใน config ก็ได้ แต่ policy ในโค้ดพิสูจน์ได้ด้วยเทสต์และไม่หายเงียบเมื่อ config ถูก
// เขียนทับตอน deploy (`--keep-vars` ไม่ครอบ route flags)
//
// รายชื่อโฮสต์ที่เสิร์ฟ: canonical เสมอ + loopback สำหรับ `wrangler dev`/e2e + โฮสต์ที่
// ประกาศชัดใน `ACADEMY_SERVED_HOSTS` (คั่นด้วยจุลภาค) เมื่อ operator ต้องการ probe
// ผ่าน route ดิบเป็นครั้งคราว — ตั้งชั่วคราว แล้วเอาออก

export const CANONICAL_HOST = 'academy.cyberskills.co.th'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface HostPolicyEnv {
  ACADEMY_SERVED_HOSTS?: string
}

export function servedHosts(env: HostPolicyEnv): Set<string> {
  const hosts = new Set<string>([CANONICAL_HOST, ...LOOPBACK_HOSTS])
  for (const raw of (env.ACADEMY_SERVED_HOSTS ?? '').split(',')) {
    const host = raw.trim().toLowerCase()
    if (host) hosts.add(host)
  }
  return hosts
}

/** `true` when the request's host is one this Worker serves. Compares the hostname
 *  only (no port), lower-cased, so `Localhost:3000` and `academy.cyberskills.co.th`
 *  both resolve the way a browser would. */
export function isServedHost(request: Request, env: HostPolicyEnv): boolean {
  let hostname: string
  try {
    hostname = new URL(request.url).hostname.toLowerCase()
  } catch {
    return false
  }
  return servedHosts(env).has(hostname)
}

/** The response for a host we do not serve: a plain 404 with no body that names the
 *  canonical host — a scanner learns nothing, and nothing is cached. */
export function unservedHostResponse(): Response {
  return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
}
