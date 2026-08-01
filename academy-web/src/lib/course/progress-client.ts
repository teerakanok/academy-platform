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

export async function pushNodeEvent(event: {
  slug: string
  nodeId: string
  status: 'in-progress' | 'completed' | 'tested-out' | 'skipped'
  checkpointResults?: Record<string, boolean>
  videoCueResults?: Record<string, boolean>
}): Promise<ProgressSyncFailure | null> {
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
    if (res.ok) return null
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return { nodeId: event.nodeId, message: body.error ?? 'บันทึกความคืบหน้าไม่สำเร็จ' }
  } catch {
    return { nodeId: event.nodeId, message: 'บันทึกความคืบหน้าไม่สำเร็จ — เครือข่ายมีปัญหา' }
  }
}
