import { createHash } from 'node:crypto'

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/
const STATE = /^[A-Za-z0-9_-]{16,160}$/
const BROWSER_BINDING = /^[A-Za-z0-9_-]{16,160}$/

export function digestAcademySessionId(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid Academy session identifier')
  return createHash('sha256').update(sessionId).digest('base64url')
}

export function deriveStableAcademySessionId(
  state: string,
  browserBinding: string,
): string {
  if (!STATE.test(state) || !BROWSER_BINDING.test(browserBinding)) {
    throw new Error('invalid Academy authorization binding')
  }
  return createHash('sha256')
    .update(`academy-session-id\0${state}\0${browserBinding}`)
    .digest('base64url')
}
