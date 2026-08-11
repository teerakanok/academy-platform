import type { StrictJsonResult } from '../http/strict-json-response'
import type { IdentityAdapter } from './adapter'

const FAILURE_MESSAGE = 'Identity code exchange JSON operation failed'
const REQUEST_KEYS = [
  'clientId',
  'clientAssertion',
  'redirectUri',
  'code',
  'codeVerifier',
] as const
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{16,160}$/
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

export type IdentityCodeExchangeRequest = Parameters<IdentityAdapter['exchangeCode']>[0]

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
          const request = snapshotRequest(requestValue)
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

function snapshotRequest(value: unknown): IdentityCodeExchangeRequest {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new IdentityCodeExchangeJsonOperationFailure()
    }
    const keys = Reflect.ownKeys(value)
    if (keys.length !== REQUEST_KEYS.length
      || keys.some((key) => typeof key !== 'string'
        || !REQUEST_KEYS.includes(key as (typeof REQUEST_KEYS)[number]))) {
      throw new IdentityCodeExchangeJsonOperationFailure()
    }

    const snapshot = Object.create(null) as Record<(typeof REQUEST_KEYS)[number], unknown>
    for (const key of REQUEST_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new IdentityCodeExchangeJsonOperationFailure()
      }
      snapshot[key] = descriptor.value
    }

    if (typeof snapshot.clientId !== 'string'
      || snapshot.clientId.length < 1
      || snapshot.clientId.length > 80
      || typeof snapshot.clientAssertion !== 'string'
      || snapshot.clientAssertion.length < 32
      || snapshot.clientAssertion.length > 4096
      || !COMPACT_JWS.test(snapshot.clientAssertion)
      || typeof snapshot.redirectUri !== 'string'
      || !isAllowedRedirectUri(snapshot.redirectUri)
      || typeof snapshot.code !== 'string'
      || !OPAQUE_VALUE.test(snapshot.code)
      || typeof snapshot.codeVerifier !== 'string'
      || !CODE_VERIFIER.test(snapshot.codeVerifier)) {
      throw new IdentityCodeExchangeJsonOperationFailure()
    }

    return {
      clientId: snapshot.clientId,
      clientAssertion: snapshot.clientAssertion,
      redirectUri: snapshot.redirectUri,
      code: snapshot.code,
      codeVerifier: snapshot.codeVerifier,
    }
  } catch {
    throw new IdentityCodeExchangeJsonOperationFailure()
  }
}

function isAllowedRedirectUri(value: string): boolean {
  try {
    const redirect = new URL(value)
    return redirect.protocol === 'https:'
      || (redirect.protocol === 'http:' && redirect.hostname === 'localhost')
  } catch {
    return false
  }
}
