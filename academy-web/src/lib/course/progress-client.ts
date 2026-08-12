import {
  cancelResponseBody,
  readStrictJsonResponse,
} from '@/lib/http/strict-json-response'

const PROGRESS_RESPONSE_VERSION = 'v1' as const
const MAX_PROGRESS_RESPONSE_BYTES = 256 * 1024
const MAX_PROGRESS_RESPONSE_DEPTH = 16

export interface ProgressResponseRecord {
  version: typeof PROGRESS_RESPONSE_VERSION
  slug: string
  completed: string[]
  skipped: string[]
  testedOut: string[]
  inProgress: string[]
  checkpointResults: Record<string, Record<string, boolean>>
  videoCueResults: Record<string, Record<string, boolean>>
  simulationEvidence: Record<string, Record<string, unknown>>
  lastNodeId: string | null
  updatedAt: number
}

const PROGRESS_RECORD_KEYS = [
  'version',
  'slug',
  'completed',
  'skipped',
  'testedOut',
  'inProgress',
  'checkpointResults',
  'videoCueResults',
  'simulationEvidence',
  'lastNodeId',
  'updatedAt',
] as const

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : null
}

function booleanMapMap(value: unknown): Record<string, Record<string, boolean>> | null {
  const outer = plainRecord(value)
  if (!outer) return null
  const projected: [string, Record<string, boolean>][] = []
  for (const [outerKey, innerValue] of Object.entries(outer)) {
    const inner = plainRecord(innerValue)
    if (!inner || !Object.values(inner).every((entry) => typeof entry === 'boolean')) return null
    projected.push([outerKey, Object.fromEntries(Object.entries(inner)) as Record<string, boolean>])
  }
  return Object.fromEntries(projected)
}

type JsonProjection = { ok: true; value: unknown } | { ok: false }

function jsonProjection(value: unknown): JsonProjection {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false }
  if (Array.isArray(value)) {
    const projected: unknown[] = []
    for (const entry of value) {
      const item = jsonProjection(entry)
      if (!item.ok) return item
      projected.push(item.value)
    }
    return { ok: true, value: projected }
  }
  const record = plainRecord(value)
  if (!record) return { ok: false }
  const projected: [string, unknown][] = []
  for (const [key, entry] of Object.entries(record)) {
    const item = jsonProjection(entry)
    if (!item.ok) return item
    projected.push([key, item.value])
  }
  return { ok: true, value: Object.fromEntries(projected) }
}

function simulationEvidenceMap(value: unknown): Record<string, Record<string, unknown>> | null {
  const outer = plainRecord(value)
  if (!outer) return null
  const projected: [string, Record<string, unknown>][] = []
  for (const [nodeId, evidenceValue] of Object.entries(outer)) {
    const evidence = plainRecord(evidenceValue)
    if (!evidence) return null
    const cloned = jsonProjection(evidence)
    if (!cloned.ok) return null
    projected.push([nodeId, cloned.value as Record<string, unknown>])
  }
  return Object.fromEntries(projected)
}

export function projectProgressRecord(value: unknown, slug: string): ProgressResponseRecord | null {
  const record = plainRecord(value)
  if (!record || !hasExactKeys(record, PROGRESS_RECORD_KEYS)) return null
  const completed = stringArray(record.completed)
  const skipped = stringArray(record.skipped)
  const testedOut = stringArray(record.testedOut)
  const inProgress = stringArray(record.inProgress)
  const checkpointResults = booleanMapMap(record.checkpointResults)
  const videoCueResults = booleanMapMap(record.videoCueResults)
  const simulationEvidence = simulationEvidenceMap(record.simulationEvidence)
  if (
    record.version !== PROGRESS_RESPONSE_VERSION ||
    record.slug !== slug ||
    !completed ||
    !skipped ||
    !testedOut ||
    !inProgress ||
    !checkpointResults ||
    !videoCueResults ||
    !simulationEvidence ||
    (record.lastNodeId !== null && typeof record.lastNodeId !== 'string') ||
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt)
  ) return null

  return {
    version: PROGRESS_RESPONSE_VERSION,
    slug: record.slug,
    completed,
    skipped,
    testedOut,
    inProgress,
    checkpointResults,
    videoCueResults,
    simulationEvidence,
    lastNodeId: record.lastNodeId,
    updatedAt: record.updatedAt,
  }
}

