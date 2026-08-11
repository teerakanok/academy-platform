import {
  createIdentityCodeExchangeAdapter,
} from './code-exchange-adapter'
import {
  createIdentityCodeExchangeTransport,
  type IdentityCodeExchangeTransportOptions,
} from './code-exchange-transport'
import {
  projectIdentityCodeExchangeRuntimeConfig,
  type IdentityCodeExchangeRuntimeConfigInput,
} from './code-exchange-runtime-config'
import type { IdentityCodeExchangePort } from './adapter'

const FAILURE_MESSAGE = 'Identity code exchange port construction failed'

export type IdentityCodeExchangePortOptions = {
  config: IdentityCodeExchangeRuntimeConfigInput
  fetchPort: IdentityCodeExchangeTransportOptions['fetchPort']
  responseReader: IdentityCodeExchangeTransportOptions['responseReader']
}

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
    const config = projectIdentityCodeExchangeRuntimeConfig(input.config)
    if (!config || config.status !== 'admitted') {
      throw new Error(FAILURE_MESSAGE)
    }

    const fetchPort = input.fetchPort
    const responseReader = input.responseReader
    const operation = createIdentityCodeExchangeTransport({
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs,
      fetchPort,
      responseReader,
    })
    return createIdentityCodeExchangeAdapter({ operation })
  } catch {
    throw new IdentityCodeExchangePortFailure()
  }
}
