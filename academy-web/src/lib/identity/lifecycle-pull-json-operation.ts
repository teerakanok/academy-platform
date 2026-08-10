import type { StrictJsonResult } from '../http/strict-json-response'
import type { IdentityLifecyclePullOperation } from './lifecycle-pull-operation-transport'
import type { IdentityLifecyclePullRequest } from './lifecycle-pull-request'

const FAILURE_MESSAGE = 'Identity lifecycle pull JSON operation failed'

// This port owns authenticated network and HTTP semantics before returning a response.
export type IdentityLifecycleResponseTransport = {
  execute(request: IdentityLifecyclePullRequest): Promise<Response>
}

// Runtime composition binds this port to the reviewed strict JSON response boundary.
export type IdentityLifecycleStrictResponseReader = {
  read(response: Response): Promise<StrictJsonResult>
}

export type IdentityLifecyclePullJsonOperationOptions = {
  responseTransport: IdentityLifecycleResponseTransport
  responseReader: IdentityLifecycleStrictResponseReader
}

export class IdentityLifecyclePullJsonOperationFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullJsonOperationFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecyclePullJsonOperation(
  input: IdentityLifecyclePullJsonOperationOptions,
): IdentityLifecyclePullOperation {
  try {
    const responseTransport = input.responseTransport
    const responseReader = input.responseReader
    const execute = responseTransport?.execute
    const read = responseReader?.read
    if (!responseTransport
      || !responseReader
      || typeof execute !== 'function'
      || typeof read !== 'function') {
      throw new IdentityLifecyclePullJsonOperationFailure()
    }

    return {
      async execute(request) {
        try {
          const response = await execute.call(responseTransport, request)
          const parsed = await read.call(responseReader, response)
          const ok = parsed?.ok
          if (ok !== true) throw new IdentityLifecyclePullJsonOperationFailure()
          const value = parsed.value
          return await value
        } catch {
          throw new IdentityLifecyclePullJsonOperationFailure()
        }
      },
    }
  } catch {
    throw new IdentityLifecyclePullJsonOperationFailure()
  }
}
