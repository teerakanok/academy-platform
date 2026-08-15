/**
 * ยิงเส้นทาง exit จริงของ restoreOnExit ไม่ใช่แค่ API ของ Sandbox
 *
 * POC เดียวกับที่รีวิวอิสระรอบเจ็ดใช้ REJECT: EACCES ที่นานเกินสองครั้งที่ exit
 * handler เรียกติดกัน แล้วปล่อยให้โปรเซสออกทั้งที่ pending > 0
 *
 * ก่อนแก้: ไบต์เดิมอยู่แต่ในหน่วยความจำ หายไปพร้อมโปรเซส กู้ไม่ได้อีก
 * หลังแก้: ต้องมีสำเนาบนดิสก์ + manifest ให้กู้ได้แม้ Sandbox ตายไปแล้ว
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SANDBOX = fileURLToPath(new URL('./sandbox.mjs', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'poc-m02-'))
const victim = join(root, 'uncommitted.txt')
writeFileSync(victim, 'ORIGINAL-UNCOMMITTED')

const child = join(root, 'child.mjs')
writeFileSync(child, `
import { chmodSync } from 'node:fs'
import { Sandbox, restoreOnExit } from ${JSON.stringify(SANDBOX)}
const sandbox = new Sandbox(${JSON.stringify(root)})
restoreOnExit(sandbox)
sandbox.modify('uncommitted.txt', 'HARNESS-BYTES')
chmodSync(${JSON.stringify(victim)}, 0o444)   // EACCES ที่ยังไม่หายตอน handler ทำงาน
process.exit(0)
`)

const run = spawnSync(process.execPath, [child], { encoding: 'utf8' })
console.log(`child exit: ${run.status}`)
console.log(`ไฟล์หลัง child ออก: ${JSON.stringify(readFileSync(victim, 'utf8'))}  (restore เขียนกลับไม่ได้จริง)`)

const cleanup = (code) => { try { chmodSync(victim, 0o644) } catch {} ; rmSync(root, { recursive: true, force: true }); process.exit(code) }
const match = run.stderr.match(/ไบต์เดิมถูกเก็บไว้ที่ (\S+)/)
if (!match) { console.log('ไม่ผ่าน: ไม่มีทางกู้ — ไบต์เดิมหายไปพร้อมโปรเซส'); console.log(run.stderr); cleanup(1) }

const directory = match[1]
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
console.log(`โฟลเดอร์กู้คืน: ${directory}`)
console.log(`manifest: ${JSON.stringify(manifest)}`)

chmodSync(victim, 0o644)
writeFileSync(victim, readFileSync(manifest[0].spill))
const recovered = readFileSync(victim, 'utf8')
console.log(`หลังกู้จากดิสก์: ${JSON.stringify(recovered)}`)
rmSync(directory, { recursive: true, force: true })
console.log(recovered === 'ORIGINAL-UNCOMMITTED' ? 'ผ่าน: กู้ไบต์เดิมได้หลังโปรเซสตายแล้ว — M-02 ปิด' : 'ไม่ผ่าน')
cleanup(recovered === 'ORIGINAL-UNCOMMITTED' ? 0 : 1)
