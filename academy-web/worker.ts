import openNextHandler from './.open-next/worker.js'
import { servePrivateMedia, type MediaWorkerEnv } from './src/lib/media/worker-delivery'
import { EdgeRateLimiter } from './worker/edge-rate-limiter-do'
import { isServedHost, unservedHostResponse, type HostPolicyEnv } from './src/lib/edge-host-policy'
import { enforceEdgeRateLimit } from './src/lib/edge-rate-limit-enforcement'

export { EdgeRateLimiter }

// Worker entry ของหน้าร้าน Academy. งาน retention อยู่ใน Worker แยกเพื่อให้
// capability ลบข้อมูลไม่อยู่ร่วมกับ request handler ที่รับ traffic จากผู้เรียน.
// ส่งต่อ export ของ OpenNext ให้ครบ ไม่เช่นนั้น Durable Object/cache ที่มันประกาศจะหาย.
export * from './.open-next/worker.js'

interface AcademyWorkerEnv extends MediaWorkerEnv, HostPolicyEnv {
  EDGE_RATE_LIMITER?: DurableObjectNamespace<EdgeRateLimiter>
  RATE_LIMIT_KEY_SECRET?: string
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
    return withJsonCharset(media ?? await openNextHandler.fetch(protectedRequest, env, ctx))
  },
} satisfies ExportedHandler<AcademyWorkerEnv>
