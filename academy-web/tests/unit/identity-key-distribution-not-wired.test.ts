import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const IDENTITY_LIB = join(ROOT, 'src', 'lib', 'identity')

/**
 * โมดูลที่สร้างไว้แล้วแต่ **ยังไม่เปิดใช้** เพราะฝั่ง Identity ยังไม่ published
 * result verification-key set จริง และการเปิดเป็นการตัดสินใจของ founder
 *
 * ก่อนหน้านี้ข้อความว่า "ยังไม่มีผู้เรียกใน production" เป็นจริงเพราะบังเอิญยังไม่มีใคร
 * ต่อ ไม่ใช่เพราะมีอะไรห้าม เทสนี้เปลี่ยนให้เป็นจริงโดยโครงสร้าง — ใครจะต่อจริงต้อง
 * ลบชื่อออกจากรายการนี้ ซึ่งเป็นการกระทำที่ตั้งใจและมีรีวิวของมันเอง ไม่ใช่ import
 * ที่หลุดเข้ามาเงียบๆ ตอน refactor
 */
const NOT_YET_ENABLED = [
  'client-assertion-jti-source',
  'client-assertion-provider',
  'client-assertion-webcrypto-signer',
  'result-key-set-cache',
  'result-key-set-importer',
] as const

/** ที่ที่ถือว่าเป็น production surface — โค้ดที่ deploy ไปกับแอปจริง */
const PRODUCTION_ROOTS = ['src', 'worker.ts', 'open-next.config.ts', 'next.config.ts']
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '.open-next', '.wrangler'])

function typeScriptFilesUnder(path: string): string[] {
  if (!existsSync(path)) return []
  const entry = statSync(path)
  if (entry.isFile()) return /\.tsx?$/.test(path) ? [path] : []
  if (!entry.isDirectory()) return []
  return readdirSync(path).flatMap((name) => {
    if (SKIPPED_DIRECTORIES.has(name)) return []
    return typeScriptFilesUnder(join(path, name))
  })
}

describe('การกระจาย verification key ของ Identity ยังไม่ถูกต่อเข้า production', () => {
  // ถ้าไฟล์ถูกเปลี่ยนชื่อ การสแกนด้านล่างจะไม่เจออะไรแล้วผ่านด้วยเหตุผลที่ผิด
  // ด่านนี้จึงต้องยืนยันก่อนว่าสิ่งที่กำลังเฝ้ายังมีตัวตนอยู่จริง
  it.each(NOT_YET_ENABLED)('%s ยังมีอยู่จริง ด่านนี้จึงไม่ได้เฝ้าของที่หายไปแล้ว', (name) => {
    expect(existsSync(join(IDENTITY_LIB, `${name}.ts`))).toBe(true)
  })

  it('ไม่มีไฟล์ production ไหนอ้างถึงโมดูลที่ยังไม่เปิดใช้', () => {
    const files = PRODUCTION_ROOTS
      .flatMap((entry) => typeScriptFilesUnder(join(ROOT, entry)))
      .filter((path) => !path.startsWith(`${IDENTITY_LIB}/`))

    // ถ้ารายการไฟล์ว่าง แปลว่าการสแกนพัง ไม่ใช่ว่าไม่มีใครต่อ
    expect(files.length).toBeGreaterThan(50)

    const wired = files.flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      return NOT_YET_ENABLED
        .filter((name) => text.includes(name))
        .map((name) => `${relative(ROOT, path)} → ${name}`)
    })

    expect(wired, [
      'มีโค้ด production อ้างถึงโมดูล identity ที่ยังไม่เปิดใช้',
      'ถ้าตั้งใจเปิดจริง ให้ลบชื่อออกจาก NOT_YET_ENABLED ในเทสนี้พร้อมกัน',
      'และต้องมีหลักฐานว่า Identity published key set จริงแล้ว',
    ].join(' · ')).toEqual([])
  })

  it('โมดูลเหล่านี้ไม่เปิด route ไม่ยิงเน็ต และไม่อ่าน environment เอง', () => {
    for (const name of NOT_YET_ENABLED) {
      const text = readFileSync(join(IDENTITY_LIB, `${name}.ts`), 'utf8')
      expect(text, `${name} ต้องไม่ยิงเน็ตหรืออ่าน config เอง`)
        .not.toMatch(/process\.env|\bfetch\s*\(|new Request\(|NextResponse/)
    }
  })
})
