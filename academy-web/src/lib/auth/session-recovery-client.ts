import { cancelResponseBody, readStrictJsonResponse } from '@/lib/http/strict-json-response'

async function sessionRequest(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Session request deadline')) }, 5_000)
  })
  try {
    return await Promise.race([expired, (async () => {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
        cache: 'no-store', redirect: 'error', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal })
      if (!response.ok) { cancelResponseBody(response); return { status: response.status, body: null } }
      const parsed = await readStrictJsonResponse(response, { maxBytes: 512, maxDepth: 3, signal: controller.signal })
      return { status: response.status, body: parsed.ok ? parsed.value : null }
    })()])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

export async function recordForegroundActivity(): Promise<'active' | 'signed-out' | 'unconfirmed'> {
  try {
    const result = await sessionRequest('/api/auth/activity', {})
    if (result.status === 401) return 'signed-out'
    const value = result.body as { ok?: unknown } | null
    return result.status === 200 && value && Object.keys(value).length === 1 && value.ok === true ? 'active' : 'unconfirmed'
  } catch { return 'unconfirmed' }
}

export type AttemptRecovery = 'active' | 'completed' | 'pending' | 'invalid' | 'signed-out' | 'unconfirmed'
export async function inspectAttemptRecovery(slug: string, nodeId: string, attemptId: string): Promise<AttemptRecovery> {
  try {
    const result = await sessionRequest('/api/attempts/reauthenticate', { slug, nodeId, attemptId })
    if (result.status === 401) return 'signed-out'
    const value = result.body as { ok?: unknown; attemptId?: unknown; status?: unknown } | null
    if (result.status !== 200 || !value || Object.keys(value).length !== 3 || value.ok !== true
      || value.attemptId !== attemptId || !['active', 'completed', 'pending', 'invalid'].includes(String(value.status))) return 'unconfirmed'
    return value.status as AttemptRecovery
  } catch { return 'unconfirmed' }
}

