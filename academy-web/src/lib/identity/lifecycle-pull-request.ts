const CONSUMER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/
const CURSOR_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/
const COMPACT_JWS_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const MAX_CURSOR = BigInt('9223372036854775807')
const MAX_REQUEST_LIMIT = 100
const MIN_ASSERTION_LENGTH = 32
const MAX_ASSERTION_LENGTH = 4096
const FAILURE_MESSAGE = 'Identity lifecycle pull request failed'

export type IdentityLifecycleClientAssertionProvider = {
  createClientAssertion(input: {
    consumerId: string
    audience: string
  }): Promise<string>
}

export type IdentityLifecyclePullRequest = {
  consumerId: string
  clientAssertion: string
  cursor?: { sequence: string }
  limit: number
}

export type IdentityLifecyclePullRequestBuilder = {
  createRequest(input: { cursor: string | null }): Promise<IdentityLifecyclePullRequest>
}

export type IdentityLifecyclePullRequestBuilderOptions = {
  consumerId: string
  clientAssertionAudience: string
  requestedLimit: number
  clientAssertionProvider: IdentityLifecycleClientAssertionProvider
}

export class IdentityLifecyclePullRequestFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullRequestFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecyclePullRequestBuilder(
  input: IdentityLifecyclePullRequestBuilderOptions,
): IdentityLifecyclePullRequestBuilder {
  try {
    const consumerId = input.consumerId
    const clientAssertionAudience = input.clientAssertionAudience
    const requestedLimit = input.requestedLimit
    const clientAssertionProvider = input.clientAssertionProvider
    const createClientAssertion = clientAssertionProvider?.createClientAssertion

    if (typeof consumerId !== 'string'
      || !CONSUMER_ID_PATTERN.test(consumerId)
      || !isExactHttpsAudience(clientAssertionAudience)
      || !Number.isSafeInteger(requestedLimit)
      || requestedLimit < 1
      || requestedLimit > MAX_REQUEST_LIMIT
      || !clientAssertionProvider
      || typeof createClientAssertion !== 'function') {
      throw new IdentityLifecyclePullRequestFailure()
    }

    return {
      async createRequest(request) {
        try {
          const cursor = request?.cursor
          if (!isCanonicalCursor(cursor)) {
            throw new IdentityLifecyclePullRequestFailure()
          }

          const clientAssertion = await createClientAssertion.call(
            clientAssertionProvider,
            { consumerId, audience: clientAssertionAudience },
          )
          if (!isCompactJws(clientAssertion)) {
            throw new IdentityLifecyclePullRequestFailure()
          }

          if (cursor === null) {
            return { consumerId, clientAssertion, limit: requestedLimit }
          }
          return {
            consumerId,
            clientAssertion,
            cursor: { sequence: cursor },
            limit: requestedLimit,
          }
        } catch {
          throw new IdentityLifecyclePullRequestFailure()
        }
      },
    }
  } catch {
    throw new IdentityLifecyclePullRequestFailure()
  }
}

function isCanonicalCursor(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string' || !CURSOR_PATTERN.test(value)) return false
  try {
    return BigInt(value) <= MAX_CURSOR
  } catch {
    return false
  }
}

function isCompactJws(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= MIN_ASSERTION_LENGTH
    && value.length <= MAX_ASSERTION_LENGTH
    && COMPACT_JWS_PATTERN.test(value)
}

function isExactHttpsAudience(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.hash === ''
      && url.toString() === value
  } catch {
    return false
  }
}
