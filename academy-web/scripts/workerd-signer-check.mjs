/**
 * รัน tests/workerd/signer-worker.ts บน workerd จริงผ่าน `wrangler dev`
 *
 * ชุด vitest รันบน Node ซึ่งพิสูจน์ workerd ไม่ได้ — ที่นั่น CryptoKey เป็นคนละ
 * implementation และ contract ที่เขียวใน Node เคยปฏิเสธ key ที่ถูกต้องบน workerd
 * มาแล้ว lane นี้จึงต้องกิน runtime ตัวจริงด้วย compatibility ชุดเดียวกับแอป
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// โซน ephemeral ตาม ecosystem/PORT_REGISTRY.md — ไม่จองเลขถาวร
const PORT = 61987
const INSPECTOR_PORT = 61988
const BOOT_TIMEOUT_MS = 120_000

const root = fileURLToPath(new URL('..', import.meta.url))
const appConfig = `${root}wrangler.jsonc`
const harnessConfig = `${root}tests/workerd/wrangler.jsonc`

/** ดึงเฉพาะสองคีย์ที่เกี่ยว แทนการ parse JSONC ทั้งไฟล์ที่มีคอมเมนต์ปนอยู่ */
async function compatibilityOf(path) {
  const text = await readFile(path, 'utf8')
  const date = /"compatibility_date"\s*:\s*"([^"]+)"/.exec(text)?.[1]
  const flags = /"compatibility_flags"\s*:\s*\[([^\]]*)\]/.exec(text)?.[1]
  if (!date || flags === undefined) throw new Error(`ไม่พบ compatibility ใน ${path}`)
  return { date, flags: [...flags.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort() }
}

const app = await compatibilityOf(appConfig)
const harness = await compatibilityOf(harnessConfig)
if (app.date !== harness.date || app.flags.join() !== harness.flags.join()) {
  console.error('compatibility ของ harness ไม่ตรงกับแอป — แก้ tests/workerd/wrangler.jsonc ให้ตรง')
  console.error(`  แอป:     ${app.date} ${JSON.stringify(app.flags)}`)
  console.error(`  harness: ${harness.date} ${JSON.stringify(harness.flags)}`)
  process.exit(1)
}
console.log(`compatibility ตรงกับแอป: ${app.date} ${JSON.stringify(app.flags)}`)

const child = spawn('npx', [
  'wrangler', 'dev',
  '--config', harnessConfig,
  '--port', String(PORT),
  '--inspector-port', String(INSPECTOR_PORT),
  '--log-level', 'warn',
  '--show-interactive-dev-session', 'false',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })

let log = ''
child.stdout.on('data', (chunk) => { log += chunk })
child.stderr.on('data', (chunk) => { log += chunk })

const shutdown = () => { if (child.exitCode === null) child.kill('SIGTERM') }
process.on('exit', shutdown)
process.on('SIGINT', () => { shutdown(); process.exit(130) })

let response = null
const deadline = Date.now() + BOOT_TIMEOUT_MS
while (Date.now() < deadline) {
  if (child.exitCode !== null) break
  try {
    response = await fetch(`http://127.0.0.1:${PORT}/`)
    break
  } catch {
    await delay(500)
  }
}

if (!response) {
  console.error(`wrangler dev ไม่ตอบภายใน ${BOOT_TIMEOUT_MS / 1000}s`)
  console.error(log.slice(-4_000))
  shutdown()
  process.exit(1)
}

const body = await response.json()
shutdown()

for (const check of body.checks ?? []) {
  console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.name}: ${check.detail}`)
}
if (!body.ok) {
  console.error('signer ใช้ไม่ได้บน workerd')
  process.exit(1)
}
console.log(`\nworkerd: ${body.checks.length} checks ผ่านทั้งหมด`)
