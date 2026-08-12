import type { AttemptQuestion, AttemptSimulation, PublicSimulationChallenge } from '@/lib/content/public-lesson'
import { readStrictJsonResponse } from '@/lib/http/strict-json-response'
import { SIMULATION_SURFACE_INPUT_FIELDS } from '@/lib/simulation/types'

export type AttemptClientResult =
  | { status: 'ready'; id: string; questions: AttemptQuestion[]; simulations: AttemptSimulation[] }
  | { status: 'failed'; reason: 'quota' | 'access-lost' | 'error'; retryAfterSeconds?: number }

const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_JSON_DEPTH = 16
const MAX_RETRY_AFTER_SECONDS = 30 * 60
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/

const ATTEMPT_KEYS = ['ok', 'attemptId', 'expiresAt', 'questions', 'simulations'] as const
const QUESTION_KEYS = ['kind', 'id', 'prompt', 'choices', 'multiple'] as const
const SIMULATION_KEYS = ['kind', 'id', 'challenge'] as const
const CHALLENGE_KEYS = ['id', 'title', 'brief', 'surface', 'initial', 'requiredFields', 'requirements'] as const
const REQUIRED_FIELDS_KEYS = ['dhcp', 'static'] as const
const REQUIREMENT_KEYS = ['id', 'label'] as const
const RETRY_KEYS = ['ok', 'error', 'retryAfterSeconds'] as const
const NETWORK_INTERFACE_INPUT_FIELDS = new Set(SIMULATION_SURFACE_INPUT_FIELDS['network-interface'])

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function stringArray(value: unknown, maxLength?: number): string[] | null {
  if (
    !Array.isArray(value) ||
    (maxLength !== undefined && value.length > maxLength) ||
    !value.every(nonEmptyString)
  ) return null
  return [...value]
}


function projectQuestion(value: unknown): AttemptQuestion | null {
  const question = plainRecord(value)
  if (!question || !hasExactKeys(question, QUESTION_KEYS)) return null
  const choices = plainRecord(question.choices)
  if (
    question.kind !== 'mcq' ||
    !nonEmptyString(question.id) ||
    !nonEmptyString(question.prompt) ||
    !choices ||
    typeof question.multiple !== 'boolean'
  ) return null
  const choiceEntries = Object.entries(choices)
  if (choiceEntries.length < 2 || !choiceEntries.every(([key, entry]) => key.length > 0 && nonEmptyString(entry))) {
    return null
  }
  return {
    kind: 'mcq',
    id: question.id,
    prompt: question.prompt,
    choices: Object.fromEntries(choiceEntries) as Record<string, string>,
    multiple: question.multiple,
  }
}

function projectChallenge(value: unknown): PublicSimulationChallenge | null {
  const challenge = plainRecord(value)
  if (!challenge || !hasExactKeys(challenge, CHALLENGE_KEYS)) return null
  const initial = plainRecord(challenge.initial)
  const requiredFields = plainRecord(challenge.requiredFields)
  if (
    !nonEmptyString(challenge.id) ||
    !nonEmptyString(challenge.title) ||
    !nonEmptyString(challenge.brief) ||
    challenge.surface !== 'network-interface' ||
    !initial ||
    !requiredFields ||
    !hasExactKeys(requiredFields, REQUIRED_FIELDS_KEYS) ||
    !Array.isArray(challenge.requirements) ||
    challenge.requirements.length === 0
  ) return null

  const initialEntries = Object.entries(initial)
  if (!initialEntries.every(([key, entry]) => key.length > 0 && (typeof entry === 'string' || typeof entry === 'boolean'))) {
    return null
  }
  const dhcp = stringArray(requiredFields.dhcp, 32)
  const staticFields = stringArray(requiredFields.static, 32)
  if (!dhcp || !staticFields) return null
  if (![...dhcp, ...staticFields].every((field) =>
    Object.prototype.hasOwnProperty.call(initial, field) && NETWORK_INTERFACE_INPUT_FIELDS.has(field)
  )) return null

  const requirements: { id: string; label: string }[] = []
  for (const value of challenge.requirements) {
    const requirement = plainRecord(value)
    if (
      !requirement ||
      !hasExactKeys(requirement, REQUIREMENT_KEYS) ||
      !nonEmptyString(requirement.id) ||
      !nonEmptyString(requirement.label)
    ) return null
    requirements.push({ id: requirement.id, label: requirement.label })
  }

  return {
    id: challenge.id,
    title: challenge.title,
    brief: challenge.brief,
    surface: 'network-interface',
    initial: Object.fromEntries(initialEntries) as Record<string, string | boolean>,
    requiredFields: { dhcp, static: staticFields },
    requirements,
  }
}