// ฝั่งเบราว์เซอร์คุยกับความคืบหน้าที่เก็บในบัญชี
//
// เดิมเก็บใน localStorage ซึ่งอยู่ติดเครื่อง — เปลี่ยนเครื่องแล้วหาย และออกใบรับรอง
// ไม่ได้เพราะไม่รู้ว่าใครเป็นคนทำ ตอนนี้ทุกอย่างผูกกับบัญชี
//
// UI ยังอัปเดตทันทีในเครื่อง (optimistic) แล้วค่อยยิงบันทึก — ผู้เรียนไม่ควรต้องรอ
// network ระหว่างกดตอบคำถาม แต่ถ้าบันทึกไม่สำเร็จต้อง **บอกให้รู้** ไม่ใช่เงียบ

export interface ProgressSyncFailure {
  nodeId: string
  message: string
  accessLost?: boolean
  /**
   * โจทย์ชุดนี้ใช้ไม่ได้แล้ว (หมดอายุ / ถูกใช้ไปแล้ว) — ต้องเริ่มด้วยโจทย์ชุดใหม่
   *
   * ต้องแยกจากความล้มเหลวทั่วไป เพราะทางออกคนละทาง: อันนี้กด "ลองใหม่" ด้วยคำขอ
   * เดิมกี่ครั้งก็ได้ 409 เหมือนเดิม (RIL cross-model รอบ 2 เดินเคสให้ดู)
   */
  needsNewAttempt?: boolean
  /** claim อื่นกำลัง/เพิ่งบันทึกผลของใบเดียวกัน ต้อง reconcile ก่อนออกใบใหม่ */
  claimReplaced?: boolean
  /** validation ของ simulation ที่ยังใช้ attempt เดิมได้; แสดงใกล้ปุ่ม ไม่ใช่ sync alert */
  simulationIncomplete?: boolean
}

export type ProgressLoadResult =
  { ok: true; record: ProgressResponseRecord } | { ok: false; reason: 'signed-out' | 'access-lost' | 'unavailable' }

function progressLoadRecord(value: unknown, slug: string): ProgressResponseRecord | null {
  const body = plainRecord(value)
  return body && hasExactKeys(body, ['ok', 'record']) && body.ok === true
    ? projectProgressRecord(body.record, slug)
    : null
}

function resetReceiptRecord(value: unknown, slug: string): ProgressResponseRecord | null {
  const body = plainRecord(value)
  return body && hasExactKeys(body, ['ok', 'completed', 'record']) && body.ok === true && body.completed === true
    ? projectProgressRecord(body.record, slug)
    : null
}

async function readProgressJson(response: Response): Promise<unknown | null> {
  const parsed = await readStrictJsonResponse(response, {
    maxBytes: MAX_PROGRESS_RESPONSE_BYTES,
    maxDepth: MAX_PROGRESS_RESPONSE_DEPTH,
  })
  return parsed.ok ? parsed.value : null
}

