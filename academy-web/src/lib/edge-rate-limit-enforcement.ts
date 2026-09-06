import {
  edgeClientAddress,
  edgeRateLimitAdmission,
  edgeRateLimitGlobalObjectName,
  edgeRateLimitObjectName,
  edgeRateLimitTargetObjectName,
  withEdgeRateLimitMarker,
  type EdgeRateLimitRule,
} from './edge-rate-limit-policy'
import { readBoundedJson } from './http/bounded-body'

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
  const admission = edgeRateLimitAdmission(request)
  if (admission.kind === 'invalid') return invalidRouteResponse()
  if (admission.kind === 'public') return request
  const { rule } = admission

  const clientAddress = edgeClientAddress(request)
  if (!clientAddress || !env.EDGE_RATE_LIMITER || !env.RATE_LIMIT_KEY_SECRET) {
    return unavailableResponse()
  }

  try {
    const actorName = await edgeRateLimitObjectName({
      operation: rule.operation,
      clientAddress,
      secret: env.RATE_LIMIT_KEY_SECRET,
    })
    if (!actorName) return unavailableResponse()

    const checks: Array<{ limit: number, name: string }> = [{
      limit: rule.limit,
      name: actorName,
    }]

    if (rule.targetField) {
      const target = await inspectTarget(request, rule)
      const targetName = target && await edgeRateLimitTargetObjectName({
        operation: rule.operation,
        target,
        secret: env.RATE_LIMIT_KEY_SECRET,
      })
      if (targetName) {
        checks.push({
          limit: rule.targetLimit ?? rule.limit,
          name: targetName,
        })
      }
    }

    checks.push({
      limit: rule.globalLimit ?? rule.limit,
      name: await edgeRateLimitGlobalObjectName({
        operation: rule.operation,
        secret: env.RATE_LIMIT_KEY_SECRET,
      }),
    })

    for (const boundedCheck of checks) {
      const scopedRule: EdgeRateLimitRule = { ...rule, limit: boundedCheck.limit }
      const decision = await env.EDGE_RATE_LIMITER
        .getByName(boundedCheck.name)
        .check(scopedRule)
      if (!decision.allowed) return limitedResponse(decision.retryAfterSeconds)
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

function limitedResponse(retryAfterSeconds: number): Response {
  return new Response('ส่งคำขอถี่เกินไป โปรดลองใหม่ในอีกสักครู่', {
    status: 429,
    headers: {
      'cache-control': 'no-store',
      'retry-after': String(retryAfterSeconds),
    },
  })
}

function invalidRouteResponse(): Response {
  return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
}

async function inspectTarget(request: Request, rule: EdgeRateLimitRule): Promise<string | null> {
  if (!rule.targetField) return null
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return null

  try {
    const parsed = await readBoundedJson(
      request.clone() as unknown as Parameters<typeof readBoundedJson>[0],
      16_384,
    )
    if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) return null
    const value = (parsed.value as Record<string, unknown>)[rule.targetField]
    if (typeof value !== 'string') return null
    const target = value.trim()
    if (!target || target.length > 320) return null
    return target
  } catch {
    return null
  }
}
