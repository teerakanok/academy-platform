import type { IdentityClientAssertionJtiSource } from './client-assertion-provider'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FAILURE_MESSAGE = 'Identity client assertion JTI source failed'

export class IdentityClientAssertionJtiSourceFailure extends Error {
  constructor() {
    super(FAILURE_MESSAGE)
    Object.defineProperty(this, 'name', {
      value: 'IdentityClientAssertionJtiSourceFailure',
      configurable: true,
    })
  }
}

export function createIdentityClientAssertionJtiSource(): IdentityClientAssertionJtiSource {
  try {
    const source = globalThis.crypto
    const randomUUID = source?.randomUUID
    if (!source || typeof randomUUID !== 'function') {
      throw new IdentityClientAssertionJtiSourceFailure()
    }

    return {
      next() {
        try {
          const value = randomUUID.call(source)
          if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
            throw new IdentityClientAssertionJtiSourceFailure()
          }
          return value
        } catch {
          throw new IdentityClientAssertionJtiSourceFailure()
        }
      },
    }
  } catch {
    throw new IdentityClientAssertionJtiSourceFailure()
  }
}
