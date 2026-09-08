import { checkAuthenticatedMutationQuota } from '../../src/lib/authenticated-mutation-quota'
import { EdgeRateLimiter } from '../../worker/edge-rate-limiter-do'

export { EdgeRateLimiter }

const quotaWorker = {
  async test(_controller: unknown, env: {
    EDGE_RATE_LIMITER?: DurableObjectNamespace<EdgeRateLimiter>
    RATE_LIMIT_KEY_SECRET?: string
  }) {
    const contextSymbol = Symbol.for('__cloudflare-context__')
    const globalScope = globalThis as Record<symbol, unknown>
    const previousContext = globalScope[contextSymbol]
    globalScope[contextSymbol] = { ctx: {}, cf: undefined, env }
    const options = {
      operation: 'learner-progress' as const,
      accountId: '01234567-89ab-cdef-89ab-0123456789ab',
      courseSlug: 'workerd-binding-course',
    }

    try {
      for (let attempt = 0; attempt <= 60; attempt += 1) {
        const decision = await checkAuthenticatedMutationQuota(options)
        if (attempt < 60 && !decision.allowed) throw new Error(`premature denial at ${attempt}`)
        if (attempt === 60 && (decision.allowed || decision.status !== 429)) {
          throw new Error('per-course quota did not fail closed')
        }
      }
      const isolatedAccount = await checkAuthenticatedMutationQuota({
        ...options,
        accountId: '01234567-89ab-cdef-89ab-0123456789ac',
      })
      if (!isolatedAccount.allowed) throw new Error('account isolation failed')
      const withoutBinding = await checkAuthenticatedMutationQuota({
        ...options,
        environment: {},
      })
      if (withoutBinding.allowed || withoutBinding.status !== 503) {
        throw new Error('missing binding did not fail closed')
      }
    } finally {
      globalScope[contextSymbol] = previousContext
    }
  },
}

export default quotaWorker
