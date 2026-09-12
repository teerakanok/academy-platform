import { MEDIA_AUTHORIZATION_PROBE_HEADER } from './authorization-probe'
import type { MediaRequest, PrivateMediaAuthorizer } from './worker-delivery'

export const MEDIA_AUTHORIZATION_TIMEOUT_MS = 5_000

type OpenNextFetch<TEnv, TCtx> = (
  request: Request,
  env: TEnv,
  ctx: TCtx,
) => Response | Promise<Response>

export function createOpenNextMediaAuthorizer<TEnv, TCtx>(
  fetchOpenNext: OpenNextFetch<TEnv, TCtx>,
  env: TEnv,
  ctx: TCtx,
  timeoutMs = MEDIA_AUTHORIZATION_TIMEOUT_MS,
): PrivateMediaAuthorizer {
  return async (request: MediaRequest) => {
    const headers = new Headers(request.headers)
    headers.set(MEDIA_AUTHORIZATION_PROBE_HEADER, '1')
    headers.delete('range')
    const probe = new Request(request.url, {
      method: 'HEAD',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('media authorization timeout')), timeoutMs)
    })
    try {
      return await Promise.race([fetchOpenNext(probe, env, ctx), timeout])
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }
}
