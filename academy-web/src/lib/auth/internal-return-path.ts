const ACADEMY_RETURN_ORIGIN = 'https://academy.invalid'
const DEFAULT_ACADEMY_RETURN_PATH = '/dashboard'
const MAX_ACADEMY_RETURN_PATH_LENGTH = 2_048
const UNSAFE_PATH_CHARACTER = /[\\\u0000-\u001f\u007f]/

export function isAcademyInternalReturnPath(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ACADEMY_RETURN_PATH_LENGTH
    || !value.startsWith('/')
    || value.startsWith('//')
    || UNSAFE_PATH_CHARACTER.test(value)
  ) {
    return false
  }

  try {
    return new URL(value, ACADEMY_RETURN_ORIGIN).origin === ACADEMY_RETURN_ORIGIN
  } catch {
    return false
  }
}

export function safeAcademyInternalReturnPath(value: unknown): string {
  return isAcademyInternalReturnPath(value) ? value : DEFAULT_ACADEMY_RETURN_PATH
}
