import { academyDb } from '@/lib/db/server'
import { attemptExplanations, normalizeAttemptParams, type AttemptParams } from './attempt'
import type { NodeEvent } from './progress-db'

// ทางเข้า DB ของโครง attempt — ทั้งสองคำสั่งเป็นฟังก์ชันฝั่งฐานข้อมูล (migration 0005)
// เพราะเงื่อนไขความถูกต้องของมัน (โควตานับแบบ atomic · consume ครั้งเดียวพร้อม
// ownership/context/expiry) ต้องอยู่ในคำสั่งเดียวของ DB — ตรวจฝั่ง app คือ
// "อ่านก่อนแล้วค่อยเขียน" ซึ่งสอง request พร้อมกันเจาะผ่านได้เสมอ

/** ค่าตั้งต้นตามแผน W0-0/W0-1: อายุ 60 นาที · โควตา 3 ครั้งต่อ 30 นาที ต่อ (user, node) */
export const ATTEMPT_TTL_MINUTES = 60
export const ATTEMPT_MAX_PER_WINDOW = 3
export const ATTEMPT_WINDOW_MINUTES = 30

/**
 * โควตาที่ใช้จริง — ปรับได้ด้วย env `ATTEMPT_MAX_PER_WINDOW` (ไม่ตั้ง = 3)
 *
 * มีไว้ให้ชุดเทส e2e เดินเส้นทางผู้เรียนซ้ำๆ ได้โดยไม่ต้องไปแตะสมุดนับโควตา —
 * ทางที่ **ห้าม** ทำคือให้ผู้ใช้ล้างแถวเองผ่าน endpoint (เคยทำแล้ว RIL จับว่าลบ
 * โควตาทิ้งทั้งหมด) · ค่านี้เป็น config ฝั่งเซิร์ฟเวอร์ ผู้ใช้เอื้อมไม่ถึง
 * และ production ไม่ต้องตั้ง
 */
export function attemptQuota(): number {
  const raw = process.env.ATTEMPT_MAX_PER_WINDOW?.trim()
  if (!raw) return ATTEMPT_MAX_PER_WINDOW
  const value = Number.parseInt(raw, 10)
  return Number.isInteger(value) && value > 0 ? value : ATTEMPT_MAX_PER_WINDOW
}

export interface IssuedAttempt {
  attemptId: string
  expiresAt: string
  /**
   * params ที่ **เก็บอยู่จริง** ของใบนี้ — อาจไม่ใช่ชุดที่เพิ่งส่งเข้าไป
   *
   * ถ้าผู้เรียนมีใบที่ยังไม่ถูกใช้อยู่แล้ว (เปิดหน้าซ้ำ / response หายกลางทาง)
   * ฟังก์ชันใน DB จะคืนใบเดิม — ผู้เรียกต้องเรนเดอร์จากชุดนี้เท่านั้น ไม่งั้นหน้าจะ
   * แสดงโจทย์ใหม่คู่กับเฉลยเก่า (ดู 0010)
   */
  params: AttemptParams
}

export interface ConsumedAttempt {
  params: AttemptParams
  challengeVersion: string
  /**
   * ผลสุดท้ายที่ attempt นี้เคยได้ — มีค่า = ส่งซ้ำหลังจบสมบูรณ์แล้ว
   *
   * null ทั้งที่ consume ไปแล้ว = ครั้งก่อนล้มกลางทาง (บันทึกความคืบหน้าไม่สำเร็จ)
   * ผู้เรียนจึงส่งใหม่ด้วย attempt เดิมได้โดยไม่เสียสิทธิ์ (ดูเหตุผลใน 0009)
   */
  outcome: { passed: boolean } | null
  /** token ของ claim ปัจจุบัน; null มีได้เฉพาะ retry ที่ outcome จบแล้ว */
  claimToken: string | null
  claimState: 'claimed' | 'completed' | 'in-progress'
}

export interface AttemptContext {
  userId: string
  courseSlug: string
  nodeId: string
  challengeId: string
}

