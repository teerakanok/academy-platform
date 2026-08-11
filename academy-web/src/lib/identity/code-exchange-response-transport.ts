import { cancelResponseBody } from '../http/strict-json-response'
import type { IdentityCodeExchangeResponseTransport } from './code-exchange-json-operation'
import {
  projectIdentityCodeExchangeRequest,
  type IdentityCodeExchangeRequest,
} from './code-exchange-request'

const FAILURE_MESSAGE = 'Identity code exchange response transport failed'
const MAX_ENDPOINT_LENGTH = 2_048
const MAX_FETCH_TIMEOUT_MS = 5_000
const CODE_EXCHANGE_PATH = '/v1/code/exchange'

export type IdentityCodeExchangeFetchPort = {
  fetch(endpoint: string, init: RequestInit): Promise<Response>
}

export type IdentityCodeExchangeResponseTransportOptions = {
  endpoint: string
  timeoutMs: number
  fetchPort: IdentityCodeExchangeFetchPort
}

export class IdentityCodeExchangeResponseTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangeResponseTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangeResponseTransport(
  input: IdentityCodeExchangeResponseTransportOptions,
): IdentityCodeExchangeResponseTransport {
  try {
    const endpoint = input.endpoint
    const timeoutMs = input.timeoutMs
    if (!isCanonicalCodeExchangeEndpoint(endpoint)
      || !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 1
      || timeoutMs > MAX_FETCH_TIMEOUT_MS) {
      throw new IdentityCodeExchangeResponseTransportFailure()
    }
    const fetchPort = input.fetchPort
    const fetchMethod = fetchPort?.fetch
    if (!fetchPort || typeof fetchMethod !== 'function') {
      throw new IdentityCodeExchangeResponseTransportFailure()
    }

    return {
      async execute(requestValue) {
        const request = projectIdentityCodeExchangeRequest(requestValue)
        if (!request) throw new IdentityCodeExchangeResponseTransportFailure()
        return executeFetch({ endpoint, timeoutMs, fetchPort, fetchMethod, request })
      },
    }
  } catch {
    throw new IdentityCodeExchangeResponseTransportFailure()
  }
}

async function executeFetch(input: {
  endpoint: string
  timeoutMs: number
  fetchPort: IdentityCodeExchangeFetchPort
  fetchMethod: IdentityCodeExchangeFetchPort['fetch']
  request: IdentityCodeExchangeRequest
}): Promise<Response> {
  let controller: AbortController | undefined
  let timedOut = false
  let deadlineActive = false
  let rejectDeadline: (reason?: unknown) => void = () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let timerArmed = false
  let response: unknown
  let acceptedResponse: Response | undefined
  let failed = false
  try {
    controller = new AbortController()
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject
    })
    void deadline.catch(() => undefined)
    deadlineActive = true
    timer = setTimeout(() => {
      if (!deadlineActive) return
      timedOut = true
      let reason: unknown
      try {
        reason = new DOMException('Code exchange fetch deadline exceeded', 'TimeoutError')
      } catch {
        reason = undefined
      }
      try {
        controller?.abort(reason)
      } catch {
        // The private deadline still settles if the platform rejects abort dispatch.
      }
      rejectDeadline(reason)
    }, input.timeoutMs)
    timerArmed = true

    const fetchPromise = Promise.resolve(input.fetchMethod.call(input.fetchPort, input.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.request),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    }))
    void fetchPromise.then((lateResponse) => {
      if (timedOut) cancelIfResponse(lateResponse)
    }, () => undefined)
    response = await Promise.race([fetchPromise, deadline])
    if (!(response instanceof Response)
      || response.status !== 200
      || !hasNoStoreDirective(response.headers.get('cache-control'))) {
      throw new IdentityCodeExchangeResponseTransportFailure()
    }
    acceptedResponse = response
  } catch {
    failed = true
  } finally {
    deadlineActive = false
    if (timerArmed) {
      try {
        clearTimeout(timer)
      } catch {
        failed = true
      }
    }
  }

  if (failed || !acceptedResponse) {
    cancelIfResponse(response)
    throw new IdentityCodeExchangeResponseTransportFailure()
  }
  return acceptedResponse
}

function cancelIfResponse(value: unknown): void {
  try {
    if (value instanceof Response) cancelResponseBody(value)
  } catch {
    // Failure classification must not depend on a hostile response wrapper.
  }
}

function hasNoStoreDirective(value: string | null): boolean {
  return value?.split(',').some((directive) => directive.trim().toLowerCase() === 'no-store')
    ?? false
}

function isCanonicalCodeExchangeEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) {
    return false
  }
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === 'https:'
      && endpoint.username === ''
      && endpoint.password === ''
      && endpoint.search === ''
      && endpoint.hash === ''
      && endpoint.pathname === CODE_EXCHANGE_PATH
      && endpoint.href === value
  } catch {
    return false
  }
}
