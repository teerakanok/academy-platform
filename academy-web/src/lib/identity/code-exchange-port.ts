import {
  createIdentityCodeExchangeAdapter,
} from './code-exchange-adapter'
import {
  createIdentityCodeExchangeTransport,
  type IdentityCodeExchangeTransportOptions,
} from './code-exchange-transport'
import type { IdentityCodeExchangePort } from './adapter'

const FAILURE_MESSAGE = 'Identity code exchange port construction failed'

export type IdentityCodeExchangePortOptions = IdentityCodeExchangeTransportOptions

export class IdentityCodeExchangePortFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangePortFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangePort(
  input: IdentityCodeExchangePortOptions,
): IdentityCodeExchangePort {
  try {
    const operation = createIdentityCodeExchangeTransport(input)
    return createIdentityCodeExchangeAdapter({ operation })
  } catch {
    throw new IdentityCodeExchangePortFailure()
  }
}
