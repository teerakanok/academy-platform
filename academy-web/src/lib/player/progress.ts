import type { ExamAnswers } from './scoring'

// Progress ชั่วคราวใน localStorage แบบ versioned (แผน §4-M2-6)
// k2 key ต่อ contentId+attemptId; legacy copy เมื่อผูก scope ได้; attributable corrupt → reset
// โครง type ออกแบบให้ย้ายไป DB ได้ตอน M3 (email identity → user id)

export const PROGRESS_STORE_VERSION = 'v1'
const LEGACY_PREFIX = `academy.progress.${PROGRESS_STORE_VERSION}`
const KEY_PREFIX = 'academy.progress.k2:'

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

function encodeKeySegment(value: string): string {
  return `${value.length}:${value}`
}

function attemptKey(contentId: string, attemptId: string): string {
  return `${KEY_PREFIX}${encodeKeySegment(contentId)}${encodeKeySegment(attemptId)}`
}

function legacyAttemptKey(contentId: string, attemptId: string): string {
  return `${LEGACY_PREFIX}:${contentId}:${attemptId}`
}

interface ParsedAttemptKey {
  contentId: string
  attemptId: string
}

function readKeySegment(input: string, offset: number): { value: string; next: number } | null {
  const separator = input.indexOf(':', offset)
  if (separator < 0) return null
  const lengthText = input.slice(offset, separator)
  if (!/^(0|[1-9][0-9]*)$/.test(lengthText)) return null
  const length = Number(lengthText)
  if (!Number.isSafeInteger(length)) return null
  const start = separator + 1
  const end = start + length
  if (end > input.length) return null
  return { value: input.slice(start, end), next: end }
}

function parseAttemptKey(key: string): ParsedAttemptKey | null {
  if (!key.startsWith(KEY_PREFIX)) return null
  const body = key.slice(KEY_PREFIX.length)
  const content = readKeySegment(body, 0)
  if (!content) return null
  const attempt = readKeySegment(body, content.next)
  if (!attempt || attempt.next !== body.length) return null
  return { contentId: content.value, attemptId: attempt.value }
}

export interface LoadResult {
  record: AttemptRecord | null
  /** true = พบข้อมูลพังและถูกล้างทิ้ง (UI ต้องแจ้งผู้ใช้) */
  corruptReset: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string')
}

// validation ต้องลึกถึงคำตอบทุก entry — shallow typeof เคยปล่อย answers.mcq=null
// ผ่าน (typeof null === 'object') แล้วไป crash ใน player แทนที่จะ reset+แจ้ง
// (finding review lane)
function isValidRecord(value: unknown): value is AttemptRecord {
  if (!isPlainObject(value)) return false
  const r = value
  if (r.version !== PROGRESS_STORE_VERSION) return false
  if (typeof r.contentId !== 'string' || typeof r.attemptId !== 'string') return false
  if (r.mode !== 'exam' && r.mode !== 'practice') return false
  if (r.endsAt !== null && !(typeof r.endsAt === 'number' && Number.isFinite(r.endsAt))) return false
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return false
  if (r.status !== 'in-progress' && r.status !== 'submitted') return false
  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt)) return false
  if (r.submittedAt !== null && !(typeof r.submittedAt === 'number' && Number.isFinite(r.submittedAt))) return false

  if (!isPlainObject(r.answers)) return false
  const { mcq, pbq } = r.answers as Record<string, unknown>
  if (!isPlainObject(mcq) || !isPlainObject(pbq)) return false
  for (const answer of Object.values(mcq)) {
    if (answer !== undefined && !isStringArray(answer)) return false
  }
  for (const fields of Object.values(pbq)) {
    if (!isPlainObject(fields)) return false
    for (const fieldAnswer of Object.values(fields)) {
      if (fieldAnswer !== undefined && typeof fieldAnswer !== 'string' && !isStringArray(fieldAnswer)) {
        return false
      }
    }
  }
  return true
}

function parseRecord(raw: string): AttemptRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isValidRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function loadExactK2Attempt(
  store: ProgressStore,
  key: string,
  contentId: string,
  attemptId: string,
): LoadResult {
  const raw = store.getItem(key)
  if (raw === null) return { record: null, corruptReset: false }
  const parsed = parseRecord(raw)
  if (!parsed || parsed.contentId !== contentId || parsed.attemptId !== attemptId) {
    store.removeItem(key)
    return { record: null, corruptReset: true }
  }
  return { record: parsed, corruptReset: false }
}

function copyLegacyRecord(store: ProgressStore, record: AttemptRecord, raw: string): void {
  try {
    store.setItem(attemptKey(record.contentId, record.attemptId), raw)
  } catch {
    // Loading remains available when best-effort browser storage migration is denied.
  }
}

export function loadAttempt(store: ProgressStore, contentId: string, attemptId: string): LoadResult {
  const key = attemptKey(contentId, attemptId)
  if (store.getItem(key) !== null) return loadExactK2Attempt(store, key, contentId, attemptId)

  const legacyKey = legacyAttemptKey(contentId, attemptId)
  const legacyRaw = store.getItem(legacyKey)
  if (legacyRaw === null) return { record: null, corruptReset: false }
  const legacyRecord = parseRecord(legacyRaw)
  if (
    !legacyRecord
    || legacyRecord.contentId !== contentId
    || legacyRecord.attemptId !== attemptId
  ) {
    return { record: null, corruptReset: false }
  }
  copyLegacyRecord(store, legacyRecord, legacyRaw)
  return { record: legacyRecord, corruptReset: false }
}

export function saveAttempt(store: ProgressStore, record: AttemptRecord): void {
  store.setItem(attemptKey(record.contentId, record.attemptId), JSON.stringify(record))
}

/** attempt ล่าสุดของ content — startedAt desc, attemptId code-unit asc */
export function latestAttempt(store: ProgressStore, contentId: string): LoadResult {
  let corrupt = false
  const recordsByAttempt = new Map<string, AttemptRecord>()
  const keys = store.keys()

  for (const key of keys) {
    const parsedKey = parseAttemptKey(key)
    if (!parsedKey || parsedKey.contentId !== contentId) continue
    const { record, corruptReset } = loadExactK2Attempt(
      store,
      key,
      parsedKey.contentId,
      parsedKey.attemptId,
    )
    corrupt = corrupt || corruptReset
    if (record) recordsByAttempt.set(record.attemptId, record)
  }

  for (const key of keys) {
    if (!key.startsWith(`${LEGACY_PREFIX}:`)) continue
    const raw = store.getItem(key)
    if (raw === null) continue
    const record = parseRecord(raw)
    if (
      !record
      || record.contentId !== contentId
      || key !== legacyAttemptKey(record.contentId, record.attemptId)
      || recordsByAttempt.has(record.attemptId)
    ) {
      continue
    }

    const newKey = attemptKey(record.contentId, record.attemptId)
    if (store.getItem(newKey) !== null) {
      const k2Result = loadExactK2Attempt(store, newKey, record.contentId, record.attemptId)
      corrupt = corrupt || k2Result.corruptReset
      if (k2Result.record) {
        recordsByAttempt.set(record.attemptId, k2Result.record)
        continue
      }
    }
    copyLegacyRecord(store, record, raw)
    recordsByAttempt.set(record.attemptId, record)
  }

  const records = [...recordsByAttempt.values()]
  records.sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt > b.startedAt ? -1 : 1
    // Explicit locale-independent direction: ascending UTF-16 code-unit order.
    if (a.attemptId === b.attemptId) return 0
    return a.attemptId < b.attemptId ? -1 : 1
  })
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
