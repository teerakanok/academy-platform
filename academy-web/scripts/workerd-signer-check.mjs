/**
 * รัน tests/workerd/signer-worker.ts บน workerd จริงผ่าน `wrangler dev`
 *
 * ชุด vitest รันบน Node ซึ่งพิสูจน์ workerd ไม่ได้ — ที่นั่น CryptoKey เป็นคนละ
 * implementation และ contract ที่เขียวใน Node เคยปฏิเสธ key ที่ถูกต้องบน workerd
 * มาแล้ว lane นี้จึงต้องกิน runtime ตัวจริงด้วย compatibility ชุดเดียวกับแอป
 *
 * ## ขอบเขตที่สคริปต์นี้ให้ และไม่ให้
 *
 * ให้: ยืนยันว่าคำตอบมาจาก worker ที่สคริปต์นี้สตาร์ทเอง (ผ่าน nonce ที่ส่งเข้าไป
 * ทาง `--var` ไม่ใช่ทาง URL ผู้ที่ครองพอร์ตอยู่จึงไม่มีทางรู้ว่าต้องตอบอะไร),
 * ว่า child ยังมีชีวิตและไม่ได้ตายด้วยสัญญาณ, ว่า HTTP เป็น 200,
 * ว่าชื่อ check ตรงรายการที่ประกาศไว้ครบถ้วนและไม่ซ้ำ, และว่าทุก check ผ่าน
 *
 * **ไม่ให้:** ความคุ้มกันจากโค้ดที่รันอยู่ในโปรเซสนี้แล้ว ใครที่ preload โค้ดเข้ามาได้
 * จะปลอม `spawn` และ `fetch` พร้อมกัน แล้วป้อนคำตอบที่ผ่านทุกด่านข้างบนได้ทั้งหมด
 * นั่นไม่ใช่ช่องโหว่ที่ปิดในโปรเซสได้ — ผู้ที่รันโค้ดในโปรเซสได้คือเจ้าของโปรเซส
 * ความน่าเชื่อถือของหลักฐานชุดนี้จึงอยู่ที่ "ใครเป็นคนสั่งรัน" ไม่ใช่ที่สคริปต์
 * (เหตุผลเดียวกับที่ archive-transfer CLI ฝั่ง director บันทึกไว้เรื่อง preload)
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
const REQUEST_TIMEOUT_MS = 30_000

/**
 * ชื่อ check ที่ต้องมีครบและตรงเป๊ะ ถ้า worker ลบ check ทิ้งแล้วยังคืน ok:true
 * รายการนี้คือสิ่งเดียวที่จับได้ — "ผ่านหมด" ที่ไม่มีอะไรรันเลยก็ "ผ่านหมด" เหมือนกัน
 * ต้องแก้ด้วยมือเมื่อเพิ่ม check ใหม่ ซึ่งตั้งใจให้เป็นแบบนั้น: ลืมแล้ว fail ดีกว่า
 * ลืมแล้วเงียบ
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
 * ตัดคอมเมนต์และ trailing comma ออกจาก JSONC ด้วยการเดินทีละตัวอักษร ไม่ใช่ regex
 *
 * รุ่นแรกยิง regex ใส่ข้อความดิบ จึงอ่านบรรทัดที่ถูกคอมเมนต์ทิ้งไว้
 * (`// "compatibility_date": "2025-03-25"`) เป็นค่าจริง แล้วรายงานว่าตรงกัน
 * ทั้งที่ config จริงเลื่อนไปแล้ว
 *
 * รุ่นถัดมายังต่างจาก Wrangler สามจุด ซึ่งรีวิวอิสระยิงให้ดูทีละอัน: BOM และ
 * trailing comma ที่ Wrangler รับแต่ตัวนี้ปฏิเสธ (lane พังทั้งที่ config ใช้ได้)
 * และคอมเมนต์บล็อกที่ไม่ปิดซึ่ง Wrangler ปฏิเสธแต่ตัวนี้รับ (lane ผ่านทั้งที่
 * deploy จริงพัง) ทั้งสามแก้แล้ว
 */
function parseJsonc(text, label) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  let output = ''
  let index = 0
  let inString = false
  while (index < source.length) {
    const character = source[index]
    if (inString) {
      output += character
      if (character === '\\') {
        output += source[index + 1] ?? ''
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
    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const closed = source.indexOf('*/', index + 2)
      if (closed === -1) throw new Error(`คอมเมนต์บล็อกไม่ถูกปิดใน ${label}`)
      index = closed + 2
      continue
    }
    output += character
    index += 1
  }
  return JSON.parse(dropTrailingCommas(output))
}

