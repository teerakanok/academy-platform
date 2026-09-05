import openNextHandler from './.open-next/worker.js'
import { servePrivateMedia, type MediaWorkerEnv } from './src/lib/media/worker-delivery'
import { EdgeRateLimiter } from './worker/edge-rate-limiter-do'
import { isServedHost, unservedHostResponse, type HostPolicyEnv } from './src/lib/edge-host-policy'
import {
  edgeClientAddress,
  edgeRateLimitObjectName,
  edgeRateLimitRule,
  withEdgeRateLimitMarker,
} from './src/lib/edge-rate-limit-policy'

export { EdgeRateLimiter }

// Worker entry ของหน้าร้าน Academy. งาน retention อยู่ใน Worker แยกเพื่อให้
// capability ลบข้อมูลไม่อยู่ร่วมกับ request handler ที่รับ traffic จากผู้เรียน.
// ส่งต่อ export ของ OpenNext ให้ครบ ไม่เช่นนั้น Durable Object/cache ที่มันประกาศจะหาย.
export * from './.open-next/worker.js'

interface AcademyWorkerEnv extends MediaWorkerEnv, HostPolicyEnv {
  EDGE_RATE_LIMITER?: DurableObjectNamespace<EdgeRateLimiter>
  RATE_LIMIT_KEY_SECRET?: string
}

async function enforceEdgeRateLimit(request: Request, env: AcademyWorkerEnv): Promise<Request | Response> {
  const rule = edgeRateLimitRule(request)
  if (!rule) return request

  const clientAddress = edgeClientAddress(request)
  if (!clientAddress || !env.EDGE_RATE_LIMITER || !env.RATE_LIMIT_KEY_SECRET) {
    return new Response('ระบบยังไม่พร้อมใช้งานชั่วคราว', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
  }

  try {
    const objectName = await edgeRateLimitObjectName({
      operation: rule.operation,
      clientAddress,
      secret: env.RATE_LIMIT_KEY_SECRET,
    })
    const decision = await env.EDGE_RATE_LIMITER.getByName(objectName).check(rule)
    if (!decision.allowed) {
      return new Response('ส่งคำขอถี่เกินไป โปรดลองใหม่ในอีกสักครู่', {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(decision.retryAfterSeconds),
        },
      })
    }
  } catch {
    // Rate protection must fail closed; do not log an actor identifier or secret.
    return new Response('ระบบยังไม่พร้อมใช้งานชั่วคราว', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
  }

  return withEdgeRateLimitMarker(request, { secret: env.RATE_LIMIT_KEY_SECRET })
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
