import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// สัญญาฝั่ง producer (Identity Control) ที่เทส conformance ของ Academy ใช้ตรวจ
// ลำดับการหา: env ACADEMY_IDENTITY_CONTROL_ROOT → repo พี่น้องข้าง academy-platform
// → สำเนาที่ตรึงไว้ในโฟลเดอร์นี้ เพื่อให้เทสรันได้ทุกเครื่อง/ทุก worktree
// (AC-SEC-11: เดิมผูกกับ /private/tmp ที่หายไปแล้ว ทำให้เทสล้มทุกเครื่องใหม่)
const ENV_ROOT = 'ACADEMY_IDENTITY_CONTROL_ROOT'
const SIBLING_ROOT = join(__dirname, '../../../../identity-control')
const PINNED_DIR = __dirname
// identity-control@05bc278 (ไฟล์ทั้งสองเปลี่ยนล่าสุดที่ 72c920d) — อัปเดตพร้อมไฟล์
const PINNED_SHA256: Record<string, string> = {
  'client-assertion.ts': '6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6',
  'client-control.ts': '5c3544a6b8056f95021f0dc871ca465d16235cad482984646b3b5b3a9455063c',
}

export type IdentityControlSource = 'env' | 'sibling' | 'pinned'

export function resolveIdentityControlSourceDir(): {
  source: IdentityControlSource
  dir: string
} {
  const configured = process.env[ENV_ROOT]
  if (configured) {
    const dir = join(configured, 'packages/core/src')
    if (!existsSync(dir)) {
      throw new Error(`${ENV_ROOT} does not contain packages/core/src: ${configured}`)
    }
    return { source: 'env', dir }
  }
  const sibling = join(SIBLING_ROOT, 'packages/core/src')
  if (existsSync(join(sibling, 'client-assertion.ts'))) {
    return { source: 'sibling', dir: sibling }
  }
  for (const [file, digest] of Object.entries(PINNED_SHA256)) {
    const actual = createHash('sha256').update(readFileSync(join(PINNED_DIR, file))).digest('hex')
    if (actual !== digest) {
      throw new Error(`pinned Identity Control snapshot ${file} drifted from its recorded digest`)
    }
  }
  return { source: 'pinned', dir: PINNED_DIR }
}

export async function importIdentityControlContracts(): Promise<{
  authenticator: unknown
  control: unknown
}> {
  const { dir } = resolveIdentityControlSourceDir()
  const [authenticator, control]: unknown[] = await Promise.all([
    import(pathToFileURL(join(dir, 'client-assertion')).href),
    import(pathToFileURL(join(dir, 'client-control')).href),
  ])
  return { authenticator, control }
}