export async function fetchProgress(slug: string): Promise<ProgressLoadResult> {
  try {
    const res = await fetch(`/api/progress?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    if (res.status === 401) {
      cancelResponseBody(res)
      return { ok: false, reason: 'signed-out' }
    }
    if (res.status === 403) {
      cancelResponseBody(res)
      return { ok: false, reason: 'access-lost' }
    }
    if (!res.ok) {
      cancelResponseBody(res)
      return { ok: false, reason: 'unavailable' }
    }
    const record = progressLoadRecord(await readProgressJson(res), slug)
    return record ? { ok: true, record } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export type ResetProgressResult =
  | { ok: true; record: ProgressResponseRecord; reconciled: boolean }
  | {
      ok: false
      reason: 'access-lost' | 'completed-unavailable' | 'unknown'
    }

/** ตรวจ receipt ของ operation เดิมเท่านั้น ไม่เดาผล reset จาก record ปัจจุบัน */
export async function reconcileCourseReset(slug: string, operationId: string): Promise<ResetProgressResult> {
  try {
    const response = await fetch(
      `/api/progress/reset?slug=${encodeURIComponent(slug)}&operationId=${encodeURIComponent(operationId)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) {
      cancelResponseBody(response)
      return { ok: false, reason: 'unknown' }
    }
    const record = resetReceiptRecord(await readProgressJson(response), slug)
    return record ? { ok: true, record, reconciled: true } : { ok: false, reason: 'unknown' }
  } catch {
    return { ok: false, reason: 'unknown' }
  }
}

/**
 * ล้าง progress แล้วอ่านกลับเมื่อ response ไม่ยืนยันผล
 *
 * network error ไม่ได้แปลว่า mutation ล้มเหลว เพราะ response อาจหายหลัง DB commit
 * จึงห้ามสร้าง empty state หรือประกาศ failure เองจนกว่า GET จะบอกสถานะจริง
 */
export async function resetCourseProgress(slug: string, operationId: string): Promise<ResetProgressResult> {
  try {
    const response = await fetch(
      `/api/progress/reset?slug=${encodeURIComponent(slug)}&operationId=${encodeURIComponent(operationId)}`,
      { method: 'POST' },
    )
    if (response.status === 401 || response.status === 403) {
      cancelResponseBody(response)
      return { ok: false, reason: 'access-lost' }
    }
    const body = response.ok ? await readProgressJson(response) : null
    if (!response.ok) cancelResponseBody(response)
    const receipt = plainRecord(body)
    if (response.ok && receipt && hasExactKeys(receipt, ['ok']) && receipt.ok === true) {
      const current = await reconcileCourseReset(slug, operationId)
      return current.ok ? { ...current, reconciled: false } : { ok: false, reason: 'completed-unavailable' }
    }
  } catch {
    // อ่านสถานะจริงด้านล่าง; ห้ามตีความ transport failure เป็น mutation failure
  }

  return reconcileCourseReset(slug, operationId)
}

/**
 * แจ้งสิ่งที่ผู้เรียนทำ — ไม่ใช่ผลลัพธ์
 *
 * เดิมฟังก์ชันนี้ส่ง status: 'completed' ไปตรงๆ ซึ่งแปลว่า client เป็นคนตัดสินว่า
 * ตัวเองผ่าน พิสูจน์แล้วว่ายิง 10 request ก็ได้ครบทั้งคอร์สโดยไม่ตอบอะไรเลย
 * ตอนนี้เซิร์ฟเวอร์ตรวจคำตอบเองจากเฉลยที่ไม่เคยออกไปฝั่ง client
 */
export type ProgressAction =
  | { action: 'open'; slug: string; nodeId: string }
  | { action: 'skip'; slug: string; nodeId: string }
  | {
      action: 'checkpoint'
      slug: string
      nodeId: string
      mode: 'learn' | 'test-out'
      answers: Record<string, string[]>
      /** สถานะหน้าจอของด่านจำลองแต่ละตัว — เซิร์ฟเวอร์ตรวจเองจาก requirements (W1) */
      simulations?: Record<string, Record<string, string | boolean>>
      /** attempt ที่กำลังทำอยู่ — บังคับเมื่อบทมีโจทย์จำลองที่ค่าเป้าหมายถูกสุ่ม (W1) */
      attemptId?: string
    }
  | {
      action: 'video-cue'
      slug: string
      nodeId: string
      cueId: string
      answer: string[]
    }

/**
 * ผลการตรวจที่เซิร์ฟเวอร์ตอบกลับ
 *
 * ⚠️ โหมด assessed (capstone / test-out) จะมี **แค่ `passed`** — ไม่มีผลรายข้อ
 * ไม่มีจำนวนที่ถูก ไม่มีคำอธิบาย (ดูเหตุผลใน `api/progress/route.ts`) UI จึงต้อง
 * ทำงานได้โดยไม่พึ่ง field ที่เหลือเสมอ ไม่ใช่ถือว่ามันมาแน่
 */
export interface CheckpointOutcome {
  passed: boolean
  results?: Record<string, boolean>
  correctCount?: number
  total?: number
  explanations?: Record<string, string>
}

export interface VideoCueOutcome {
  correct: boolean
  explanation?: string
}

type ProgressFailureCode =
  | 'attempt-invalid'
  | 'claim-replaced'
  | 'progress-stale'
  | 'simulation-incomplete'

const FAILURE_CODES = new Set<ProgressFailureCode>([
  'attempt-invalid',
  'claim-replaced',
  'progress-stale',
  'simulation-incomplete',
])

function booleanRecord(value: unknown): Record<string, boolean> | null {
  const record = plainRecord(value)
  if (!record || !Object.values(record).every((entry) => typeof entry === 'boolean')) return null
  return Object.fromEntries(Object.entries(record)) as Record<string, boolean>
}

function stringRecord(value: unknown): Record<string, string> | null {
  const record = plainRecord(value)
  if (!record || !Object.values(record).every((entry) => typeof entry === 'string')) return null
  return Object.fromEntries(Object.entries(record)) as Record<string, string>
}

function progressFailureCode(value: unknown): ProgressFailureCode | undefined {
  const body = plainRecord(value)
  if (!body || body.ok !== false || typeof body.error !== 'string') return undefined
  if (hasExactKeys(body, ['ok', 'error'])) return undefined
  if (
    hasExactKeys(body, ['ok', 'error', 'code'])
    && typeof body.code === 'string'
    && FAILURE_CODES.has(body.code as ProgressFailureCode)
  ) return body.code as ProgressFailureCode
  return undefined
}

function isExactFailureBody(value: unknown): boolean {
  const body = plainRecord(value)
  return Boolean(body
    && body.ok === false
    && typeof body.error === 'string'
    && (hasExactKeys(body, ['ok', 'error']) || progressFailureCode(body) !== undefined))
}

function progressFailureMessage(code: ProgressFailureCode | undefined): string {
  switch (code) {
    case 'attempt-invalid': return 'โจทย์ชุดนี้ใช้ไม่ได้แล้ว กรุณาเริ่มใหม่'
    case 'claim-replaced': return 'กำลังบันทึกผลจากคำขออื่น กรุณารอตรวจสอบสถานะ'
    case 'progress-stale': return 'สถานะบทเรียนเปลี่ยน กรุณาตรวจสอบอีกครั้ง'
    case 'simulation-incomplete': return 'ทำโจทย์จำลองให้ครบและกดยืนยันการตั้งค่าก่อนตรวจ'
    default: return 'บันทึกความคืบหน้าไม่สำเร็จ'
  }
}

function projectProgressSuccess(
  value: unknown,
  event: ProgressAction,
): { outcome?: CheckpointOutcome; cue?: VideoCueOutcome } | null {
  const body = plainRecord(value)
  if (!body || body.ok !== true) return null
  if (event.action === 'open' || event.action === 'skip') {
    return hasExactKeys(body, ['ok']) ? {} : null
  }
  if (event.action === 'video-cue') {
    return hasExactKeys(body, ['ok', 'correct', 'explanation'])
      && typeof body.correct === 'boolean'
      && typeof body.explanation === 'string'
      ? { cue: { correct: body.correct, explanation: body.explanation } }
      : null
  }
  if (hasExactKeys(body, ['ok', 'passed']) && typeof body.passed === 'boolean') {
    return { outcome: { passed: body.passed } }
  }
  if (!hasExactKeys(body, [
    'ok',
    'passed',
    'results',
    'correctCount',
    'total',
    'explanations',
  ]) || typeof body.passed !== 'boolean') return null
  const results = booleanRecord(body.results)
  const explanations = stringRecord(body.explanations)
  if (
    !results
    || !explanations
    || !Number.isSafeInteger(body.correctCount)
    || !Number.isSafeInteger(body.total)
    || (body.correctCount as number) < 0
    || (body.total as number) < 0
    || (body.correctCount as number) > (body.total as number)
    || Object.keys(results).length !== body.total
    || Object.values(results).filter(Boolean).length !== body.correctCount
  ) return null
  return {
    outcome: {
      passed: body.passed,
      results,
      correctCount: body.correctCount as number,
      total: body.total as number,
      explanations,
    },
  }
}

export async function pushProgress(event: ProgressAction): Promise<{
  failure: ProgressSyncFailure | null
  outcome?: CheckpointOutcome
  cue?: VideoCueOutcome
}> {
  try {
    const res = await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      // keepalive: ให้ request รอดแม้ผู้เรียนกด "บทถัดไป" ทันทีหลังตอบเสร็จ
      // ถ้าไม่ใส่ เบราว์เซอร์จะยกเลิก request ที่ยังค้างตอนเปลี่ยนหน้า แล้วบทที่
      // เพิ่งเรียนจบจะไม่ถูกบันทึก — ผู้เรียนเสียงานโดยไม่มีอะไรแจ้งเลย
      keepalive: true,
    })
    const body = await readProgressJson(res)
    const projected = res.ok ? projectProgressSuccess(body, event) : null
    if (!projected) {
      const failureBodyValid = isExactFailureBody(body)
      const code = failureBodyValid ? progressFailureCode(body) : undefined
      return {
        failure: {
          nodeId: event.nodeId,
          message: progressFailureMessage(code),
          accessLost: res.status === 401 || res.status === 403,
          // claim-replaced อาจมีอีก request บันทึกผลสำเร็จแล้ว จึงห้ามออกใบใหม่ทันที
          needsNewAttempt:
            failureBodyValid && (code === 'attempt-invalid' ||
            (event.action === 'checkpoint' &&
              res.status === 409 &&
              code !== 'claim-replaced' &&
              code !== 'progress-stale') ||
            (res.status === 400 && event.action === 'checkpoint' && code !== 'simulation-incomplete')),
          claimReplaced: code === 'claim-replaced',
          simulationIncomplete: code === 'simulation-incomplete',
        },
      }
    }
    return {
      failure: null,
      outcome: projected.outcome,
      cue: projected.cue,
    }
  } catch {
    return {
      failure: {
        nodeId: event.nodeId,
        message: 'บันทึกความคืบหน้าไม่สำเร็จ — เครือข่ายมีปัญหา',
      },
    }
  }
}