/** `,` ที่ตามด้วยช่องว่างแล้วปิดวงเล็บ — Wrangler ยอม, JSON.parse ไม่ยอม */
function dropTrailingCommas(text) {
  let output = ''
  let index = 0
  let inString = false
  while (index < text.length) {
    const character = text[index]
    if (inString) {
      output += character
      if (character === '\\') { output += text[index + 1] ?? ''; index += 2; continue }
      if (character === '"') inString = false
      index += 1
      continue
    }
    if (character === '"') { inString = true; output += character; index += 1; continue }
    if (character === ',') {
      let ahead = index + 1
      while (ahead < text.length && /\s/.test(text[ahead])) ahead += 1
      if (text[ahead] === '}' || text[ahead] === ']') { index += 1; continue }
    }
    output += character
    index += 1
  }
  return output
}

async function compatibilityOf(path) {
  const config = parseJsonc(await readFile(path, 'utf8'), path)
  const { compatibility_date: date, compatibility_flags: flags } = config
  if (typeof date !== 'string' || !Array.isArray(flags)) {
    throw new Error(`ไม่พบ compatibility ใน ${path}`)
  }
  return { date, flags: [...flags].sort() }
}

function sameNames(observed, required) {
  const left = [...observed].sort()
  const right = [...required].sort()
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((name, position) => name === right[position])
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

// nonce เดินทางเข้าไปทาง `--var` ไม่ใช่ทาง URL ผู้ที่ครองพอร์ตอยู่จึงเห็นแต่คำขอ
// ที่ไม่มีอะไรให้ลอก และเดาค่าที่ต้องสะท้อนกลับไม่ได้
const nonce = randomUUID()
const child = spawn('npx', [
  'wrangler', 'dev',
  '--config', harnessConfig,
  '--port', String(PORT),
  '--inspector-port', String(INSPECTOR_PORT),
  '--var', `SIGNER_CHECK_NONCE:${nonce}`,
  '--log-level', 'warn',
  '--show-interactive-dev-session', 'false',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })

let log = ''
child.stdout.on('data', (chunk) => { log += chunk })
child.stderr.on('data', (chunk) => { log += chunk })

const alive = () => child.exitCode === null && child.signalCode === null
const shutdown = () => { if (child.exitCode === null) child.kill('SIGTERM') }
process.on('exit', shutdown)
process.on('SIGINT', () => { shutdown(); process.exit(130) })

let response = null
const deadline = Date.now() + BOOT_TIMEOUT_MS
while (Date.now() < deadline) {
  if (!alive()) break
  try {
    // ต้องมี deadline ของตัวเอง มิฉะนั้นคำตอบที่ไม่มีวันมาถึงจะแขวนไว้ตลอดกาล
    response = await fetch(`http://127.0.0.1:${PORT}/`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
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
// ตายด้วยสัญญาณก็คือตาย: exitCode ยังเป็น null อยู่ในกรณีนั้น
const aliveAtResponse = alive()
const status = response.status
const body = await response.json().catch(() => null)
shutdown()

if (!aliveAtResponse) fail('worker ตายก่อนที่คำตอบจะมาถึง — คำตอบนี้ไม่ใช่ของมัน', log.slice(-2_000))
if (status !== 200) fail(`HTTP ${status} ไม่ใช่ 200`)
if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('คำตอบไม่ใช่ JSON object')
if (body?.nonce !== nonce) fail('nonce ไม่ตรง — คำตอบไม่ได้มาจาก worker ที่สคริปต์นี้สตาร์ท')

const checks = Array.isArray(body?.checks) ? body.checks : []
for (const check of checks) {
  console.log(`${check?.passed ? 'PASS' : 'FAIL'}  ${check?.name}: ${check?.detail}`)
}

const names = checks.map((check) => check?.name)
if (!sameNames(names, REQUIRED_CHECKS)) {
  fail('รายการ check ไม่ตรงกับที่ต้องมี', `  ได้: ${names.join(', ') || '(ว่าง)'}\n  ต้องมี: ${REQUIRED_CHECKS.join(', ')}`)
}
if (checks.some((check) => check?.passed !== true)) fail('มี check ที่ไม่ผ่าน')
if (body?.ok !== true) fail('worker รายงานว่าไม่ผ่าน')

if (process.exitCode) {
  console.error('signer ใช้ไม่ได้บน workerd')
  process.exit(1)
}
console.log(`\nworkerd: ${checks.length} checks ผ่านทั้งหมด`)
