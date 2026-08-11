import type { IdentityCodeExchangePort } from './adapter'
import type { IdentityCodeExchangeJsonOperation } from './code-exchange-json-operation'

const FAILURE_MESSAGE = 'Identity code exchange adapter failed'

export type IdentityCodeExchangeAdapterOptions = {
  operation: IdentityCodeExchangeJsonOperation
}

export class IdentityCodeExchangeAdapterFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangeAdapterFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangeAdapter(
  input: IdentityCodeExchangeAdapterOptions,
): IdentityCodeExchangePort {
  try {
    const operation = input.operation
    const execute = operation?.execute
    if (!operation || typeof execute !== 'function') {
      throw new IdentityCodeExchangeAdapterFailure()
    }

    return {
      async exchangeCode(request) {
        try {
          return await execute.call(operation, request)
        } catch {
          throw new IdentityCodeExchangeAdapterFailure()
        }
      },
    }
  } catch {
    throw new IdentityCodeExchangeAdapterFailure()
  }
}
