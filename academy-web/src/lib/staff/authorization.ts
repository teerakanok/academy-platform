import 'server-only'
import { notFound } from 'next/navigation'
import { academyDb } from '@/lib/db/server'
import { currentUser, type SessionUser } from '@/lib/auth/session'
import { internalSurfacesEnabled } from '@/lib/internal-surface'

export const STAFF_ROLES = ['owner', 'learner-support', 'privacy-officer', 'content-ops'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export async function hasStaffRole(accountId: string, requiredRole: StaffRole): Promise<boolean> {
  const result = await academyDb().rpc('has_staff_role', {
    p_account_id: accountId,
    p_required_role: requiredRole,
  })
  if (result.error) throw new Error(`ตรวจสิทธิ์ staff ไม่สำเร็จ: ${result.error.message}`)
  return result.data === true
}

export async function requireInternalContentStaff(): Promise<SessionUser> {
  if (!internalSurfacesEnabled()) notFound()
  const user = await currentUser()
  if (!user || !(await hasStaffRole(user.account.id, 'content-ops'))) notFound()
  return user
}
