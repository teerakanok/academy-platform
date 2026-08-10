import type { IdentityLifecycleVerifiedPageTransport } from './lifecycle-pull-cycle'
import {
  verifyIdentityLifecyclePullPage,
  type IdentityLifecyclePullPageEnvelopePolicy,
} from './lifecycle-pull-page-verifier'

const MAX_REQUEST_LIMIT = 100
const MAX_CURSOR = BigInt('9223372036854775807')
const CURSOR_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/
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
      async pullVerifiedPage(input) {
        try {
          const cursor = input?.cursor
          const verificationTime = input?.verificationTime
          if (!isCanonicalCursor(cursor) || !isValidDate(verificationTime)) {
            throw new IdentityLifecycleVerifiedPageTransportFailure()
          }

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

function isCanonicalCursor(value: unknown): value is string | null {
  return value === null
    || (typeof value === 'string'
      && CURSOR_PATTERN.test(value)
      && BigInt(value) <= MAX_CURSOR)
}

function isValidDate(value: unknown): value is Date {
  if (!(value instanceof Date)) return false
  try {
    return Number.isFinite(Date.prototype.getTime.call(value))
  } catch {
    return false
  }
}
