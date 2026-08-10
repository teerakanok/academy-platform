import type { IdentityLifecycleVerifiedPageTransport } from './lifecycle-pull-cycle'
import {
  verifyIdentityLifecyclePullPage,
  type IdentityLifecyclePullPageEnvelopePolicy,
} from './lifecycle-pull-page-verifier'

const MAX_REQUEST_LIMIT = 100
const FAILURE_MESSAGE = 'Identity lifecycle verified-page transport failed'

// The future raw transport owns bounded duplicate-safe parsing before this port.
export type IdentityLifecycleParsedPageTransport = {
  pullPage(input: {
    cursor: string | null
    limit: number
  }): Promise<unknown>
}

export type IdentityLifecycleVerifiedPageTransportOptions = {
  pageTransport: IdentityLifecycleParsedPageTransport
  requestedLimit: number
  envelopePolicy: IdentityLifecyclePullPageEnvelopePolicy
}

export class IdentityLifecycleVerifiedPageTransportFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityLifecycleVerifiedPageTransportFailure',
      configurable: true,
    })
  }
}

export function createIdentityLifecycleVerifiedPageTransport(
  input: IdentityLifecycleVerifiedPageTransportOptions,
): IdentityLifecycleVerifiedPageTransport {
  try {
    const pageTransport = input.pageTransport
    const requestedLimit = input.requestedLimit
    const envelopePolicy = input.envelopePolicy
    const pullPage = pageTransport?.pullPage
    if (!pageTransport
      || typeof pullPage !== 'function'
      || !Number.isSafeInteger(requestedLimit)
      || requestedLimit < 1
      || requestedLimit > MAX_REQUEST_LIMIT) {
      throw new IdentityLifecycleVerifiedPageTransportFailure()
    }

    return {
      async pullVerifiedPage({ cursor, verificationTime }) {
        try {
          const page = await pullPage.call(pageTransport, {
            cursor,
            limit: requestedLimit,
          })
          const verified = await verifyIdentityLifecyclePullPage(page, {
            requestedCursor: cursor,
            requestedLimit,
            verificationTime,
            envelopePolicy,
          })
          if (!verified) throw new IdentityLifecycleVerifiedPageTransportFailure()
          return verified
        } catch {
          throw new IdentityLifecycleVerifiedPageTransportFailure()
        }
      },
    }
  } catch {
    throw new IdentityLifecycleVerifiedPageTransportFailure()
  }
}
