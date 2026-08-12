import {
  cancelResponseBody,
  readStrictJsonResponse,
} from '@/lib/http/strict-json-response'
import { isAcademyInternalReturnPath } from '@/lib/auth/internal-return-path'

const MAX_ACCOUNT_RESPONSE_BYTES = 4 * 1024
const MAX_ACCOUNT_EMAIL_LENGTH = 254
const MAX_AUTH_ERROR_LENGTH = 512

export type AccountResponse =
  | { signedIn: false }
  | { signedIn: true; email: string }

export type SignOutResponse = {
  revocation: 'confirmed' | 'not-confirmed'
}

export type OtpResponse =
  | { ok: true }
  | { ok: false; error: string }

export type VerifyResponse =
  | { ok: true; next: string }
  | { ok: false; error: string }

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

export function projectAccountResponse(value: unknown): AccountResponse | null {
  const record = plainRecord(value)
  if (!record) return null
  if (record.signedIn === false && hasExactKeys(record, ['signedIn'])) {
    return { signedIn: false }
  }
  if (
    record.signedIn === true
    && hasExactKeys(record, ['signedIn', 'email'])
    && typeof record.email === 'string'
    && record.email.length > 0
    && record.email.length <= MAX_ACCOUNT_EMAIL_LENGTH
  ) {
    return { signedIn: true, email: record.email }
  }
  return null
}

export async function readAccountResponse(response: Response): Promise<AccountResponse | null> {
  if (!response.ok) {
    cancelResponseBody(response)
    return null
  }
  const parsed = await readStrictJsonResponse(response, {
    maxBytes: MAX_ACCOUNT_RESPONSE_BYTES,
    maxDepth: 2,
  })
  return parsed.ok ? projectAccountResponse(parsed.value) : null
}

function boundedError(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_AUTH_ERROR_LENGTH
}

export function projectSignOutResponse(value: unknown): SignOutResponse | null {
  const record = plainRecord(value)
  if (
    !record
    || !hasExactKeys(record, ['ok', 'scope', 'revocation'])
    || record.ok !== true
    || record.scope !== 'local'
    || (record.revocation !== 'confirmed' && record.revocation !== 'not-confirmed')
  ) {
    return null
  }
  return { revocation: record.revocation }
}

export function projectOtpResponse(value: unknown): OtpResponse | null {
  const record = plainRecord(value)
  if (!record) return null
  if (record.ok === true && hasExactKeys(record, ['ok'])) return { ok: true }
  if (
    record.ok === false
    && hasExactKeys(record, ['ok', 'error'])
    && boundedError(record.error)
  ) {
    return { ok: false, error: record.error }
  }
  return null
}

export function projectVerifyResponse(value: unknown): VerifyResponse | null {
  const record = plainRecord(value)
  if (!record) return null
  if (
    record.ok === true
    && hasExactKeys(record, ['ok', 'next'])
    && isAcademyInternalReturnPath(record.next)
  ) {
    return { ok: true, next: record.next }
  }
  if (
    record.ok === false
    && hasExactKeys(record, ['ok', 'error'])
    && boundedError(record.error)
  ) {
    return { ok: false, error: record.error }
  }
  return null
}

async function readAuthActionResponse<T>(
  response: Response,
  project: (value: unknown) => T | null,
  expectedSuccess: (value: T) => boolean,
): Promise<T | null> {
  const parsed = await readStrictJsonResponse(response, {
    maxBytes: MAX_ACCOUNT_RESPONSE_BYTES,
    maxDepth: 2,
  })
  if (!parsed.ok) return null
  const projected = project(parsed.value)
  if (!projected || response.ok !== expectedSuccess(projected)) return null
  return projected
}

export async function readSignOutResponse(response: Response): Promise<SignOutResponse | null> {
  if (!response.ok) {
    cancelResponseBody(response)
    return null
  }
  return readAuthActionResponse(response, projectSignOutResponse, () => true)
}

export async function readOtpResponse(response: Response): Promise<OtpResponse | null> {
  return readAuthActionResponse(response, projectOtpResponse, (value) => value.ok)
}

export async function readVerifyResponse(response: Response): Promise<VerifyResponse | null> {
  return readAuthActionResponse(response, projectVerifyResponse, (value) => value.ok)
}
