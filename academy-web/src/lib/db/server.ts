import { createClient } from '@supabase/supabase-js'
import { issueAcademyRuntimeToken } from './runtime-token'

export type AcademyDbConfig = {
  url: string
  signingSecret: string
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

function validateAcademyDataApiUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น dedicated API URL ที่ถูกต้อง')
  }

  const isSecureOrigin = url.protocol === 'https:'
  const isLocalLoopback = url.protocol === 'http:' && url.hostname === '127.0.0.1'
  if (!isSecureOrigin && !isLocalLoopback) {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น HTTPS หรือ HTTP loopback 127.0.0.1')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ACADEMY_DATA_API_URL ต้องเป็น origin ตรงของ dedicated API เท่านั้น')
  }
  return url.origin
}

/**
 * Boolean form of the same origin rule `createAcademyDb` enforces — lets test
 * harnesses pin their raw fetch targets to exactly the origins the production
 * client would accept (HTTPS or HTTP loopback 127.0.0.1, bare origin).
 */
export function isSafeAcademyDataApiUrl(value: string): boolean {
  try {
    validateAcademyDataApiUrl(value)
    return true
  } catch {
    return false
  }
}

export function academyDataApiFetch(baseFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const inputUrl = input instanceof Request ? input.url : input.toString()
    const url = new URL(inputUrl)
    // supabase-js always constructs a Supabase-style /rest/v1 URL. The dedicated
    // PostgREST service owns the origin directly, so strip only that fixed prefix.
    if (url.pathname === '/rest/v1' || url.pathname.startsWith('/rest/v1/')) {
      url.pathname = url.pathname.slice('/rest/v1'.length) || '/'
    }
    if (input instanceof Request) {
      return baseFetch(new Request(url.toString(), input), init)
    }
    return baseFetch(url.toString(), init)
  }
}

/**
 * Server-only Academy data client. The URL must point at the dedicated
 * Academy PostgREST instance; the shared Pool A endpoint is intentionally
 * incompatible with this credential.
 */
export function createAcademyDb({ url, signingSecret, fetch, now = () => new Date() }: AcademyDbConfig) {
  return createClient(validateAcademyDataApiUrl(url), 'academy-runtime', {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
    accessToken: () => issueAcademyRuntimeToken(signingSecret, now()),
    global: { fetch: academyDataApiFetch(fetch ?? globalThis.fetch) },
  })
}

export function academyDb() {
  const url = process.env.ACADEMY_DATA_API_URL
  const signingSecret = process.env.ACADEMY_DATA_API_JWT_SECRET
  if (!url || !signingSecret) {
    throw new Error('ACADEMY_DATA_API_URL / ACADEMY_DATA_API_JWT_SECRET ยังไม่ถูกตั้งค่า (ดู .env.example)')
  }
  return createAcademyDb({ url, signingSecret })
}
