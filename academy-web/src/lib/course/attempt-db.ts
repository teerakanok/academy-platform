import { academyDb } from '@/lib/db/server'
import type { AttemptParams } from './attempt'

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
}

export interface ConsumedAttempt {
  params: AttemptParams
  challengeVersion: string
}

export interface AttemptContext {
  userId: string
  courseSlug: string
  nodeId: string
  challengeId: string
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
  const row = (data as { attempt_id: string; expires_at: string }[] | null)?.[0]
  if (!row) return null
  return { attemptId: row.attempt_id, expiresAt: row.expires_at }
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
  const row = (data as { params: AttemptParams; challenge_version: string }[] | null)?.[0]
  if (!row) return null
  return { params: row.params, challengeVersion: row.challenge_version }
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
