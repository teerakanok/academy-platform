const MAX_ENDPOINT_LENGTH = 2_048
const MAX_FETCH_TIMEOUT_MS = 5_000
const CODE_EXCHANGE_PATH = '/v1/code/exchange'

export function isCanonicalIdentityCodeExchangeEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) {
    return false
  }
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === 'https:'
      && endpoint.username === ''
      && endpoint.password === ''
      && endpoint.search === ''
      && endpoint.hash === ''
      && endpoint.pathname === CODE_EXCHANGE_PATH
      && value === `${endpoint.origin}${CODE_EXCHANGE_PATH}`
  } catch {
    return false
  }
}

export function isValidIdentityCodeExchangeFetchTimeout(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_FETCH_TIMEOUT_MS
}
