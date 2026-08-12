import type { Locale } from '@/lib/content/course-types'
import { cancelResponseBody, readStrictJsonResponse } from '@/lib/http/strict-json-response'
import type { SkillDatum } from './skills'

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_JSON_DEPTH = 8
const RESPONSE_KEYS = ['ok', 'coverage'] as const
const COVERAGE_KEYS = ['id', 'label', 'value', 'notStarted'] as const

function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
}

function projectCoverage(value: unknown): SkillDatum[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const ids = new Set<string>()
  const coverage: SkillDatum[] = []
  for (const item of value) {
    const record = plainRecord(item)
    if (
      !record ||
      !hasExactKeys(record, COVERAGE_KEYS) ||
      typeof record.id !== 'string' ||
      record.id.length === 0 ||
      ids.has(record.id) ||
      typeof record.label !== 'string' ||
      record.label.length === 0 ||
      !Number.isSafeInteger(record.value) ||
      (record.value as number) < 0 ||
      (record.value as number) > 100 ||
      typeof record.notStarted !== 'boolean' ||
      (record.notStarted && record.value !== 0)
    ) return null

    ids.add(record.id)
    coverage.push({
      id: record.id,
      label: record.label,
      value: record.value as number,
      notStarted: record.notStarted,
    })
  }
  return coverage
}

function projectSkillMap(value: unknown): SkillMapLoadResult | null {
  const body = plainRecord(value)
  if (!body || !hasExactKeys(body, RESPONSE_KEYS) || body.ok !== true) return null
  const coverage = projectCoverage(body.coverage)
  return coverage ? { ok: true, coverage } : null
}

function requestTimeoutMs(requestedTimeoutMs: number | undefined): number {
  if (!Number.isSafeInteger(requestedTimeoutMs) || (requestedTimeoutMs ?? 0) <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS
  }
  return Math.min(requestedTimeoutMs as number, DEFAULT_REQUEST_TIMEOUT_MS)
}

function deadlineError(): DOMException {
  return new DOMException('Course skill-map request deadline exceeded', 'TimeoutError')
}

export type SkillMapLoadResult =
  | { ok: true; coverage: SkillDatum[] }
  | { ok: false; reason: 'signed-out' | 'access-lost' | 'unavailable' }

/** Fetches a fully derived learner-only topic map. Invalid or denied responses never become chart data. */
export async function fetchCourseSkillMap(
  slug: string,
  locale: Locale,
  options: { responseTimeoutMs?: number } = {},
): Promise<SkillMapLoadResult> {
  const timeoutMs = requestTimeoutMs(options.responseTimeoutMs)
  const deadlineAt = Date.now() + timeoutMs
  const deadlineController = new AbortController()
  const timeout = setTimeout(() => deadlineController.abort(deadlineError()), timeoutMs)
  try {
    const response = await fetch(`/api/courses/${encodeURIComponent(slug)}/skill-map?lang=${locale}`, {
      cache: 'no-store',
      signal: deadlineController.signal,
    })
    if (response.status === 401) {
      cancelResponseBody(response)
      return { ok: false, reason: 'signed-out' }
    }
    if (response.status === 403) {
      cancelResponseBody(response)
      return { ok: false, reason: 'access-lost' }
    }
    if (!response.ok) {
      cancelResponseBody(response)
      return { ok: false, reason: 'unavailable' }
    }

    const remainingMs = deadlineAt - Date.now()
    if (remainingMs <= 0 || deadlineController.signal.aborted) {
      deadlineController.abort(deadlineController.signal.reason ?? deadlineError())
      cancelResponseBody(response, deadlineController.signal.reason)
      return { ok: false, reason: 'unavailable' }
    }
    const parsed = await readStrictJsonResponse(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: MAX_JSON_DEPTH,
      signal: deadlineController.signal,
      timeoutMs: remainingMs,
    })
    return parsed.ok
      ? projectSkillMap(parsed.value) ?? { ok: false, reason: 'unavailable' }
      : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}
