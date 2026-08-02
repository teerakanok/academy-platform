import type { CourseProgressRecord } from './progress'
import { emptyProgress } from './progress'

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
  /**
   * โจทย์ชุดนี้ใช้ไม่ได้แล้ว (หมดอายุ / ถูกใช้ไปแล้ว) — ต้องเริ่มด้วยโจทย์ชุดใหม่
   *
   * ต้องแยกจากความล้มเหลวทั่วไป เพราะทางออกคนละทาง: อันนี้กด "ลองใหม่" ด้วยคำขอ
   * เดิมกี่ครั้งก็ได้ 409 เหมือนเดิม (RIL cross-model รอบ 2 เดินเคสให้ดู)
   */
  needsNewAttempt?: boolean
}

export async function fetchProgress(slug: string): Promise<CourseProgressRecord> {
  try {
    const res = await fetch(`/api/progress?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!res.ok) return emptyProgress(slug)
    const body = (await res.json()) as { ok: boolean; record?: CourseProgressRecord }
    return body.ok && body.record ? body.record : emptyProgress(slug)
  } catch {
    return emptyProgress(slug)
  }
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
  | { action: 'video-cue'; slug: string; nodeId: string; cueId: string; answer: string[] }

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

export async function pushProgress(
  event: ProgressAction,
): Promise<{ failure: ProgressSyncFailure | null; outcome?: CheckpointOutcome; cue?: VideoCueOutcome }> {
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
    }
    if (!res.ok || !body.ok) {
      return {
        failure: {
          nodeId: event.nodeId,
          message: body.error ?? 'บันทึกความคืบหน้าไม่สำเร็จ',
          // 409 = attempt ใช้ไม่ได้แล้ว · 400 ตอนส่ง checkpoint = โจทย์คนละชุด
          needsNewAttempt: res.status === 409 || (res.status === 400 && event.action === 'checkpoint'),
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
    return { failure: { nodeId: event.nodeId, message: 'บันทึกความคืบหน้าไม่สำเร็จ — เครือข่ายมีปัญหา' } }
  }
}
