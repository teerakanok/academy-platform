import { DurableObject } from 'cloudflare:workers'
import type { EdgeRateLimitRule } from '../src/lib/edge-rate-limit-policy'

interface CounterState {
  count: number
  resetAt: number
}

export interface EdgeRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

const COUNTER_KEY = 'counter'

// One object represents one opaque (actor, route) pair. It stores no IP or
// request payload, only the current fixed-window counter and expiry.
export class EdgeRateLimiter extends DurableObject {
  async check(rule: EdgeRateLimitRule, now: number = Date.now()): Promise<EdgeRateLimitDecision> {
    const previous = await this.ctx.storage.get<CounterState>(COUNTER_KEY)
    if (!previous || now >= previous.resetAt) {
      const resetAt = now + rule.windowMs
      await this.ctx.storage.put(COUNTER_KEY, { count: 1, resetAt })
      await this.ctx.storage.setAlarm(resetAt)
      return { allowed: true, retryAfterSeconds: 0 }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((previous.resetAt - now) / 1_000))
    if (previous.count >= rule.limit) return { allowed: false, retryAfterSeconds }

    await this.ctx.storage.put(COUNTER_KEY, { ...previous, count: previous.count + 1 })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
