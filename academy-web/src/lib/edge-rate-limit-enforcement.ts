import {
  edgeClientAddress,
  edgeRateLimitObjectName,
  edgeRateLimitRule,
  withEdgeRateLimitMarker,
  type EdgeRateLimitRule,
} from './edge-rate-limit-policy'

interface EdgeRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

interface EdgeRateLimiterObject {
  check(rule: EdgeRateLimitRule, now?: number): Promise<EdgeRateLimitDecision>
}

export interface EdgeRateLimitWorkerEnvironment {
  EDGE_RATE_LIMITER?: {
    getByName(objectName: string): EdgeRateLimiterObject
  }
  RATE_LIMIT_KEY_SECRET?: string
}

export async function enforceEdgeRateLimit(
  request: Request,
  env: EdgeRateLimitWorkerEnvironment,
): Promise<Request | Response> {
  const rule = edgeRateLimitRule(request)
  if (!rule) return request

  const clientAddress = edgeClientAddress(request)
  if (!clientAddress || !env.EDGE_RATE_LIMITER || !env.RATE_LIMIT_KEY_SECRET) {
    return unavailableResponse()
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
    return unavailableResponse()
  }

  return withEdgeRateLimitMarker(request, { secret: env.RATE_LIMIT_KEY_SECRET })
}

function unavailableResponse(): Response {
  return new Response('ระบบยังไม่พร้อมใช้งานชั่วคราว', {
    status: 503,
    headers: { 'cache-control': 'no-store' },
  })
}
