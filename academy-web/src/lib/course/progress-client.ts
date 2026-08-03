import type { CourseProgressRecord } from './progress'

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
  { ok: true; record: CourseProgressRecord } | { ok: false; reason: 'signed-out' | 'access-lost' | 'unavailable' }

export async function fetchProgress(slug: string): Promise<ProgressLoadResult> {
  try {
    const res = await fetch(`/api/progress?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    if (res.status === 401) return { ok: false, reason: 'signed-out' }
    if (res.status === 403) return { ok: false, reason: 'access-lost' }
    if (!res.ok) return { ok: false, reason: 'unavailable' }
    const body = (await res.json()) as {
      ok: boolean
      record?: CourseProgressRecord
    }
    return body.ok && body.record ? { ok: true, record: body.record } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export type ResetProgressResult =
  | { ok: true; record: CourseProgressRecord; reconciled: boolean }
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
    if (!response.ok) return { ok: false, reason: 'unknown' }
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      completed?: boolean
      record?: CourseProgressRecord
    }
    return body.ok && body.completed && body.record
      ? { ok: true, record: body.record, reconciled: true }
      : { ok: false, reason: 'unknown' }
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
      return { ok: false, reason: 'access-lost' }
    }
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean }
    if (response.ok && body.ok) {
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
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      passed?: boolean
      results?: Record<string, boolean>
      correctCount?: number
      total?: number
      explanations?: Record<string, string>
      correct?: boolean
      explanation?: string
      code?: 'attempt-invalid' | 'claim-replaced' | 'progress-stale' | 'simulation-incomplete'
    }
    if (!res.ok || !body.ok) {
      return {
        failure: {
          nodeId: event.nodeId,
          message: body.error ?? 'บันทึกความคืบหน้าไม่สำเร็จ',
          accessLost: res.status === 401 || res.status === 403,
          // claim-replaced อาจมีอีก request บันทึกผลสำเร็จแล้ว จึงห้ามออกใบใหม่ทันที
          needsNewAttempt:
            body.code === 'attempt-invalid' ||
            (event.action === 'checkpoint' &&
              res.status === 409 &&
              body.code !== 'claim-replaced' &&
              body.code !== 'progress-stale') ||
            (res.status === 400 && event.action === 'checkpoint' && body.code !== 'simulation-incomplete'),
          claimReplaced: body.code === 'claim-replaced',
          simulationIncomplete: body.code === 'simulation-incomplete',
        },
      }
    }
    return {
      failure: null,
      outcome:
        body.passed !== undefined
          ? {
              passed: body.passed,
              results: body.results,
              correctCount: body.correctCount,
              total: body.total,
              explanations: body.explanations,
            }
          : undefined,
      cue: body.correct !== undefined ? { correct: body.correct, explanation: body.explanation } : undefined,
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
