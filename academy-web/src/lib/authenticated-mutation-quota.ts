import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  edgeRateLimitAuthenticatedObjectName,
  type EdgeRateLimitOperation,
} from './edge-rate-limit-policy'

export type AuthenticatedMutationOperation = Extract<
  EdgeRateLimitOperation,
  'learner-progress' | 'learner-reset' | 'learner-simulation'
>

export interface AuthenticatedMutationQuota {
  accountLimit: number
  courseLimit: number
  windowMs: number
}

export const AUTHENTICATED_MUTATION_QUOTAS: Record<AuthenticatedMutationOperation, AuthenticatedMutationQuota> = {
  'learner-progress': { accountLimit: 120, courseLimit: 60, windowMs: 60_000 },
  'learner-reset': { accountLimit: 6, courseLimit: 3, windowMs: 3_600_000 },
  'learner-simulation': { accountLimit: 60, courseLimit: 30, windowMs: 60_000 },
}

interface EdgeRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

interface EdgeRateLimiterObject {
  check(rule: {
    operation: EdgeRateLimitOperation
    limit: number
    windowMs: number
  }): Promise<EdgeRateLimitDecision>
}

export interface AuthenticatedMutationQuotaEnvironment {
  EDGE_RATE_LIMITER?: {
    getByName(objectName: string): EdgeRateLimiterObject
  }
  RATE_LIMIT_KEY_SECRET?: string
}

export type AuthenticatedMutationQuotaResult =
  | { allowed: true }
  | { allowed: false, status: 429, retryAfterSeconds: number }
  | { allowed: false, status: 503 }

export async function checkAuthenticatedMutationQuota({
  operation,
  accountId,
  courseSlug,
  environment,
}: {
  operation: AuthenticatedMutationOperation
  accountId: string
  courseSlug: string
  environment?: AuthenticatedMutationQuotaEnvironment
}): Promise<AuthenticatedMutationQuotaResult> {
  const normalizedAccountId = accountId.trim()
  const normalizedCourseSlug = courseSlug.trim().toLowerCase()
  if (
    !normalizedAccountId
    || normalizedAccountId.length > 128
    || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(normalizedCourseSlug)
  ) return { allowed: false, status: 503 }

  try {
    const workerEnvironment = environment
      ?? (await getCloudflareContext({ async: true })).env as AuthenticatedMutationQuotaEnvironment
    const { EDGE_RATE_LIMITER, RATE_LIMIT_KEY_SECRET } = workerEnvironment
    if (!EDGE_RATE_LIMITER || !RATE_LIMIT_KEY_SECRET) return { allowed: false, status: 503 }

    const quota = AUTHENTICATED_MUTATION_QUOTAS[operation]
    const accountName = await edgeRateLimitAuthenticatedObjectName({
      operation,
      scope: 'account',
      identity: normalizedAccountId,
      secret: RATE_LIMIT_KEY_SECRET,
    })
    const accountCourseName = await edgeRateLimitAuthenticatedObjectName({
      operation,
      scope: 'account-course',
      identity: `${normalizedAccountId}:${normalizedCourseSlug}`,
      secret: RATE_LIMIT_KEY_SECRET,
    })
    if (!accountName || !accountCourseName) return { allowed: false, status: 503 }

    const decisions = await Promise.all([
      EDGE_RATE_LIMITER.getByName(accountName).check({
        operation,
        limit: quota.accountLimit,
        windowMs: quota.windowMs,
      }),
      EDGE_RATE_LIMITER.getByName(accountCourseName).check({
        operation,
        limit: quota.courseLimit,
        windowMs: quota.windowMs,
      }),
    ])
    const denied = decisions.filter((decision) => !decision.allowed)
    if (denied.length > 0) {
      return {
        allowed: false,
        status: 429,
        retryAfterSeconds: Math.max(1, ...denied.map((decision) => decision.retryAfterSeconds)),
      }
    }
    return { allowed: true }
  } catch {
    return { allowed: false, status: 503 }
  }
}
