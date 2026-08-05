export const DEFAULT_BATCH = 5000
export const MAX_ROUNDS = 20
export const REQUEST_TIMEOUT_MS = 10_000
export const TOKEN_TTL_SECONDS = 60
const MINIMUM_SECRET_BYTES = 32
const encoder = new TextEncoder()

export interface RetentionEnv {
  ACADEMY_RETENTION_API_URL?: string
  ACADEMY_RETENTION_API_JWT_SECRET?: string
}

export type PurgeJob = {
  name: string
  rpc: string
}

export const RETENTION_JOBS: readonly PurgeJob[] = [
  { name: 'attempts', rpc: 'run_retention_attempts' },
  { name: 'waitlist', rpc: 'run_retention_leads' },
  { name: 'accounts', rpc: 'run_retention_inactive_users' },
  { name: 'privacy-requests', rpc: 'run_retention_privacy_requests' },
  { name: 'staff-authorization', rpc: 'run_retention_staff_authorization_history' },
]

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Logger = Pick<Console, 'log' | 'warn'>

export interface RetentionDependencies {
  fetcher?: Fetcher
  logger?: Logger
  now?: () => Date
  timeoutMs?: number
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function issueRetentionToken(secret: string, now = new Date()): Promise<string> {
  const secretBytes = encoder.encode(secret)
  if (secretBytes.byteLength < MINIMUM_SECRET_BYTES) {
    throw new Error('ACADEMY_RETENTION_API_JWT_SECRET must contain at least 32 bytes')
  }

  const issuedAt = Math.floor(now.getTime() / 1000)
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64Url(encoder.encode(JSON.stringify({
    aud: 'academy-retention-api',
    exp: issuedAt + TOKEN_TTL_SECONDS,
    iat: issuedAt,
    role: 'academy_retention',
  })))
  const signed = `${header}.${payload}`
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signed))
  return `${signed}.${base64Url(new Uint8Array(signature))}`
}

export function retentionApiBase(raw: string): URL {
  const url = new URL(raw)
  const isLocalLoopback = url.protocol === 'http:' && url.hostname === '127.0.0.1'
  if ((!isLocalLoopback && url.protocol !== 'https:') || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('ACADEMY_RETENTION_API_URL must be an exact HTTPS origin (or local loopback origin)')
  }
  return url
}

async function fetchWithTimeout(fetcher: Fetcher, input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('request timed out')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function runPurgeJob(
  env: RetentionEnv,
  job: PurgeJob,
  dependencies: RetentionDependencies = {},
): Promise<{ rounds: number; deleted: number }> {
  if (!env.ACADEMY_RETENTION_API_URL || !env.ACADEMY_RETENTION_API_JWT_SECRET) {
    throw new Error(`[retention/${job.name}] required API settings are missing`)
  }

  const base = retentionApiBase(env.ACADEMY_RETENTION_API_URL)
  const fetcher = dependencies.fetcher ?? fetch
  const now = dependencies.now ?? (() => new Date())
  const timeoutMs = dependencies.timeoutMs ?? REQUEST_TIMEOUT_MS
  let deleted = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const token = await issueRetentionToken(env.ACADEMY_RETENTION_API_JWT_SECRET, now())
    let response: Response
    try {
      response = await fetchWithTimeout(fetcher, new URL(`/rpc/${job.rpc}`, base), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{}',
      }, timeoutMs)
    } catch (error) {
      throw new Error(`[retention/${job.name}] ${error instanceof Error ? error.message : 'request failed'}`)
    }
    if (!response.ok) {
      throw new Error(`[retention/${job.name}] API returned ${response.status} after ${deleted} deletions`)
    }
    const removed = await response.json()
    if (typeof removed !== 'number' || !Number.isSafeInteger(removed) || removed < 0) {
      throw new Error(`[retention/${job.name}] API returned an invalid deletion count`)
    }
    deleted += removed
    if (removed === 0) return { rounds: round, deleted }
  }

  dependencies.logger?.warn(JSON.stringify({ event: 'retention.backlog_remaining', job: job.name, deleted, rounds: MAX_ROUNDS }))
  return { rounds: MAX_ROUNDS, deleted }
}

export async function runRetention(
  env: RetentionEnv,
  dependencies: RetentionDependencies = {},
  jobs: readonly PurgeJob[] = RETENTION_JOBS,
): Promise<void> {
  const logger = dependencies.logger ?? console
  const failures: string[] = []
  for (const job of jobs) {
    try {
      const result = await runPurgeJob(env, job, { ...dependencies, logger })
      logger.log(JSON.stringify({ event: 'retention.purge_complete', job: job.name, ...result }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown failure'
      logger.warn(JSON.stringify({ event: 'retention.purge_failed', job: job.name, error: message }))
      failures.push(`${job.name}: ${message}`)
    }
  }
  if (failures.length > 0) throw new Error(`retention failed: ${failures.join('; ')}`)
}
