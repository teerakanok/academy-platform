import openNextHandler from './.open-next/worker.js'
import { withEdgeSecurityHeaders } from './src/lib/edge-security-headers'
import { servePrivateMedia, type MediaWorkerEnv } from './src/lib/media/worker-delivery'
import { EdgeRateLimiter } from './worker/edge-rate-limiter-do'
import { isServedHost, unservedHostResponse, type HostPolicyEnv } from './src/lib/edge-host-policy'
import { enforceEdgeRateLimit } from './src/lib/edge-rate-limit-enforcement'
import { runAcademyIdentityLifecyclePull } from './src/lib/identity/lifecycle-production-runtime'

export { EdgeRateLimiter }

// Worker entry ของหน้าร้าน Academy. งาน retention อยู่ใน Worker แยกเพื่อให้
// capability ลบข้อมูลไม่อยู่ร่วมกับ request handler ที่รับ traffic จากผู้เรียน.
// ส่งต่อ export ของ OpenNext ให้ครบ ไม่เช่นนั้น Durable Object/cache ที่มันประกาศจะหาย.
export * from './.open-next/worker.js'

interface AcademyWorkerEnv extends MediaWorkerEnv, HostPolicyEnv {
  EDGE_RATE_LIMITER?: DurableObjectNamespace<EdgeRateLimiter>
  RATE_LIMIT_KEY_SECRET?: string
  IDENTITY_LIFECYCLE_ENABLED?: string
  IDENTITY_LIFECYCLE_PUBLISHER_ENDPOINT?: string
  IDENTITY_LIFECYCLE_CLIENT_ASSERTION_AUDIENCE?: string
  IDENTITY_LIFECYCLE_EVENT_AUDIENCE?: string
  IDENTITY_LIFECYCLE_CLIENT_ASSERTION_KEY_ID?: string
  IDENTITY_LIFECYCLE_CLIENT_ASSERTION_PRIVATE_JWK?: string
  IDENTITY_LIFECYCLE_VERIFICATION_KEY_SET_DOCUMENT?: string
  IDENTITY_LIFECYCLE_REQUEST_LIMIT?: string
  IDENTITY_LIFECYCLE_LEASE_DURATION_MS?: string
  IDENTITY_LIFECYCLE_TIMEOUT_MS?: string
  IDENTITY_LIFECYCLE_WORKER_ID?: string
  ACADEMY_DATA_API_URL?: string
  ACADEMY_DATA_API_JWT_SECRET?: string
}

/** Thai JSON bodies render as mojibake when a browser navigates to them without a declared charset. */
function withJsonCharset(response: Response): Response {
  const contentType = response.headers.get('content-type')
  if (!contentType || !/^application\/json\s*$/i.test(contentType)) return response
  const fixed = new Response(response.body, response)
  fixed.headers.set('content-type', 'application/json; charset=utf-8')
  return fixed
}

export default {
  async fetch(request, env, ctx) {
    // The raw workers.dev route bypasses the Access policy on the canonical host.
    if (!isServedHost(request, env)) return unservedHostResponse()

    const protectedRequest = await enforceEdgeRateLimit(request, env)
    if (protectedRequest instanceof Response) return protectedRequest

    const media = await servePrivateMedia(protectedRequest, env)
    if (media) return withEdgeSecurityHeaders(withJsonCharset(media))
    return withJsonCharset(await openNextHandler.fetch(protectedRequest, env, ctx))
  },
  async scheduled(_controller, env) {
    await runAcademyIdentityLifecyclePull(env as unknown as Record<string, string | undefined>)
  },
} satisfies ExportedHandler<AcademyWorkerEnv>
