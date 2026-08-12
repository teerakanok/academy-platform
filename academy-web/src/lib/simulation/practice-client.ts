import type { PublicSimulationRequirement } from '@/lib/content/public-lesson'
import { cancelResponseBody, readStrictJsonResponse } from '@/lib/http/strict-json-response'
import type { SimulationState } from './types'

const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_JSON_DEPTH = 16
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000
const CAPSTONE_KEYS = ['ok', 'passed'] as const
const REGULAR_KEYS = ['ok', 'passed', 'results', 'metCount', 'total'] as const
const REGULAR_OPTIONAL_KEYS = ['debrief', 'hints'] as const
const RESULT_KEYS = ['id', 'label', 'met'] as const

export type PracticeSimulationResponseVariant = 'regular' | 'capstone'

export interface PracticeSimulationInput {
  slug: string
  nodeId: string
  challengeId: string
  state: SimulationState
  wantHint: boolean
  requirements: readonly PublicSimulationRequirement[]
  responseVariant: PracticeSimulationResponseVariant
}

export interface PracticeVerdict {
  passed: boolean
  results?: { id: string; label: string; met: boolean }[]
  metCount?: number
  total?: number
  debrief?: string
  hints?: string[]
}

export type PracticeSimulationResult =
  | { status: 'ready'; verdict: PracticeVerdict }
  | { status: 'failed' }

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  )
}

function hasOnlyRegularKeys(value: Record<string, unknown>): boolean {
  const allowed = new Set<string>([...REGULAR_KEYS, ...REGULAR_OPTIONAL_KEYS])
  const keys = Object.keys(value)
  return REGULAR_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function projectVerdict(
  value: unknown,
  requirements: readonly PublicSimulationRequirement[],
  wantHint: boolean,
  responseVariant: PracticeSimulationResponseVariant,
): PracticeVerdict | null {
  const body = plainRecord(value)
  if (!body || body.ok !== true || typeof body.passed !== 'boolean') return null

  if (responseVariant === 'capstone') {
    return hasExactKeys(body, CAPSTONE_KEYS) ? { passed: body.passed } : null
  }
  if (responseVariant !== 'regular' || hasExactKeys(body, CAPSTONE_KEYS)) return null
  if (!hasOnlyRegularKeys(body) || !Array.isArray(body.results)) return null

  const expectedIds = new Set<string>()
  if (
    requirements.length === 0 ||
    !requirements.every((requirement) => {
      if (!nonEmptyString(requirement.id) || !nonEmptyString(requirement.label) || expectedIds.has(requirement.id)) {
        return false
      }
      expectedIds.add(requirement.id)
      return true
    }) ||
    body.results.length !== requirements.length
  ) return null

  const results: NonNullable<PracticeVerdict['results']> = []
  for (const [index, value] of body.results.entries()) {
    const result = plainRecord(value)
    const expected = requirements[index]
    if (
      !result ||
      !hasExactKeys(result, RESULT_KEYS) ||
      result.id !== expected.id ||
      result.label !== expected.label ||
      typeof result.met !== 'boolean'
    ) return null
    results.push({ id: expected.id, label: expected.label, met: result.met })
  }

  const metCount = results.filter((result) => result.met).length
  if (
    !Number.isSafeInteger(body.metCount) ||
    !Number.isSafeInteger(body.total) ||
    body.metCount !== metCount ||
    body.total !== results.length ||
    body.passed !== (metCount === results.length)
  ) return null

  const hasDebrief = Object.prototype.hasOwnProperty.call(body, 'debrief')
  if (hasDebrief && (!body.passed || !nonEmptyString(body.debrief))) return null

  const hasHints = Object.prototype.hasOwnProperty.call(body, 'hints')
  if (
    hasHints && (
      body.passed ||
      !wantHint ||
      !Array.isArray(body.hints) ||
      body.hints.length === 0 ||
      !body.hints.every(nonEmptyString)
    )
  ) return null

  return {
    passed: body.passed,
    results,
    metCount,
    total: results.length,
    ...(hasDebrief ? { debrief: body.debrief as string } : {}),
    ...(hasHints ? { hints: [...body.hints as string[]] } : {}),
  }
}

function requestTimeoutMs(requestedTimeoutMs: number | undefined): number {
  if (!Number.isSafeInteger(requestedTimeoutMs) || (requestedTimeoutMs ?? 0) <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS
  }
  return Math.min(requestedTimeoutMs as number, DEFAULT_REQUEST_TIMEOUT_MS)
}

function deadlineError(): DOMException {
  return new DOMException('Practice simulation request deadline exceeded', 'TimeoutError')
}

export async function requestPracticeSimulation(
  input: PracticeSimulationInput,
  options: { responseTimeoutMs?: number } = {},
): Promise<PracticeSimulationResult> {
  const timeoutMs = requestTimeoutMs(options.responseTimeoutMs)
  const deadlineAt = Date.now() + timeoutMs
  const deadlineController = new AbortController()
  const timeout = setTimeout(() => deadlineController.abort(deadlineError()), timeoutMs)
  try {
    const response = await fetch('/api/practice/simulation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: deadlineController.signal,
      body: JSON.stringify({
        slug: input.slug,
        nodeId: input.nodeId,
        challengeId: input.challengeId,
        state: input.state,
        wantHint: input.wantHint,
      }),
    })
    if (!response.ok) {
      cancelResponseBody(response)
      return { status: 'failed' }
    }
    const remainingMs = deadlineAt - Date.now()
    if (remainingMs <= 0 || deadlineController.signal.aborted) {
      deadlineController.abort(deadlineController.signal.reason ?? deadlineError())
      cancelResponseBody(response, deadlineController.signal.reason)
      return { status: 'failed' }
    }
    const parsed = await readStrictJsonResponse(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: MAX_JSON_DEPTH,
      signal: deadlineController.signal,
      timeoutMs: remainingMs,
    })
    if (!parsed.ok) return { status: 'failed' }
    const verdict = projectVerdict(
      parsed.value,
      input.requirements,
      input.wantHint,
      input.responseVariant,
    )
    return verdict ? { status: 'ready', verdict } : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  } finally {
    clearTimeout(timeout)
  }
}
