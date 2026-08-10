import {
  createIdentityLifecyclePullRequestBuilder,
  type IdentityLifecycleClientAssertionProvider,
  type IdentityLifecyclePullRequest,
} from './lifecycle-pull-request'
import type { IdentityLifecycleParsedPageTransport } from './lifecycle-verified-page-transport'

const MAX_REQUEST_LIMIT = 100
const FAILURE_MESSAGE = 'Identity lifecycle pull operation failed'

export type IdentityLifecyclePullOperation = {
  execute(request: IdentityLifecyclePullRequest): Promise<unknown>
}

export type IdentityLifecyclePullOperationTransportOptions = {
  consumerId: string
  clientAssertionAudience: string
  requestedLimit: number
  clientAssertionProvider: IdentityLifecycleClientAssertionProvider
  operation: IdentityLifecyclePullOperation
}

export class IdentityLifecyclePullOperationTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullOperationTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecyclePullOperationTransport(
  input: IdentityLifecyclePullOperationTransportOptions,
): IdentityLifecycleParsedPageTransport {
  try {
    const consumerId = input.consumerId
    const clientAssertionAudience = input.clientAssertionAudience
    const requestedLimit = input.requestedLimit
    const clientAssertionProvider = input.clientAssertionProvider
    const operation = input.operation

    if (!Number.isSafeInteger(requestedLimit)
      || requestedLimit < 1
      || requestedLimit > MAX_REQUEST_LIMIT) {
      throw new IdentityLifecyclePullOperationTransportFailure()
    }

    const execute = operation?.execute
    if (!operation || typeof execute !== 'function') {
      throw new IdentityLifecyclePullOperationTransportFailure()
    }

    const requestBuilder = createIdentityLifecyclePullRequestBuilder({
      consumerId,
      clientAssertionAudience,
      requestedLimit,
      clientAssertionProvider,
    })

    return {
      async pullPage(request) {
        try {
          const cursor = request?.cursor
          const limit = request?.limit
          if (limit !== requestedLimit) {
            throw new IdentityLifecyclePullOperationTransportFailure()
          }

          const pullRequest = await requestBuilder.createRequest({ cursor })
          return await execute.call(operation, pullRequest)
        } catch {
          throw new IdentityLifecyclePullOperationTransportFailure()
        }
      },
    }
  } catch {
    throw new IdentityLifecyclePullOperationTransportFailure()
  }
}
