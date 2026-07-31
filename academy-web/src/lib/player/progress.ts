import type { ExamAnswers } from './scoring'

// Progress ชั่วคราวใน localStorage แบบ versioned (แผน §4-M2-6)
// key ต่อ contentId+attemptId; corrupt → reset พร้อมแจ้ง; retake = attempt ใหม่
// โครง type ออกแบบให้ย้ายไป DB ได้ตอน M3 (email identity → user id)

export const PROGRESS_STORE_VERSION = 'v1'
const PREFIX = `academy.progress.${PROGRESS_STORE_VERSION}`

export type AttemptStatus = 'in-progress' | 'submitted'

export interface AttemptRecord {
  version: typeof PROGRESS_STORE_VERSION
  contentId: string
  attemptId: string
  mode: 'exam' | 'practice'
  /** deadline-based timer — เก็บ timestamp ปลายทาง ไม่ใช่เวลาที่เหลือ (reload แล้วไม่เพี้ยน) */
  endsAt: number | null
  seed: number
  answers: ExamAnswers
  status: AttemptStatus
  startedAt: number
  submittedAt: number | null
}

export interface ProgressStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** สำหรับ listAttempts */
  keys(): string[]
}

export function browserStore(): ProgressStore {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
    keys: () => Object.keys(window.localStorage),
  }
}

function attemptKey(contentId: string, attemptId: string): string {
  return `${PREFIX}:${contentId}:${attemptId}`
}

export interface LoadResult {
  record: AttemptRecord | null
  /** true = พบข้อมูลพังและถูกล้างทิ้ง (UI ต้องแจ้งผู้ใช้) */
  corruptReset: boolean
}

function isValidRecord(value: unknown): value is AttemptRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    r.version === PROGRESS_STORE_VERSION &&
    typeof r.contentId === 'string' &&
    typeof r.attemptId === 'string' &&
    (r.mode === 'exam' || r.mode === 'practice') &&
    (r.endsAt === null || typeof r.endsAt === 'number') &&
    typeof r.seed === 'number' &&
    typeof r.answers === 'object' &&
    r.answers !== null &&
    typeof (r.answers as Record<string, unknown>).mcq === 'object' &&
    typeof (r.answers as Record<string, unknown>).pbq === 'object' &&
    (r.status === 'in-progress' || r.status === 'submitted') &&
    typeof r.startedAt === 'number'
  )
}

export function loadAttempt(store: ProgressStore, contentId: string, attemptId: string): LoadResult {
  const key = attemptKey(contentId, attemptId)
  const raw = store.getItem(key)
  if (raw === null) return { record: null, corruptReset: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidRecord(parsed)) throw new Error('shape ไม่ตรง')
    return { record: parsed, corruptReset: false }
  } catch {
    store.removeItem(key)
    return { record: null, corruptReset: true }
  }
}

export function saveAttempt(store: ProgressStore, record: AttemptRecord): void {
  store.setItem(attemptKey(record.contentId, record.attemptId), JSON.stringify(record))
}

/** attempt ล่าสุดของ content (ใช้ resume) — เรียงตาม startedAt */
export function latestAttempt(store: ProgressStore, contentId: string): LoadResult {
  const prefix = `${PREFIX}:${contentId}:`
  let corrupt = false
  const records: AttemptRecord[] = []
  for (const key of store.keys()) {
    if (!key.startsWith(prefix)) continue
    const attemptId = key.slice(prefix.length)
    const { record, corruptReset } = loadAttempt(store, contentId, attemptId)
    corrupt = corrupt || corruptReset
    if (record) records.push(record)
  }
  records.sort((a, b) => b.startedAt - a.startedAt)
  return { record: records[0] ?? null, corruptReset: corrupt }
}

export function newAttempt(
  contentId: string,
  mode: 'exam' | 'practice',
  options: { timeLimitMinutes?: number; now?: number; seed?: number } = {},
): AttemptRecord {
  const now = options.now ?? Date.now()
  return {
    version: PROGRESS_STORE_VERSION,
    contentId,
    // retake = attempt ใหม่เสมอ ไม่ทับของเก่า (แผน §4-M2-6)
    attemptId: `${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    mode,
    endsAt: options.timeLimitMinutes ? now + options.timeLimitMinutes * 60_000 : null,
    seed: options.seed ?? (now % 2147483647),
    answers: { mcq: {}, pbq: {} },
    status: 'in-progress',
    startedAt: now,
    submittedAt: null,
  }
}

export function isExpired(record: AttemptRecord, now: number = Date.now()): boolean {
  return record.endsAt !== null && now >= record.endsAt
}

export function remainingMs(record: AttemptRecord, now: number = Date.now()): number | null {
  if (record.endsAt === null) return null
  return Math.max(0, record.endsAt - now)
}
