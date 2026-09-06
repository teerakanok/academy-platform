import { cancelResponseBody } from '../http/strict-json-response'
import type { IdentityLifecyclePullRequest } from './lifecycle-pull-request'
import type { IdentityLifecycleResponseTransport } from './lifecycle-pull-json-operation'

const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 5_000
const FAILURE_MESSAGE = 'Identity lifecycle response transport failed'

export const IDENTITY_LIFECYCLE_FETCH_INIT = Object.freeze({
  method: 'POST',
  headers: Object.freeze({
    accept: 'application/json',
    'content-type': 'application/json',
  }),
  cache: 'no-store',
  credentials: 'omit',
  redirect: 'manual',
} as const satisfies RequestInit)

export type IdentityLifecyclePullResponseTransportOptions = {
  endpoint: string
  timeoutMs: number
  fetchPort: {
    fetch(endpoint: string, init: RequestInit): Promise<Response>
  }
}

export class IdentityLifecyclePullResponseTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullResponseTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecyclePullResponseTransport(
  input: IdentityLifecyclePullResponseTransportOptions,
): IdentityLifecycleResponseTransport {
  const endpoint = input.endpoint
  const timeoutMs = input.timeoutMs
  const fetchPort = input.fetchPort
  const fetchMethod = fetchPort?.fetch
  if (!isExactHttpsUrl(endpoint)
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < MIN_TIMEOUT_MS
    || timeoutMs > MAX_TIMEOUT_MS
    || typeof fetchMethod !== 'function') {
    throw new IdentityLifecyclePullResponseTransportFailure()
  }

  return {
    async execute(request: IdentityLifecyclePullRequest): Promise<Response> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: unknown
      try {
        response = await fetchMethod.call(fetchPort, endpoint, {
          ...IDENTITY_LIFECYCLE_FETCH_INIT,
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        if (!(response instanceof Response)
          || response.status !== 200
          || !hasNoStoreDirective(response.headers.get('cache-control'))) {
          throw new IdentityLifecyclePullResponseTransportFailure()
        }
        return response
      } catch (error) {
        cancelIfResponse(response)
        if (controller.signal.aborted) throw new Error('Identity lifecycle pull timed out')
        throw error instanceof Error ? error : new IdentityLifecyclePullResponseTransportFailure()
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function hasNoStoreDirective(value: string | null): boolean {
  return value?.split(',').some((directive) => directive.trim().toLowerCase() === 'no-store')
    ?? false
}

function cancelIfResponse(value: unknown): void {
  try {
    if (value instanceof Response) cancelResponseBody(value)
  } catch {
    // Classification remains fail-closed even when cancellation is unavailable.
  }
}

function isExactHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && url.toString() === value
  } catch {
    return false
  }
}
