import { academyDb } from '@/lib/db/server'
import { COURSE_PROGRESS_VERSION, emptyProgress, type CourseProgressRecord } from './progress'

// ความคืบหน้าที่ผูกกับบัญชี — แหล่งความจริงหลังจากมีบัญชีแล้ว
//
// เก็บเป็นหนึ่งแถวต่อ (คน × คอร์ส × บท) ไม่ใช่ JSON ก้อนเดียวทั้งคอร์ส เพราะผู้เรียน
// คนเดียวกันอาจเปิดสองเครื่อง การเขียนทั้งก้อนจะทำให้เครื่องที่บันทึกทีหลังลบงานของ
// เครื่องแรกทิ้งโดยไม่มีใครรู้

export type NodeProgressStatus = 'in-progress' | 'completed' | 'tested-out' | 'skipped'

interface NodeRow {
  node_id: string
  status: NodeProgressStatus
  checkpoint_results: Record<string, boolean>
  video_cue_results: Record<string, boolean>
  simulation_evidence: Record<string, SimulationEvidence>
  updated_at: string
}

/** แปลงแถวใน DB กลับเป็นรูปเดียวกับที่ฝั่ง UI ใช้อยู่แล้ว — UI จึงไม่ต้องรู้ว่ามาจากไหน */
export function rowsToRecord(slug: string, rows: NodeRow[]): CourseProgressRecord {
  const record = emptyProgress(slug)
  let latest = 0
  for (const row of rows) {
    if (row.status === 'completed') record.completed.push(row.node_id)
    else if (row.status === 'tested-out') record.testedOut.push(row.node_id)
    else if (row.status === 'skipped') record.skipped.push(row.node_id)
    else record.inProgress.push(row.node_id)

    if (Object.keys(row.checkpoint_results ?? {}).length) {
      record.checkpointResults[row.node_id] = row.checkpoint_results
    }
    if (Object.keys(row.video_cue_results ?? {}).length) {
      record.videoCueResults[row.node_id] = row.video_cue_results
    }
    // หลักฐานด่านจำลอง — ต้องอ่านกลับได้ ไม่งั้นการบันทึกก็เท่ากับไม่มี (W1)
    if (Object.keys(row.simulation_evidence ?? {}).length) {
      record.simulationEvidence[row.node_id] = row.simulation_evidence
    }

    const ts = Date.parse(row.updated_at)
    if (Number.isFinite(ts) && ts > latest) {
      latest = ts
      record.lastNodeId = row.node_id
    }
  }
  record.version = COURSE_PROGRESS_VERSION
  record.updatedAt = latest
  return record
}

export async function loadProgress(userId: string, slug: string): Promise<CourseProgressRecord> {
  const db = academyDb()
  const { data, error } = await db
    .from('node_progress')
    .select('node_id, status, checkpoint_results, video_cue_results, simulation_evidence, updated_at')
    .eq('user_id', userId)
    .eq('course_slug', slug)
  if (error) throw new Error(`อ่านความคืบหน้าไม่สำเร็จ: ${error.message}`)
  return rowsToRecord(slug, (data ?? []) as NodeRow[])
}

/** ล้าง progress ด้วย operation ID เดิมได้ซ้ำโดยไม่เพิ่ม epoch หรือลบงานรอบใหม่ */
export async function resetProgress(userId: string, slug: string, operationId: string): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db.rpc('reset_course_progress', {
    p_user_id: userId,
    p_course_slug: slug,
    p_operation_id: operationId,
  })
  if (error) throw new Error(`ล้างความคืบหน้าไม่สำเร็จ: ${error.message}`)
  return data === true
}

/** receipt เป็นหลักฐานของ operation เดิม; record ว่างหรือไม่ไม่ใช่หลักฐานว่า reset สำเร็จ */
export async function loadResetReceipt(userId: string, slug: string, operationId: string): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db
    .from('course_progress_reset_operation')
    .select('operation_id')
    .eq('user_id', userId)
    .eq('course_slug', slug)
    .eq('operation_id', operationId)
    .maybeSingle()
  if (error) throw new Error(`ตรวจ reset receipt ไม่สำเร็จ: ${error.message}`)
  return data !== null
}

/**
 * หลักฐานของด่านจำลองหนึ่งด่าน (W1)
 *
 * เก็บผล **ราย requirement** ไม่ใช่ boolean รวม เพราะใบรับรองอ้างอิงข้อมูลนี้และ
 * ต้องตอบได้ย้อนหลังว่าผ่านด้วยอะไร ณ โจทย์เวอร์ชันไหน
 */
export interface SimulationEvidence {
  passed: boolean
  requirements: { id: string; met: boolean }[]
  challengeVersion: string
  at: string
}

