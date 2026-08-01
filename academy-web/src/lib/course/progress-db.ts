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
    .select('node_id, status, checkpoint_results, video_cue_results, updated_at')
    .eq('user_id', userId)
    .eq('course_slug', slug)
  if (error) throw new Error(`อ่านความคืบหน้าไม่สำเร็จ: ${error.message}`)
  return rowsToRecord(slug, (data ?? []) as NodeRow[])
}

export interface NodeEvent {
  slug: string
  nodeId: string
  status: NodeProgressStatus
  checkpointResults?: Record<string, boolean>
  videoCueResults?: Record<string, boolean>
}

/**
 * บันทึกสถานะของบทหนึ่ง
 *
 * ไม่ยอมให้สถานะถอยหลัง: บทที่พิสูจน์แล้วจะไม่ถูกทับด้วย 'in-progress' เพียงเพราะ
 * ผู้เรียนเปิดอ่านซ้ำ — ไม่งั้นการทบทวนบทเก่าจะลบหลักฐานของตัวเองทิ้ง
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
  })
  if (error) throw new Error(`บันทึกความคืบหน้าไม่สำเร็จ: ${error.message}`)
}

/** ความคืบหน้าของทุกคอร์สในครั้งเดียว — dashboard ต้องใช้ ไม่ควรยิงทีละคอร์ส */
export async function loadAllProgress(userId: string): Promise<Record<string, CourseProgressRecord>> {
  const db = academyDb()
  const { data, error } = await db
    .from('node_progress')
    .select('course_slug, node_id, status, checkpoint_results, video_cue_results, updated_at')
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
