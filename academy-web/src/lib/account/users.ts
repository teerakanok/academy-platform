import { academyDb } from '@/lib/db/server'

// ชั้นบัญชีของ Academy — ตัวตนจริงอยู่ที่ canonical issuer ของ Identity Control
// ตารางนี้เก็บแค่ส่วนที่ Academy ต้องใช้ และผูกกับ issuer ด้วย (issuer, subject)
//
// กฎเหล็กจาก ADR: **ห้ามใช้ email เป็น key ในการหาบัญชี** email เปลี่ยนได้ ใช้ซ้ำได้
// และ Forge เคยพลาดตรงนี้มาแล้ว ยิ่งมีแผนออก certification เอง ตัวตนยิ่งต้องผูกกับ
// สิ่งที่ไม่เปลี่ยนตามอีเมล — email ในตารางมีไว้แสดงผลเท่านั้น

export interface AcademyUser {
  id: string
  issuer: string
  subject: string
  email: string
  displayName: string | null
  createdAt: string
}

export interface IdentityClaims {
  /** iss จาก token ของ issuer กลาง */
  issuer: string
  /** sub จาก token — เสถียรตลอดอายุบัญชี */
  subject: string
  /** ต้องเป็นอีเมลที่ยืนยันแล้วเท่านั้น (ดู requireVerifiedEmail) */
  email: string
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toUser(row: Record<string, unknown>): AcademyUser {
  return {
    id: row.id as string,
    issuer: row.issuer as string,
    subject: row.subject as string,
    email: row.email as string,
    displayName: (row.display_name as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

/**
 * หาบัญชีจาก canonical principal หรือสร้างถ้ายังไม่มี.
 *
 * Waitlist lead ห้ามเชื่อมหรือย้ายด้วย email equality: email เดียวอาจเป็นคนละ
 * principal และ consent lead ต้องไม่ถูก inherit โดยเงียบ ๆ.
 */
export async function findOrCreateUser(claims: IdentityClaims): Promise<AcademyUser> {
  const email = normaliseEmail(claims.email)
  if (!email) throw new Error('ต้องมีอีเมลที่ยืนยันแล้วก่อนสร้างบัญชี')

  const db = academyDb()

  const existing = await db
    .from('users')
    .select('*')
    .eq('issuer', claims.issuer)
    .eq('subject', claims.subject)
    .maybeSingle()
  if (existing.error) throw new Error(`อ่านบัญชีไม่สำเร็จ: ${existing.error.message}`)

  if (existing.data) {
    const seenAt = new Date().toISOString()
    // อีเมลที่ issuer ยืนยันอาจเปลี่ยน — sync ให้ตรง แต่ตัวตนยังเป็นคนเดิมเพราะ subject เท่าเดิม
    if (existing.data.email !== email) {
      const updated = await db
        .from('users')
        .update({ email, last_seen_at: seenAt })
        .eq('id', existing.data.id)
        .select('*')
        .single()
      if (updated.error) throw new Error(`อัปเดตกิจกรรมบัญชีไม่สำเร็จ: ${updated.error.message}`)
      return toUser(updated.data)
    }
    const updated = await db
      .from('users')
      .update({ last_seen_at: seenAt })
      .eq('id', existing.data.id)
      .select('*')
      .single()
    if (updated.error) throw new Error(`อัปเดตกิจกรรมบัญชีไม่สำเร็จ: ${updated.error.message}`)
    return toUser(updated.data)
  }

  const created = await db
    .from('users')
    .insert({ issuer: claims.issuer, subject: claims.subject, email })
    .select('*')
    .single()

  // 23505 = แข่งกันสมัครพร้อมกันสองแท็บ — อีกฝั่งสร้างสำเร็จไปแล้ว อ่านของเขามาใช้
  if (created.error) {
    if (created.error.code === '23505') {
      const again = await db
        .from('users')
        .select('*')
        .eq('issuer', claims.issuer)
        .eq('subject', claims.subject)
        .single()
      if (again.error) throw new Error(`สร้างบัญชีชนกันแล้วอ่านซ้ำไม่สำเร็จ: ${again.error.message}`)
      return toUser(again.data)
    }
    throw new Error(`สร้างบัญชีไม่สำเร็จ: ${created.error.message}`)
  }

  return toUser(created.data)
}

/** ชื่อบนใบรับรอง — แก้ได้จนกว่าจะออกใบ */
export async function setDisplayName(userId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new Error('ชื่อต้องยาว 1–120 ตัวอักษร')
  }
  const db = academyDb()
  const { error } = await db.from('users').update({ display_name: trimmed }).eq('id', userId)
  if (error) throw new Error(`บันทึกชื่อไม่สำเร็จ: ${error.message}`)
}