function projectSimulation(value: unknown): AttemptSimulation | null {
  const simulation = plainRecord(value)
  if (
    !simulation ||
    !hasExactKeys(simulation, SIMULATION_KEYS) ||
    simulation.kind !== 'simulation' ||
    !nonEmptyString(simulation.id)
  ) return null
  const challenge = projectChallenge(simulation.challenge)
  return challenge ? { kind: 'simulation', id: simulation.id, challenge } : null
}

function validExpiry(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const match = RFC3339_TIMESTAMP.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  if (
    month < 1 || month > 12 ||
    day < 1 ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = month === 2
    ? (leapYear ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31)
  return day <= daysInMonth
}

function projectAttempt(value: unknown): AttemptClientResult | null {
  const body = plainRecord(value)
  if (
    !body ||
    !hasExactKeys(body, ATTEMPT_KEYS) ||
    body.ok !== true ||
    typeof body.attemptId !== 'string' ||
    !UUID_V4.test(body.attemptId) ||
    !validExpiry(body.expiresAt) ||
    !Array.isArray(body.questions) ||
    !Array.isArray(body.simulations)
  ) return null

  const questions: AttemptQuestion[] = []
  for (const value of body.questions) {
    const question = projectQuestion(value)
    if (!question) return null
    questions.push(question)
  }
  const simulations: AttemptSimulation[] = []
  for (const value of body.simulations) {
    const simulation = projectSimulation(value)
    if (!simulation) return null
    simulations.push(simulation)
  }
  if (questions.length === 0 && simulations.length === 0) return null

  const taskIds = [...questions, ...simulations].map((task) => task.id)
  if (new Set(taskIds).size !== taskIds.length) return null

  return {
    status: 'ready',
    id: body.attemptId,
    questions,
    simulations,
  }
}

function projectRetryAfter(value: unknown): number | undefined {
  const body = plainRecord(value)
  if (
    !body ||
    !hasExactKeys(body, RETRY_KEYS) ||
    body.ok !== false ||
    !nonEmptyString(body.error) ||
    !Number.isSafeInteger(body.retryAfterSeconds) ||
    (body.retryAfterSeconds as number) < 0 ||
    (body.retryAfterSeconds as number) > MAX_RETRY_AFTER_SECONDS
  ) return undefined
  return body.retryAfterSeconds as number
}

export async function requestLessonAttempt(slug: string, nodeId: string): Promise<AttemptClientResult> {
  try {
    const response = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, nodeId }),
    })
    if (response.status === 401 || response.status === 403) {
      return { status: 'failed', reason: 'access-lost' }
    }
    if (response.status === 429) {
      const parsed = await readStrictJsonResponse(response, {
        maxBytes: MAX_RESPONSE_BYTES,
        maxDepth: MAX_JSON_DEPTH,
      })
      const retryAfterSeconds = parsed.ok ? projectRetryAfter(parsed.value) : undefined
      return retryAfterSeconds === undefined
        ? { status: 'failed', reason: 'quota' }
        : { status: 'failed', reason: 'quota', retryAfterSeconds }
    }
    if (!response.ok) return { status: 'failed', reason: 'error' }

    const parsed = await readStrictJsonResponse(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: MAX_JSON_DEPTH,
    })
    if (!parsed.ok) return { status: 'failed', reason: 'error' }
    return projectAttempt(parsed.value) ?? { status: 'failed', reason: 'error' }
  } catch {
    return { status: 'failed', reason: 'error' }
  }
}
