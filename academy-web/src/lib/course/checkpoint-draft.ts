import { SIMULATION_SURFACE_INPUT_FIELDS, type SimulationState, type SimulationSurface } from '@/lib/simulation/types'

const PREFIX = 'academy.checkpoint-draft:v1'

export interface CheckpointDraftStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Browser storage is optional; privacy policy and sandboxing may deny even reading it. */
export function browserCheckpointDraftStore(): CheckpointDraftStore | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export interface CheckpointDraftScope {
  courseSlug: string
  nodeId: string
  attemptId: string
}

export interface CheckpointDraftQuestion {
  id: string
  choices: Record<string, string>
}

export interface CheckpointDraftSimulation {
  id: string
  surface: SimulationSurface
  initial: SimulationState
}

export interface CheckpointDraft {
  answers: Record<string, string[]>
  simulations: Record<string, SimulationState>
}

interface StoredCheckpointDraft {
  version: 1
  answers: Record<string, unknown>
  simulations: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownStringArray(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && allowed.has(entry)))].sort()
}

function cleanAnswers(raw: Record<string, unknown>, questions: readonly CheckpointDraftQuestion[]): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const question of questions) {
    const answers = ownStringArray(raw[question.id], new Set(Object.keys(question.choices)))
    if (answers.length > 0) result[question.id] = answers
  }
  return result
}

function cleanSimulation(raw: unknown, simulation: CheckpointDraftSimulation): SimulationState {
  const result: SimulationState = { ...simulation.initial }
  if (!isRecord(raw)) return result

  const allowed = new Set([
    ...Object.keys(simulation.initial),
    ...SIMULATION_SURFACE_INPUT_FIELDS[simulation.surface],
    'addressMode',
    'applied',
  ])
  for (const [field, value] of Object.entries(raw)) {
    if (!allowed.has(field) || (typeof value !== 'string' && typeof value !== 'boolean')) continue
    const initial = simulation.initial[field]
    if (initial !== undefined && typeof value !== typeof initial) continue
    if (initial === undefined && field === 'applied' && typeof value !== 'boolean') continue
    if (initial === undefined && field !== 'applied' && typeof value !== 'string') continue
    result[field] = value
  }
  return result
}

function cleanDraft(
  raw: StoredCheckpointDraft,
  questions: readonly CheckpointDraftQuestion[],
  simulations: readonly CheckpointDraftSimulation[],
): CheckpointDraft {
  return {
    answers: cleanAnswers(raw.answers, questions),
    simulations: Object.fromEntries(simulations.map((simulation) => [
      simulation.id,
      cleanSimulation(raw.simulations[simulation.id], simulation),
    ])),
  }
}

export function checkpointDraftKey(scope: CheckpointDraftScope): string {
  return `${PREFIX}:${encodeURIComponent(scope.courseSlug)}:${encodeURIComponent(scope.nodeId)}:${encodeURIComponent(scope.attemptId)}`
}

export function loadCheckpointDraft(
  store: CheckpointDraftStore,
  scope: CheckpointDraftScope,
  questions: readonly CheckpointDraftQuestion[],
  simulations: readonly CheckpointDraftSimulation[],
): CheckpointDraft | null {
  const key = checkpointDraftKey(scope)
  let value: string | null
  try {
    value = store.getItem(key)
  } catch {
    return null
  }
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.answers) || !isRecord(parsed.simulations)) {
      clearCheckpointDraft(store, scope)
      return null
    }
    return cleanDraft({ version: 1, answers: parsed.answers, simulations: parsed.simulations }, questions, simulations)
  } catch {
    clearCheckpointDraft(store, scope)
    return null
  }
}

export function saveCheckpointDraft(
  store: CheckpointDraftStore,
  scope: CheckpointDraftScope,
  questions: readonly CheckpointDraftQuestion[],
  simulations: readonly CheckpointDraftSimulation[],
  draft: CheckpointDraft,
): void {
  const clean = cleanDraft({ version: 1, ...draft }, questions, simulations)
  try {
    store.setItem(checkpointDraftKey(scope), JSON.stringify({ version: 1, ...clean }))
  } catch {
    // Browser storage is best-effort UX only. The attempt and grading authority stay server-side.
  }
}

export function clearCheckpointDraft(store: CheckpointDraftStore, scope: CheckpointDraftScope): void {
  try {
    store.removeItem(checkpointDraftKey(scope))
  } catch {
    // Storage denial must not prevent the learner from continuing.
  }
}