export interface InspectedAttempt {
  params: AttemptParams
  outcome: { passed: boolean } | null
}

/** อ่าน snapshot เพื่อ validate รูป submission โดยยังไม่ claim/consume attempt */
export async function inspectAttempt(
  ctx: AttemptContext,
  attemptId: string,
): Promise<InspectedAttempt | null> {
  const db = academyDb()
  const { data, error } = await db.rpc('inspect_attempt', {
    p_attempt_id: attemptId,
    p_user_id: ctx.userId,
    p_course_slug: ctx.courseSlug,
    p_node_id: ctx.nodeId,
    p_challenge_id: ctx.challengeId,
  })
  if (error) throw new Error(`อ่าน attempt เพื่อ validate ไม่สำเร็จ: ${error.message}`)
  const row = (data as { params: AttemptParams; outcome: { passed: boolean } | null }[] | null)?.[0]
  return row ? { params: normalizeAttemptParams(row.params), outcome: row.outcome ?? null } : null
}

/** ออก attempt ใหม่ — คืน null เมื่อโควตาในหน้าต่างเวลาเต็ม */
export async function issueAttempt(
  ctx: AttemptContext,
  params: AttemptParams,
  challengeVersion: string,
): Promise<IssuedAttempt | null> {
  const db = academyDb()
  const { data, error } = await db.rpc('issue_attempt', {
    p_user_id: ctx.userId,
    p_course_slug: ctx.courseSlug,
    p_node_id: ctx.nodeId,
    p_challenge_id: ctx.challengeId,
    p_params: params,
    p_challenge_version: challengeVersion,
    p_ttl_minutes: ATTEMPT_TTL_MINUTES,
    p_max_per_window: attemptQuota(),
    p_window_minutes: ATTEMPT_WINDOW_MINUTES,
  })
  if (error) throw new Error(`ออก attempt ไม่สำเร็จ: ${error.message}`)
  const row = (data as { attempt_id: string; expires_at: string; params: AttemptParams }[] | null)?.[0]
  if (!row) return null
  return { attemptId: row.attempt_id, expiresAt: row.expires_at, params: normalizeAttemptParams(row.params) }
}

/**
 * ใช้ attempt หนึ่งครั้ง — คืน null เมื่อถูกปฏิเสธ (ไม่ใช่ของผู้ใช้นี้ / คนละบท /
 * ใช้ไปแล้ว / หมดอายุ) โดยตั้งใจไม่แยกเหตุผล: รายละเอียดคือ oracle ให้คนเดา attempt_id
 */
export async function consumeAttempt(ctx: AttemptContext, attemptId: string): Promise<ConsumedAttempt | null> {
  const db = academyDb()
  const { data, error } = await db.rpc('consume_attempt', {
    p_attempt_id: attemptId,
    p_user_id: ctx.userId,
    p_course_slug: ctx.courseSlug,
    p_node_id: ctx.nodeId,
    p_challenge_id: ctx.challengeId,
  })
  if (error) throw new Error(`ใช้ attempt ไม่สำเร็จ: ${error.message}`)
  const row = (data as
    | {
        params: AttemptParams
        challenge_version: string
        outcome: { passed: boolean } | null
        claim_token: string | null
        claim_state: 'claimed' | 'completed' | 'in-progress'
      }[]
    | null)?.[0]
  if (!row) return null
  return {
    params: normalizeAttemptParams(row.params),
    challengeVersion: row.challenge_version,
    outcome: row.outcome ?? null,
    claimToken: row.claim_token ?? null,
    claimState: row.claim_state,
  }
}

/**
 * ขอ attempt ได้อีกครั้งเมื่อไร — ใช้ตอบตอนโควตาเต็มเท่านั้น
 *
 * คิดจาก attempt ที่เก่าที่สุดในหน้าต่างเวลา: พอมันหลุดหน้าต่าง โควตาก็คืนมาหนึ่งช่อง
 * ผู้เรียนจึงได้ "อีกกี่นาที" ที่เป็นความจริง ไม่ใช่ "ลองใหม่ภายหลัง" ซึ่งบอกอะไรไม่ได้
 */
