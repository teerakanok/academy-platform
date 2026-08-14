/**
 * รัน tests/workerd/signer-worker.ts บน workerd จริงผ่าน `wrangler dev`
 *
 * ชุด vitest รันบน Node ซึ่งพิสูจน์ workerd ไม่ได้ — ที่นั่น CryptoKey เป็นคนละ
 * implementation และ contract ที่เขียวใน Node เคยปฏิเสธ key ที่ถูกต้องบน workerd
 * มาแล้ว lane นี้จึงต้องกิน runtime ตัวจริงด้วย compatibility ชุดเดียวกับแอป
 *
 * ตัว runner เองก็ต้องพิสูจน์ตัวเองด้วย เพราะรีวิวอิสระเคยหลอกมันให้เขียวสำเร็จ
 * ด้วยการ stub fetch ให้คืน {"ok":true,"checks":[]} รุ่นเดิมเช็คแค่ body.ok
 * จึงรายงาน "0 checks ผ่านทั้งหมด" แล้วออก 0 ตอนนี้จึงบังคับครบทุกด้าน:
 * HTTP status, nonce ที่มีแต่ worker ของเราตอบได้, ชื่อ check ต้องตรงรายการเป๊ะ,
 * ทุก check ต้องผ่าน และ child ต้องยังมีชีวิตตอนที่ตอบ
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// โซน ephemeral ตาม ecosystem/PORT_REGISTRY.md — ไม่จองเลขถาวร
const PORT = 61987
const INSPECTOR_PORT = 61988
const BOOT_TIMEOUT_MS = 120_000

/**
 * ชื่อ check ที่ต้องมีครบและตรงเป๊ะ ถ้า worker ลบ check ทิ้งแล้วยังคืน ok:true
 * รายการนี้คือสิ่งเดียวที่จับได้ — "ผ่านหมด" ที่ไม่มีอะไรรันเลยก็ "ผ่านหมด" เหมือนกัน
 */
const REQUIRED_CHECKS = [
  'cryptokey-introspection-shape',
  'rejects-a-cryptokey',
  'rejects-a-parsed-object',
  'rejects-a-surplus-member',
  'rejects-non-json',
  'runtime-is-workerd',
  'signer-imports-non-extractable-sign-only',
  'signs-and-verifies',
]

const root = fileURLToPath(new URL('..', import.meta.url))
const appConfig = `${root}wrangler.jsonc`
const harnessConfig = `${root}tests/workerd/wrangler.jsonc`

/**
 * ตัดคอมเมนต์ออกจาก JSONC ด้วยการเดินทีละตัวอักษร ไม่ใช่ regex
 *
 * รุ่นเดิมยิง regex ใส่ข้อความดิบ จึงอ่านบรรทัดที่ถูกคอมเมนต์ทิ้งไว้
 * (`// "compatibility_date": "2025-03-25"`) เป็นค่าจริง แล้วรายงานว่าตรงกัน
 * ทั้งที่ config จริงเลื่อนไปแล้ว
 */
function stripJsonComments(text) {
  let output = ''
  let index = 0
  let inString = false
  while (index < text.length) {
    const character = text[index]
    if (inString) {
      output += character
      if (character === '\\') {
        output += text[index + 1] ?? ''
        index += 2
        continue
      }
      if (character === '"') inString = false
      index += 1
      continue
    }
    if (character === '"') {
      inString = true
      output += character
      index += 1
      continue
    }
    if (character === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }
    if (character === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    output += character
    index += 1
  }
  return output
}

async function compatibilityOf(path) {
  const config = JSON.parse(stripJsonComments(await readFile(path, 'utf8')))
  const { compatibility_date: date, compatibility_flags: flags } = config
  if (typeof date !== 'string' || !Array.isArray(flags)) {
    throw new Error(`ไม่พบ compatibility ใน ${path}`)
  }
  return { date, flags: [...flags].sort() }
}

function fail(message, detail = '') {
  console.error(message)
  if (detail) console.error(detail)
  process.exitCode = 1
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

// nonce ที่เพิ่งสุ่มและ worker ต้องสะท้อนกลับ — service อื่นที่ครองพอร์ตนี้อยู่
// ตอบแทนไม่ได้ เพราะไม่รู้ว่าจะต้องสะท้อนอะไร
const nonce = randomUUID()
let response = null
const deadline = Date.now() + BOOT_TIMEOUT_MS
while (Date.now() < deadline) {
  if (child.exitCode !== null) break
  try {
    response = await fetch(`http://127.0.0.1:${PORT}/?nonce=${nonce}`)
    break
  } catch {
    await delay(500)
  }
}

if (!response) {
  shutdown()
  fail(`wrangler dev ไม่ตอบภายใน ${BOOT_TIMEOUT_MS / 1000}s`, log.slice(-4_000))
  process.exit(1)
}
// worker ต้องยังมีชีวิตตอนตอบ ไม่ใช่ตายไปแล้วและมีอย่างอื่นมารับแทน
const aliveAtResponse = child.exitCode === null
const status = response.status
const body = await response.json().catch(() => null)
shutdown()

if (!aliveAtResponse) fail('worker ตายก่อนที่คำตอบจะมาถึง — คำตอบนี้ไม่ใช่ของมัน', log.slice(-2_000))
if (status !== 200) fail(`HTTP ${status} ไม่ใช่ 200`)
if (body === null || typeof body !== 'object') fail('คำตอบไม่ใช่ JSON object')
if (body?.nonce !== nonce) fail(`nonce ไม่ตรง (${String(body?.nonce)}) — คำตอบไม่ได้มาจาก worker ตัวนี้`)

const checks = Array.isArray(body?.checks) ? body.checks : []
for (const check of checks) {
  console.log(`${check?.passed ? 'PASS' : 'FAIL'}  ${check?.name}: ${check?.detail}`)
}

const names = checks.map((check) => check?.name).sort()
if (names.join() !== [...REQUIRED_CHECKS].sort().join()) {
  fail('รายการ check ไม่ตรงกับที่ต้องมี', `  ได้: ${names.join(', ') || '(ว่าง)'}\n  ต้องมี: ${REQUIRED_CHECKS.join(', ')}`)
}
if (checks.some((check) => check?.passed !== true)) fail('มี check ที่ไม่ผ่าน')
if (body?.ok !== true) fail('worker รายงานว่าไม่ผ่าน')

if (process.exitCode) {
  console.error('signer ใช้ไม่ได้บน workerd')
  process.exit(1)
}
console.log(`\nworkerd: ${checks.length} checks ผ่านทั้งหมด`)
