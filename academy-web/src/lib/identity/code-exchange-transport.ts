import {
  createIdentityCodeExchangeJsonOperation,
  type IdentityCodeExchangeJsonOperation,
  type IdentityCodeExchangeStrictResponseReader,
} from './code-exchange-json-operation'
import {
  createIdentityCodeExchangeResponseTransport,
  type IdentityCodeExchangeFetchPort,
} from './code-exchange-response-transport'

const FAILURE_MESSAGE = 'Identity code exchange transport failed'

export type IdentityCodeExchangeTransportOptions = {
  endpoint: string
  timeoutMs: number
  fetchPort: IdentityCodeExchangeFetchPort
  responseReader: IdentityCodeExchangeStrictResponseReader
}

export class IdentityCodeExchangeTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityCodeExchangeTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityCodeExchangeTransport(
  input: IdentityCodeExchangeTransportOptions,
): IdentityCodeExchangeJsonOperation {
  try {
    const endpoint = input.endpoint
    const timeoutMs = input.timeoutMs
    const fetchPort = input.fetchPort
    const responseReader = input.responseReader

    const responseTransport = createIdentityCodeExchangeResponseTransport({
      endpoint,
      timeoutMs,
      fetchPort,
    })
    return createIdentityCodeExchangeJsonOperation({
      responseTransport,
      responseReader,
    })
  } catch {
    throw new IdentityCodeExchangeTransportFailure()
  }
}