export async function nextAttemptAt(ctx: AttemptContext): Promise<Date | null> {
  const db = academyDb()
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000).toISOString()
  const { data, error } = await db
    .from('attempt')
    .select('created_at')
    .eq('user_id', ctx.userId)
    .eq('course_slug', ctx.courseSlug)
    .eq('node_id', ctx.nodeId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error || !data?.length) return null
  return new Date(Date.parse(data[0].created_at as string) + ATTEMPT_WINDOW_MINUTES * 60_000)
}

/** ปิด claim ที่ payload ใช้ไม่ได้; valid grading ต้องใช้ commitAttemptResult เท่านั้น */
export async function finalizeAttempt(
  userId: string,
  attemptId: string,
  claimToken: string,
  outcome: { passed: boolean },
): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db.rpc('finalize_attempt', {
    p_attempt_id: attemptId,
    p_user_id: userId,
    p_claim_token: claimToken,
    p_outcome: outcome,
  })
  if (error) throw new Error(`ปิดท้าย attempt ไม่สำเร็จ: ${error.message}`)
  return data === true
}

type AttemptNodeEvent = Pick<
  NodeEvent,
  'status' | 'checkpointResults' | 'videoCueResults' | 'simulationEvidence'
>

/** เขียน progress + outcome ใน transaction เดียว และรับเฉพาะ claim token ปัจจุบัน */
export async function commitAttemptResult(
  ctx: AttemptContext,
  attemptId: string,
  claimToken: string,
  outcome: { passed: boolean },
  event: AttemptNodeEvent,
): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db.rpc('commit_attempt_result', {
    p_attempt_id: attemptId,
    p_user_id: ctx.userId,
    p_claim_token: claimToken,
    p_course_slug: ctx.courseSlug,
    p_node_id: ctx.nodeId,
    p_challenge_id: ctx.challengeId,
    p_outcome: outcome,
    p_status: event.status,
    p_checkpoint_results: event.checkpointResults ?? null,
    p_video_cue_results: event.videoCueResults ?? null,
    p_simulation_evidence: event.simulationEvidence ?? null,
  })
  if (error) throw new Error(`บันทึกผล attempt ไม่สำเร็จ: ${error.message}`)
  return data === true
}

export type PassedAttemptExplanations =
  | { status: 'none' }
  | { status: 'unavailable' }
  | { status: 'ready'; explanations: Record<string, string> }

/** แยกบทที่ไม่เคยใช้ attempt ออกจาก pointer ที่มีแต่ snapshot เสีย/หาย */
export async function loadPassedAttemptExplanations(
  ctx: Omit<AttemptContext, 'challengeId'>,
): Promise<PassedAttemptExplanations> {
  const db = academyDb()
  const { data: progress, error: progressError } = await db
    .from('node_progress')
    .select('passed_attempt_id')
    .eq('user_id', ctx.userId)
    .eq('course_slug', ctx.courseSlug)
    .eq('node_id', ctx.nodeId)
    .maybeSingle()
  if (progressError) throw new Error(`อ่านตัวชี้ attempt ไม่สำเร็จ: ${progressError.message}`)
  const attemptId = progress?.passed_attempt_id as string | null | undefined
  if (!attemptId) return { status: 'none' }

  const { data: attempt, error: attemptError } = await db
    .from('attempt')
    .select('params')
    .eq('attempt_id', attemptId)
    .eq('user_id', ctx.userId)
    .eq('course_slug', ctx.courseSlug)
    .eq('node_id', ctx.nodeId)
    .eq('challenge_id', 'checkpoint')
    .maybeSingle()
  if (attemptError) throw new Error(`อ่าน snapshot attempt ไม่สำเร็จ: ${attemptError.message}`)
  const params = attempt?.params as AttemptParams | undefined
  const explanations = params ? attemptExplanations(params) : null
  return explanations ? { status: 'ready', explanations } : { status: 'unavailable' }
}
