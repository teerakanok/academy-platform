import type { StrictJsonResult } from '../http/strict-json-response'
import {
  projectIdentityCodeExchangeRequest,
  type IdentityCodeExchangeRequest,
} from './code-exchange-request'

const FAILURE_MESSAGE = 'Identity code exchange JSON operation failed'

export type { IdentityCodeExchangeRequest } from './code-exchange-request'

export type IdentityCodeExchangeResponseTransport = {
  execute(request: IdentityCodeExchangeRequest): Promise<Response>
}

export type IdentityCodeExchangeStrictResponseReader = {
  read(response: Response): Promise<StrictJsonResult>
}

export type IdentityCodeExchangeJsonOperationOptions = {
  responseTransport: IdentityCodeExchangeResponseTransport
  responseReader: IdentityCodeExchangeStrictResponseReader
}

export type IdentityCodeExchangeJsonOperation = {
  execute(request: IdentityCodeExchangeRequest): Promise<unknown>
}

export class IdentityCodeExchangeJsonOperationFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangeJsonOperationFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangeJsonOperation(
  input: IdentityCodeExchangeJsonOperationOptions,
): IdentityCodeExchangeJsonOperation {
  try {
    const responseTransport = input.responseTransport
    const responseReader = input.responseReader
    const execute = responseTransport?.execute
    const read = responseReader?.read
    if (!responseTransport
      || !responseReader
      || typeof execute !== 'function'
      || typeof read !== 'function') {
      throw new IdentityCodeExchangeJsonOperationFailure()
    }

    return {
      async execute(requestValue) {
        try {
          const request = projectIdentityCodeExchangeRequest(requestValue)
          if (!request) throw new IdentityCodeExchangeJsonOperationFailure()
          const response = await execute.call(responseTransport, request)
          const parsed = await read.call(responseReader, response)
          const ok = parsed?.ok
          if (ok !== true) throw new IdentityCodeExchangeJsonOperationFailure()
          const value = parsed.value
          return await value
        } catch {
          throw new IdentityCodeExchangeJsonOperationFailure()
        }
      },
    }
  } catch {
    throw new IdentityCodeExchangeJsonOperationFailure()
  }
}
