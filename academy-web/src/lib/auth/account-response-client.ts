import {
  cancelResponseBody,
  readStrictJsonResponse,
} from '@/lib/http/strict-json-response'
import { isAcademyInternalReturnPath } from '@/lib/auth/internal-return-path'

const MAX_ACCOUNT_RESPONSE_BYTES = 4 * 1024
const MAX_ACCOUNT_EMAIL_LENGTH = 254
const MAX_AUTH_ERROR_LENGTH = 512
const MAX_SSO_SIGNOUT_URL_LENGTH = 256

export type AccountResponse =
  | { signedIn: false }
  | { signedIn: true; email: string }

export type SignOutResponse = {
  revocation: 'confirmed' | 'not-confirmed'
  /** มีเฉพาะ production — URL ที่ browser เรียกหลัง sign-out เพื่อจบ SSO กลาง (F-1).
   *  fixture ไม่ส่ง จึงต้อง optional ทั้ง type และ projection */
  ssoSignoutUrl?: string
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

/** URL นี้มาจาก server ของเราเอง (route อ่านจาก consumer-registry) ไม่ใช่ input
 *  จากภายนอก — bound ไว้เพื่อกัน response ปลอมยัด URL ยาว ๆ เข้า client state.
 *  null = มีค่ามาแต่ไม่ผ่าน bound (ผู้เรียกเช็ค key set ก่อนเรียกแล้ว) */
function boundedSsoSignoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length > MAX_SSO_SIGNOUT_URL_LENGTH || !value.startsWith('https://')) return null
  return value
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

/** production sign-out response มี ssoSignoutUrl เพิ่ม (F-1); fixture สาม branch
 *  เก่าไม่มี จึง accept ทั้งสองรูปแบบด้วย key set ตรงตาม branch */
export function projectSignOutResponseWithSso(value: unknown): SignOutResponse | null {
  const record = plainRecord(value)
  if (
    !record
    || record.ok !== true
    || record.scope !== 'local'
    || (record.revocation !== 'confirmed' && record.revocation !== 'not-confirmed')
  ) {
    return null
  }
  if (hasExactKeys(record, ['ok', 'scope', 'revocation'])) {
    return { revocation: record.revocation }
  }
  if (!hasExactKeys(record, ['ok', 'scope', 'revocation', 'ssoSignoutUrl'])) return null
  const url = boundedSsoSignoutUrl(record.ssoSignoutUrl)
  if (url === null) return null
  return { revocation: record.revocation, ssoSignoutUrl: url }
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
  return readAuthActionResponse(response, projectSignOutResponseWithSso, () => true)
}

export async function readOtpResponse(response: Response): Promise<OtpResponse | null> {
  return readAuthActionResponse(response, projectOtpResponse, (value) => value.ok)
}

export async function readVerifyResponse(response: Response): Promise<VerifyResponse | null> {
  return readAuthActionResponse(response, projectVerifyResponse, (value) => value.ok)
}
