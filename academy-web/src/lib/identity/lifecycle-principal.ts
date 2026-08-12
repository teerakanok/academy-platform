export const IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN_SENTINEL = '#'

export const IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN =
  '^https://[a-z][a-z0-9]{0,29}([.][a-z][a-z0-9]{0,29}){1,7}(/|(/[A-Za-z0-9_-]+)+/?)#$'

const identityLifecyclePrincipalIssuerRegex = new RegExp(
  IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN,
)

export function isCanonicalIdentityLifecyclePrincipalIssuer(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && identityLifecyclePrincipalIssuerRegex.test(
      `${value}${IDENTITY_LIFECYCLE_PRINCIPAL_ISSUER_PATTERN_SENTINEL}`,
    )
}

export function isWellFormedIdentityLifecycleSubject(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || value.includes('\0')) {
    return false
  }

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false
    }
  }
  return true
}
