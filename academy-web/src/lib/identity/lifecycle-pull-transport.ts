import {
  createIdentityLifecyclePullJsonOperation,
  type IdentityLifecycleResponseTransport,
  type IdentityLifecycleStrictResponseReader,
} from './lifecycle-pull-json-operation'
import {
  createIdentityLifecyclePullOperationTransport,
} from './lifecycle-pull-operation-transport'
import type { IdentityLifecycleClientAssertionProvider } from './lifecycle-pull-request'
import type { IdentityLifecycleVerifiedPageTransport } from './lifecycle-pull-cycle'
import {
  createIdentityLifecycleVerifiedPageTransport,
} from './lifecycle-verified-page-transport'
import type { IdentityLifecyclePullPageEnvelopePolicy } from './lifecycle-pull-page-verifier'

const MAX_REQUEST_LIMIT = 100
const FAILURE_MESSAGE = 'Identity lifecycle pull transport failed'

export type IdentityLifecyclePullTransportOptions = {
  consumerId: string
  clientAssertionAudience: string
  requestedLimit: number
  clientAssertionProvider: IdentityLifecycleClientAssertionProvider
  responseTransport: IdentityLifecycleResponseTransport
  responseReader: IdentityLifecycleStrictResponseReader
  envelopePolicy: IdentityLifecyclePullPageEnvelopePolicy
}

export class IdentityLifecyclePullTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecyclePullTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecyclePullTransport(
  input: IdentityLifecyclePullTransportOptions,
): IdentityLifecycleVerifiedPageTransport {
  try {
    const consumerId = input.consumerId
    const clientAssertionAudience = input.clientAssertionAudience
    const requestedLimit = input.requestedLimit
    const clientAssertionProvider = input.clientAssertionProvider
    const responseTransport = input.responseTransport
    const responseReader = input.responseReader
    const envelopePolicy = input.envelopePolicy

    if (!Number.isSafeInteger(requestedLimit)
      || requestedLimit < 1
      || requestedLimit > MAX_REQUEST_LIMIT) {
      throw new IdentityLifecyclePullTransportFailure()
    }

    const operation = createIdentityLifecyclePullJsonOperation({
      responseTransport,
      responseReader,
    })
    const pageTransport = createIdentityLifecyclePullOperationTransport({
      consumerId,
      clientAssertionAudience,
      requestedLimit,
      clientAssertionProvider,
      operation,
    })
    return createIdentityLifecycleVerifiedPageTransport({
      pageTransport,
      requestedLimit,
      envelopePolicy,
    })
  } catch {
    throw new IdentityLifecyclePullTransportFailure()
  }
}
