import 'server-only'

import { createPrivateKey, type KeyObject } from 'node:crypto'
import {
  createShareResponseSchema, privateProfileSchema, publicShareSchema, revokeShareResponseSchema,
  type CreateShareCommand, type SetGoalCommand,
} from '@/core-profile-ui/contracts'
import { isCanonicalIdentityLifecyclePrincipalIssuer, isWellFormedIdentityLifecycleSubject } from '@/lib/identity/lifecycle-principal'
import { cancelResponseBody, readStrictJsonResponse } from '@/lib/http/strict-json-response'
import { createCoreSignedRequest } from '../../../ops/profile-export/core-transport.mjs'

type Principal = { issuer: string; subject: string }
type Options = { environment?: Record<string, string | undefined>; privateKey?: KeyObject; fetchImpl?: typeof fetch }
const MAX_RESPONSE_BYTES = 512 * 1024

/** Server-only, disabled until a complete operator-provided Core registration exists. */
export function createCoreHostClient(options: Options = {}) {
  const env = options.environment ?? process.env
  if (env.ACADEMY_CORE_PROFILE_ENABLED !== '1') return null
  try {
    const origin = env.ACADEMY_CORE_PROFILE_ORIGIN ?? ''
    const clientId = env.ACADEMY_CORE_PROFILE_CLIENT_ID ?? ''
    const keyId = env.ACADEMY_CORE_PROFILE_KEY_ID ?? ''
    const environment = env.ACADEMY_CORE_PROFILE_ENVIRONMENT ?? ''
    const issuer = env.ACADEMY_CORE_PROFILE_ISSUER ?? ''
    if (!isCanonicalIdentityLifecyclePrincipalIssuer(issuer) || issuer.length > 255
      || !['production', 'staging', 'test'].includes(environment)) return null
    const pem = env.ACADEMY_CORE_PROFILE_PRIVATE_KEY_PEM
    const privateKey = options.privateKey ?? (pem && pem.length <= 8_192 ? createPrivateKey(pem) : null)
    if (!privateKey) return null
    const configuredSend = createCoreSignedRequest({ enabled: true, origin, clientId, keyId, privateKey,
      environment, fetchImpl: options.fetchImpl })
    if (!configuredSend) return null
    const send: NonNullable<typeof configuredSend> = configuredSend

    function checkedPrincipal(principal: Principal): Principal {
      if (principal.issuer !== issuer || !isWellFormedIdentityLifecycleSubject(principal.subject)
        || principal.subject.length > 255 || /[\s\u0000-\u001f\u007f]/.test(principal.subject)) {
        throw new Error('Core profile principal unavailable')
      }
      return { issuer, subject: principal.subject }
    }

    async function request(path: string, operation: string, body: unknown): Promise<unknown> {
      const response = await send(path, operation, JSON.stringify(body))
      if (response.status !== 200) {
        cancelResponseBody(response)
        throw new Error('Core profile unavailable')
      }
      const parsed = await readStrictJsonResponse(response, { maxBytes: MAX_RESPONSE_BYTES, maxDepth: 32 })
      if (!parsed.ok) throw new Error('Core profile response invalid')
      return parsed.value
    }

    return {
      async profile(principal: Principal) {
        return privateProfileSchema.parse(await request('/v1/self/profile', 'self.profile.read', { principal: checkedPrincipal(principal) }))
      },
      async goal(principal: Principal, command: SetGoalCommand) {
        return privateProfileSchema.parse(await request('/v1/self/goal', 'self.goal.write', { principal: checkedPrincipal(principal), command }))
      },
      async share(principal: Principal, command: CreateShareCommand) {
        const result = createShareResponseSchema.parse(await request('/v1/self/shares', 'self.share.create', { principal: checkedPrincipal(principal), command }))
        if (!/^shr_[0-9a-f]{32}$/.test(result.share.id)) throw new Error('Core share response invalid')
        return result
      },
      async revoke(principal: Principal, shareId: string, requestId: string) {
        return revokeShareResponseSchema.parse(await request('/v1/self/shares/revoke', 'self.share.revoke',
          { principal: checkedPrincipal(principal), shareId, command: { requestId } }))
      },
      async publicShare(shareId: string, secret: string) {
        const result = publicShareSchema.parse(await request('/v1/public/shares/read', 'public.share.read', { shareId, secret }))
        if (result.shareId !== shareId) throw new Error('Core share response invalid')
        return result
      },
    }
  } catch {
    return null
  }
}
