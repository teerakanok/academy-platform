import type { LearnerCourseState } from './roadmap'

// ความคืบหน้าในคอร์ส เก็บใน localStorage แบบมีเวอร์ชัน (เหมือน attempt store ของข้อสอบ)
// ข้อจำกัดที่ต้องพูดตรงๆ: อยู่กับเบราว์เซอร์ตัวนี้เท่านั้น เปลี่ยนเครื่องแล้วหาย —
// การย้ายขึ้น DB ต้องรอ M3 (บัญชีผู้เรียน) ซึ่งติดล็อก ADR single-account อยู่
// โครง type ตั้งใจออกแบบให้ย้ายขึ้น DB ได้โดยไม่ต้องเปลี่ยนหน้าตาข้อมูล

export const COURSE_PROGRESS_VERSION = 'v1'
const PREFIX = `academy.course.${COURSE_PROGRESS_VERSION}`

export interface CourseProgressRecord {
  version: typeof COURSE_PROGRESS_VERSION
  slug: string
  completed: string[]
  skipped: string[]
  testedOut: string[]
  inProgress: string[]
  /** ผลรายข้อของ checkpoint: nodeId → questionId → ถูก/ผิด */
  checkpointResults: Record<string, Record<string, boolean>>
  /** ผลคำถามที่เด้งกลางวิดีโอ: nodeId → cueId → ถูก/ผิด */
  videoCueResults: Record<string, Record<string, boolean>>
  lastNodeId: string | null
  updatedAt: number
}

export interface CourseProgressStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export function browserCourseStore(): CourseProgressStore {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
    keys: () => Object.keys(window.localStorage),
  }
}

const key = (slug: string) => `${PREFIX}:${slug}`

export function emptyProgress(slug: string, now = 0): CourseProgressRecord {
  return {
    version: COURSE_PROGRESS_VERSION,
    slug,
    completed: [],
    skipped: [],
    testedOut: [],
    inProgress: [],
    checkpointResults: {},
    videoCueResults: {},
    lastNodeId: null,
    updatedAt: now,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isBooleanMapMap(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  for (const inner of Object.values(value)) {
    if (!isPlainObject(inner)) return false
    for (const flag of Object.values(inner)) {
      if (typeof flag !== 'boolean') return false
    }
  }
  return true
}

function isValid(value: unknown): value is CourseProgressRecord {
  if (!isPlainObject(value)) return false
  const r = value
  return (
    r.version === COURSE_PROGRESS_VERSION &&
    typeof r.slug === 'string' &&
    isStringArray(r.completed) &&
    isStringArray(r.skipped) &&
    isStringArray(r.testedOut) &&
    isStringArray(r.inProgress) &&
    isBooleanMapMap(r.checkpointResults) &&
    isBooleanMapMap(r.videoCueResults) &&
    (r.lastNodeId === null || typeof r.lastNodeId === 'string') &&
    typeof r.updatedAt === 'number' &&
    Number.isFinite(r.updatedAt)
  )
}

export interface LoadCourseProgress {
  record: CourseProgressRecord
  /** true = พบข้อมูลพังและถูกล้าง — UI ต้องบอกผู้เรียน ไม่ใช่เงียบแล้วเริ่มใหม่ */
  corruptReset: boolean
}

export function loadCourseProgress(store: CourseProgressStore, slug: string): LoadCourseProgress {
  const raw = store.getItem(key(slug))
  if (raw === null) return { record: emptyProgress(slug), corruptReset: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValid(parsed)) throw new Error('shape ไม่ตรง')
    return { record: parsed, corruptReset: false }
  } catch {
    store.removeItem(key(slug))
    return { record: emptyProgress(slug), corruptReset: true }
  }
}

export function saveCourseProgress(store: CourseProgressStore, record: CourseProgressRecord): void {
  store.setItem(key(record.slug), JSON.stringify(record))
}

export function toLearnerState(record: CourseProgressRecord): LearnerCourseState {
  return {
    completed: record.completed,
    skipped: record.skipped,
    testedOut: record.testedOut,
    inProgress: record.inProgress,
  }
}

function without(list: string[], id: string): string[] {
  return list.filter((x) => x !== id)
}

/** ย้าย node ไปสถานะใหม่ — สถานะพวกนี้ต้อง exclusive ต่อกันเสมอ */
function place(
  record: CourseProgressRecord,
  nodeId: string,
  bucket: 'completed' | 'skipped' | 'testedOut' | 'inProgress' | 'none',
  now: number,
): CourseProgressRecord {
  const next: CourseProgressRecord = {
    ...record,
    completed: without(record.completed, nodeId),
    skipped: without(record.skipped, nodeId),
    testedOut: without(record.testedOut, nodeId),
    inProgress: without(record.inProgress, nodeId),
    lastNodeId: nodeId,
    updatedAt: now,
  }
  if (bucket !== 'none') next[bucket] = [...next[bucket], nodeId]
  return next
}

export function markStarted(record: CourseProgressRecord, nodeId: string, now = Date.now()): CourseProgressRecord {
  // เริ่มบทที่จบไปแล้วไม่ควรลดสถานะลง — แค่จำว่าอยู่ตรงนี้ล่าสุด
  if (record.completed.includes(nodeId) || record.testedOut.includes(nodeId)) {
    return { ...record, lastNodeId: nodeId, updatedAt: now }
  }
  return place(record, nodeId, 'inProgress', now)
}

export function markCompleted(
  record: CourseProgressRecord,
  nodeId: string,
  checkpointResults: Record<string, boolean>,
  now = Date.now(),
): CourseProgressRecord {
  const next = place(record, nodeId, 'completed', now)
  return {
    ...next,
    checkpointResults: { ...next.checkpointResults, [nodeId]: checkpointResults },
  }
}

export function markSkipped(record: CourseProgressRecord, nodeId: string, now = Date.now()): CourseProgressRecord {
  return place(record, nodeId, 'skipped', now)
}

export function markTestedOut(
  record: CourseProgressRecord,
  nodeId: string,
  checkpointResults: Record<string, boolean>,
  now = Date.now(),
): CourseProgressRecord {
  const next = place(record, nodeId, 'testedOut', now)
  return {
    ...next,
    checkpointResults: { ...next.checkpointResults, [nodeId]: checkpointResults },
  }
}

export function recordVideoCue(
  record: CourseProgressRecord,
  nodeId: string,
  cueId: string,
  correct: boolean,
  now = Date.now(),
): CourseProgressRecord {
  return {
    ...record,
    videoCueResults: {
      ...record.videoCueResults,
      [nodeId]: { ...(record.videoCueResults[nodeId] ?? {}), [cueId]: correct },
    },
    updatedAt: now,
  }
}

export function resetCourse(store: CourseProgressStore, slug: string): void {
  store.removeItem(key(slug))
}