export interface NodeEvent {
  slug: string
  nodeId: string
  status: NodeProgressStatus
  checkpointResults?: Record<string, boolean>
  videoCueResults?: Record<string, boolean>
  simulationEvidence?: Record<string, SimulationEvidence>
  /**
   * attempt ที่ทำให้บทนี้ผ่าน — ส่งมาเฉพาะตอน **ผ่านจริง** เท่านั้น
   *
   * ใบรับรอง (W4) snapshot หลักฐาน ณ วันออก ถ้าไม่มีตัวชี้นี้ คำถามว่า "ใบนี้ออกจาก
   * อะไร" ตอบได้แค่ "บทนี้ completed" ซึ่งไม่บอกว่าโจทย์ชุดไหน กติกาเวอร์ชันไหน
   * (RIL cross-model รอบ 2) · ฝั่ง DB กันไม่ให้ค่านี้ถูกทับด้วยการส่งครั้งหลังอยู่แล้ว
   */
  passedAttemptId?: string
  passedChallengeVersion?: string
}

/**
 * บันทึกสถานะของบทหนึ่ง
 *
 * ไม่ยอมให้สถานะถอยหลัง: บทที่ทำจบแล้วจะไม่ถูกทับด้วย 'in-progress' เพียงเพราะ
 * ผู้เรียนเปิดอ่านซ้ำ — ไม่งั้นการทบทวนบทเก่าจะลบผลที่บันทึกไว้ทิ้ง
 * (และใบรับรองจะหายไปเฉยๆ ระหว่างที่เขากำลังทบทวน ซึ่งอธิบายให้ใครฟังก็ไม่เข้าใจ)
 */
export async function recordNodeEvent(userId: string, event: NodeEvent): Promise<void> {
  // เรียกฟังก์ชันใน DB แทนการ "อ่านแล้วค่อยเขียน" ฝั่ง app
  //
  // guard ฝั่ง app เคยทำให้บทที่เรียนจบแล้วถอยกลับเป็น 'กำลังเรียน' เมื่อ request
  // ที่ยิงตอนเปิดหน้า (ไม่รอผล) ไปถึงหลัง request ที่บันทึกว่าจบ — e2e จับได้จริง
  // เงื่อนไขแบบนี้ต้องอยู่ในคำสั่งเดียวของฐานข้อมูล ไม่งั้นสองอุปกรณ์ก็แข่งกันได้
  const db = academyDb()
  const { error } = await db.rpc('record_node_progress', {
    p_user_id: userId,
    p_course_slug: event.slug,
    p_node_id: event.nodeId,
    p_status: event.status,
    p_checkpoint_results: event.checkpointResults ?? null,
    p_video_cue_results: event.videoCueResults ?? null,
    p_simulation_evidence: event.simulationEvidence ?? null,
    p_passed_attempt_id: event.passedAttemptId ?? null,
    p_passed_challenge_version: event.passedChallengeVersion ?? null,
  })
  if (error) throw new Error(`บันทึกความคืบหน้าไม่สำเร็จ: ${error.message}`)
}

/** จับ generation ทันทีหลัง authorize เพื่อกัน reset ที่เกิดระหว่าง grading/write */
export async function captureProgressEpoch(userId: string, slug: string): Promise<number> {
  const db = academyDb()
  const { data, error } = await db.rpc('capture_progress_epoch', {
    p_user_id: userId,
    p_course_slug: slug,
  })
  if (error || typeof data !== 'number') {
    throw new Error(`จับ progress generation ไม่สำเร็จ: ${error?.message ?? 'ผลลัพธ์ไม่ถูกต้อง'}`)
  }
  return data
}

/** เขียน mutation ทั่วไปโดย revalidate access และ generation ใน transaction สุดท้าย */
export async function commitNodeEvent(userId: string, event: NodeEvent, expectedEpoch: number): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db.rpc('commit_node_progress', {
    p_user_id: userId,
    p_course_slug: event.slug,
    p_node_id: event.nodeId,
    p_status: event.status,
    p_expected_epoch: expectedEpoch,
    p_checkpoint_results: event.checkpointResults ?? null,
    p_video_cue_results: event.videoCueResults ?? null,
    p_simulation_evidence: event.simulationEvidence ?? null,
  })
  if (error) throw new Error(`บันทึกความคืบหน้าไม่สำเร็จ: ${error.message}`)
  return data === true
}

/** ความคืบหน้าของทุกคอร์สในครั้งเดียว — dashboard ต้องใช้ ไม่ควรยิงทีละคอร์ส */
export async function loadAllProgress(userId: string): Promise<Record<string, CourseProgressRecord>> {
  const db = academyDb()
  const { data, error } = await db
    .from('node_progress')
    .select('course_slug, node_id, status, checkpoint_results, video_cue_results, simulation_evidence, updated_at')
    .eq('user_id', userId)
  if (error) throw new Error(`อ่านความคืบหน้าไม่สำเร็จ: ${error.message}`)

  const bySlug = new Map<string, NodeRow[]>()
  for (const row of (data ?? []) as (NodeRow & { course_slug: string })[]) {
    const list = bySlug.get(row.course_slug) ?? []
    list.push(row)
    bySlug.set(row.course_slug, list)
  }
  const out: Record<string, CourseProgressRecord> = {}
  for (const [slug, rows] of bySlug) out[slug] = rowsToRecord(slug, rows)
  return out
}
